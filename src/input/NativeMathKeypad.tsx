// src/input/NativeMathKeypad.tsx
//
// Phase 5B — MentorNest-native math keypad.
//
// First supports:
//   - integer
//   - decimal
//   - fraction (numerator + denominator with focus switching)
//   - basic operators (+, -, ×, ÷) — for short-answer integer / decimal
//   - backspace, clear, submit
//
// Adapter boundary: keypad state is exposed as a pure `value` object
// (`{ kind: "integer" | "decimal" | "fraction" | "mixed" | "operator_expr",
//    numerator, denominator, integer_part, operator, ... }`).
// The validator receives the value object — NOT a string.  Future complex
// math input (expressions, exponents, etc.) can be added without changing
// the consumer contract.

import React, { useState, useCallback, useRef, useEffect } from "react";

export type KeypadMode = "integer" | "decimal" | "fraction" | "any";

export type KeypadValue =
  | { kind: "integer"; n: number }
  | { kind: "decimal"; n: number; precision: number }
  | { kind: "fraction"; numerator: number; denominator: number }
  | { kind: "fraction_partial"; numerator: number | null; denominator: number | null }
  | { kind: "mixed"; integer_part: number; numerator: number; denominator: number }
  | { kind: "operator_expr"; raw: string }
  | { kind: "empty" };

export interface NativeMathKeypadProps {
  mode?: KeypadMode;
  /** Optional initial value (e.g. for re-edit after wrong answer). */
  initial_value?: KeypadValue;
  /** Fires on every keystroke. */
  on_change?: (value: KeypadValue) => void;
  /** Fires on submit button. The validator receives the value object. */
  on_submit: (value: KeypadValue) => void;
  /** Disable submit (e.g. while parent awaits validator). */
  submit_disabled?: boolean;
  /** Submit button label. */
  submit_label?: string;
  /**
   * Phase 5C-1.1: collapse-control.
   * If `toggleable === true`, a single "顯示 / 隱藏 數字鍵盤" ghost button
   * is rendered. `default_visible` controls initial state.
   * When `toggleable === false` (default), the keypad is always visible
   * and the collapse toggle is not shown.
   *
   * INV-CL-3 + INV-CL-4 spirit: the keypad must never dominate the
   * question card.  Mobile/tablet callers pass `default_visible = true`;
   * desktop callers pass `default_visible = false`.
   */
  toggleable?: boolean;
  default_visible?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────
// Pure keypad state machine (testable separately from React).
// ─────────────────────────────────────────────────────────────────────────

export type KeypadAction =
  | { type: "digit"; digit: number }
  | { type: "decimal_point" }
  | { type: "operator"; op: "+" | "-" | "×" | "÷" }
  | { type: "fraction_bar" }
  | { type: "backspace" }
  | { type: "clear" }
  | { type: "focus_field"; field: "integer" | "numerator" | "denominator" };

export interface KeypadState {
  value: KeypadValue;
  /** Which subfield is currently active for input. */
  active_field: "integer" | "numerator" | "denominator";
  /** String buffer for the currently active field (so user can backspace). */
  buffer: string;
}

export function keypadInitial(mode: KeypadMode = "any"): KeypadState {
  return { value: { kind: "empty" }, active_field: "integer", buffer: "" };
}

function parseFractionBuffer(numBuf: string, denBuf: string): KeypadValue {
  const n = numBuf === "" ? 0 : parseInt(numBuf, 10);
  const d = denBuf === "" ? 0 : parseInt(denBuf, 10);
  if (d === 0) {
    // Denominator zero is invalid; surface as empty fraction.
    return { kind: "empty" };
  }
  return { kind: "fraction", numerator: n, denominator: d };
}

export function keypadReduce(state: KeypadState, action: KeypadAction): KeypadState {
  switch (action.type) {
    case "clear":
      return { value: { kind: "empty" }, active_field: state.active_field, buffer: "" };

    case "backspace": {
      if (state.buffer.length > 0) {
        const nextBuf = state.buffer.slice(0, -1);
        return reduceBuffer(state, nextBuf);
      }
      // Buffer already empty — fall through to clear.
      return { value: { kind: "empty" }, active_field: state.active_field, buffer: "" };
    }

    case "focus_field":
      return { ...state, active_field: action.field, buffer: "" };

    case "decimal_point":
      // Only valid in integer/decimal mode.
      if (state.active_field !== "integer") return state;
      if (state.value.kind === "operator_expr") return state;
      if (state.buffer.includes(".")) return state;
      return { ...state, buffer: state.buffer + "." };

    case "digit": {
      // Cap input length to prevent runaway.
      if (state.buffer.length >= 8) return state;
      // For operator_expr, accumulate digits into raw without reducing
      // through parseInt (which would lose operators).
      if (state.value.kind === "operator_expr" && state.active_field === "integer") {
        const nextBuf = state.buffer + String(action.digit);
        return {
          value: { kind: "operator_expr", raw: nextBuf },
          active_field: "integer",
          buffer: nextBuf,
        };
      }
      const nextBuf = state.buffer + String(action.digit);
      return reduceBuffer(state, nextBuf);
    }

    case "operator":
      if (state.active_field !== "integer") return state;
      // For operator expressions, accumulate as raw string.
      if (state.value.kind !== "operator_expr") {
        const base = state.buffer === "" ? "0" : state.buffer;
        return {
          value: { kind: "operator_expr", raw: base + action.op },
          active_field: "integer",
          buffer: base + action.op,
        };
      }
      return {
        value: { kind: "operator_expr", raw: state.buffer + action.op },
        active_field: "integer",
        buffer: state.buffer + action.op,
      };

    case "fraction_bar":
      // Switch into fraction mode; current buffer becomes numerator.
      return {
        value: { kind: "empty" },
        active_field: "numerator",
        buffer: "",
      };
  }
}

function readOtherField(state: KeypadState): string {
  if (state.value.kind === "fraction") {
    return state.active_field === "numerator"
      ? String(state.value.denominator)
      : String(state.value.numerator);
  }
  if (state.value.kind === "fraction_partial") {
    return state.active_field === "numerator"
      ? (state.value.denominator !== null ? String(state.value.denominator) : "")
      : (state.value.numerator !== null ? String(state.value.numerator) : "");
  }
  return "";
}

function reduceBuffer(state: KeypadState, buffer: string): KeypadState {
  if (state.active_field === "integer") {
    if (buffer === "" || buffer === "-") {
      return { ...state, buffer, value: { kind: "empty" } };
    }
    if (buffer.includes(".")) {
      const n = parseFloat(buffer);
      const precision = (buffer.split(".")[1] || "").length;
      return { ...state, buffer, value: { kind: "decimal", n, precision } };
    }
    const n = parseInt(buffer, 10);
    return { ...state, buffer, value: { kind: "integer", n } };
  }
  if (state.active_field === "numerator") {
    const numBuf = buffer;
    const denBuf = readOtherField(state);
    if (denBuf === "") {
      const n = numBuf === "" ? 0 : parseInt(numBuf, 10);
      return {
        value: { kind: "fraction_partial", numerator: n, denominator: null },
        active_field: "numerator",
        buffer: numBuf,
      };
    }
    return {
      value: parseFractionBuffer(numBuf, denBuf),
      active_field: "numerator",
      buffer: numBuf,
    };
  }
  const denBuf = buffer;
  const numBuf = readOtherField(state);
  if (numBuf === "") {
    const d = denBuf === "" ? 0 : parseInt(denBuf, 10);
    return {
      value: { kind: "fraction_partial", numerator: null, denominator: d },
      active_field: "denominator",
      buffer: denBuf,
    };
  }
  return {
    value: parseFractionBuffer(numBuf, denBuf),
    active_field: "denominator",
    buffer: denBuf,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// React component
// ─────────────────────────────────────────────────────────────────────────

export function NativeMathKeypad(props: NativeMathKeypadProps) {
  const [state, setState] = useState<KeypadState>(keypadInitial());
  const [numeratorBuf, setNumeratorBuf] = useState("");
  const [denominatorBuf, setDenominatorBuf] = useState("");
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Notify parent on every change.
  useEffect(() => {
    props.on_change?.(state.value);
  }, [state.value]);

  const dispatch = useCallback((action: KeypadAction) => {
    // Clear resets both fraction buffers as well as the state machine.
    if (action.type === "clear") {
      setNumeratorBuf("");
      setDenominatorBuf("");
      setState((prev) => ({ value: { kind: "empty" }, active_field: prev.active_field, buffer: "" }));
      return;
    }
    setState((prev) => {
      // For fraction fields, the buffer logic is field-specific.  We need to
      // track numerator + denominator separately at the React level.
      if (prev.active_field === "numerator" && action.type === "digit") {
        const nextBuf = numeratorBuf.length >= 6 ? numeratorBuf : numeratorBuf + String(action.digit);
        setNumeratorBuf(nextBuf);
        // Combine both buffers into a real fraction value if denominator
        // is already entered; otherwise leave as fraction_partial.
        const newValue = denominatorBuf === ""
          ? { kind: "fraction_partial", numerator: parseInt(nextBuf, 10), denominator: null }
          : parseFractionBuffer(nextBuf, denominatorBuf);
        return { ...prev, buffer: nextBuf, value: newValue };
      }
      if (prev.active_field === "denominator" && action.type === "digit") {
        const nextBuf = denominatorBuf.length >= 6 ? denominatorBuf : denominatorBuf + String(action.digit);
        setDenominatorBuf(nextBuf);
        // Combine both buffers into a real fraction value so submit enables
        // and the validator receives a complete value.
        const newValue = parseFractionBuffer(numeratorBuf, nextBuf);
        return { ...prev, buffer: nextBuf, value: newValue };
      }
      if (prev.active_field === "numerator" && action.type === "backspace") {
        const nextBuf = numeratorBuf.slice(0, -1);
        setNumeratorBuf(nextBuf);
        const newValue = denominatorBuf === ""
          ? (nextBuf === "" ? { kind: "empty" } : { kind: "fraction_partial", numerator: parseInt(nextBuf, 10), denominator: null })
          : parseFractionBuffer(nextBuf, denominatorBuf);
        return { ...prev, buffer: nextBuf, value: newValue };
      }
      if (prev.active_field === "denominator" && action.type === "backspace") {
        const nextBuf = denominatorBuf.slice(0, -1);
        setDenominatorBuf(nextBuf);
        // If numerator is empty, backspace leaves us with a partial
        // denominator; otherwise keep full fraction.
        const newValue = numeratorBuf === ""
          ? (nextBuf === "" ? { kind: "empty" } : { kind: "fraction_partial", numerator: null, denominator: parseInt(nextBuf, 10) })
          : parseFractionBuffer(numeratorBuf, nextBuf);
        return { ...prev, buffer: nextBuf, value: newValue };
      }
      return keypadReduce(prev, action);
    });
  }, [numeratorBuf, denominatorBuf]);

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    // Keyboard equivalent for the keypad (G5 + accessibility).
    if (e.key >= "0" && e.key <= "9") {
      e.preventDefault();
      dispatch({ type: "digit", digit: parseInt(e.key, 10) });
    } else if (e.key === "." || e.key === "。") {
      e.preventDefault();
      dispatch({ type: "decimal_point" });
    } else if (e.key === "+" || e.key === "-" || e.key === "*" || e.key === "/") {
      e.preventDefault();
      const opMap: Record<string, "+" | "-" | "×" | "÷"> = {
        "+": "+", "-": "-", "*": "×", "/": "÷",
      };
      dispatch({ type: "operator", op: opMap[e.key] });
    } else if (e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      dispatch({ type: "backspace" });
    } else if (e.key === "Escape") {
      e.preventDefault();
      dispatch({ type: "clear" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (!props.submit_disabled) props.on_submit(state.value);
    } else if (e.key === "Tab" && !e.shiftKey) {
      // Tab between numerator / denominator in fraction mode.
      if (state.active_field === "numerator") {
        e.preventDefault();
        setState((s) => ({ ...s, active_field: "denominator", buffer: "" }));
        // Move actual DOM focus to denominator button so subsequent
        // keystrokes reach the keypad state machine.
        const denomBtn = document.querySelector('[data-testid="keypad-denominator"]');
        if (denomBtn instanceof HTMLElement) denomBtn.focus();
      } else if (state.active_field === "denominator") {
        e.preventDefault();
        setState((s) => ({ ...s, active_field: "numerator", buffer: "" }));
        const numBtn = document.querySelector('[data-testid="keypad-numerator"]');
        if (numBtn instanceof HTMLElement) numBtn.focus();
      }
    }
  }, [dispatch, numeratorBuf, denominatorBuf, props.submit_disabled, state.value, state.active_field]);

  const renderValueDisplay = () => {
    if (state.value.kind === "fraction" || state.value.kind === "fraction_partial") {
      return (
        <div className="mn-keypad__fraction-bar" role="group" aria-label="分數">
          <span className="mn-keypad__fraction-bar-num">{numeratorBuf || "?"}</span>
          <span className="mn-keypad__fraction-bar-den">{denominatorBuf || "?"}</span>
        </div>
      );
    }
    if (state.value.kind === "operator_expr") {
      return state.value.raw;
    }
    if (state.value.kind === "empty") {
      return "0";
    }
    return String(state.value.n);
  };

  const displayIsEmpty = state.value.kind === "empty" || state.value.kind === "fraction_partial";

  // Phase 5C-1.1 — collapse control (child input contract).
  const collapsible = props.toggleable === true;
  const [visible, setVisible] = useState<boolean>(props.default_visible ?? true);

  // Sync visible state if `default_visible` changes (e.g. parent hook
  // re-measures viewport after mount).  We only follow the prop when
  // the user has not yet manually toggled.
  const [userToggled, setUserToggled] = useState(false);
  useEffect(() => {
    if (userToggled) return;
    setVisible(props.default_visible ?? true);
  }, [props.default_visible, userToggled]);

  // Wrap setters so we know when the user has expressed an opinion.
  const setVisibleAndMark = useCallback((v: boolean | ((prev: boolean) => boolean)) => {
    setUserToggled(true);
    setVisible(v);
  }, []);

  // When the keypad is hidden, render only the toggle button + a short
  // status hint.  Otherwise render the full keypad.
  if (collapsible && !visible) {
    return (
      <div className="mn-keypad mn-keypad--collapsed" data-testid="native-math-keypad" data-mode={props.mode ?? "any"} data-collapsed="true">
        <button
          type="button"
          className="mn-button mn-button--ghost mn-keypad__toggle"
          data-testid="keypad-toggle"
          aria-expanded={false}
          aria-controls="native-math-keypad-panel"
          onClick={() => setVisibleAndMark(true)}
        >
          顯示數字鍵盤
        </button>
        <p className="mn-keypad__hint" id="native-math-keypad-panel-hint">
          你也可以直接用裝置的鍵盤輸入。
        </p>
      </div>
    );
  }

  return (
    <div
      className="mn-keypad"
      role="group"
      aria-label="數字鍵盤"
      onKeyDownCapture={handleKey}
      tabIndex={-1}
      data-testid="native-math-keypad"
      data-mode={props.mode ?? "any"}
      data-value-kind={state.value.kind}
      data-display-empty={displayIsEmpty}
      id="native-math-keypad-panel"
      aria-describedby={collapsible ? "native-math-keypad-panel-hint" : undefined}
    >
      {collapsible && (
        <div className="mn-keypad__toolbar">
          <button
            type="button"
            className="mn-button mn-button--ghost mn-keypad__toggle"
            data-testid="keypad-toggle"
            aria-expanded={true}
            aria-controls="native-math-keypad-panel"
            onClick={() => setVisibleAndMark(false)}
          >
            隱藏數字鍵盤
          </button>
          <p className="mn-keypad__hint" id="native-math-keypad-panel-hint">
            你也可以直接用裝置的鍵盤輸入。
          </p>
        </div>
      )}
      <div
        className="mn-keypad__display"
        aria-live="polite"
        aria-atomic="true"
        data-testid="keypad-display"
      >
        <div className="mn-keypad__field-row" data-active={state.active_field === "numerator"}>
          <span className="mn-keypad__display-label">分子</span>
          <button
            type="button"
            className="mn-keypad__field-button"
            data-active={state.active_field === "numerator"}
            onClick={() => dispatch({ type: "focus_field", field: "numerator" })}
            aria-label="分子"
            data-testid="keypad-numerator"
          >
            {numeratorBuf || "—"}
          </button>
        </div>
        <div className="mn-keypad__field-row" data-active={state.active_field === "denominator"}>
          <span className="mn-keypad__display-label">分母</span>
          <button
            type="button"
            className="mn-keypad__field-button"
            data-active={state.active_field === "denominator"}
            onClick={() => dispatch({ type: "focus_field", field: "denominator" })}
            aria-label="分母"
            data-testid="keypad-denominator"
          >
            {denominatorBuf || "—"}
          </button>
        </div>
        <div className="mn-keypad__display-row" data-testid="keypad-preview" data-empty={displayIsEmpty}>
          <span className="mn-keypad__display-label">結果</span>
          <span className="mn-keypad__display-value">{renderValueDisplay()}</span>
        </div>
      </div>

      <div className="mn-keypad__keypad" role="group" aria-label="按鍵">
        {KEYPAD_KEYS.map((row, ri) => (
          <React.Fragment key={ri}>
            {row.map((key) => (
              <button
                key={key.id}
                ref={(el) => { buttonRefs.current[key.id] = el; }}
                type="button"
                className="mn-keypad__key"
                data-variant={key.variant ?? "default"}
                data-testid={`keypad-key-${key.id}`}
                onClick={() => dispatch(key.action)}
              >
                {key.label}
              </button>
            ))}
          </React.Fragment>
        ))}
      </div>

      <button
        type="button"
        className="mn-keypad__key mn-keypad__key--submit"
        data-variant="primary"
        data-testid="keypad-submit"
        disabled={props.submit_disabled || displayIsEmpty}
        onClick={() => props.on_submit(state.value)}
      >
        {props.submit_label ?? "送出"}
      </button>
    </div>
  );
}

// Keypad key definitions (4-column grid).
const KEYPAD_KEYS: Array<Array<{
  id: string;
  label: string;
  variant?: "primary" | "danger" | "default";
  action: KeypadAction;
}>> = [
  [
    { id: "7", label: "7", action: { type: "digit", digit: 7 } },
    { id: "8", label: "8", action: { type: "digit", digit: 8 } },
    { id: "9", label: "9", action: { type: "digit", digit: 9 } },
    { id: "backspace", label: "⌫", variant: "danger", action: { type: "backspace" } },
  ],
  [
    { id: "4", label: "4", action: { type: "digit", digit: 4 } },
    { id: "5", label: "5", action: { type: "digit", digit: 5 } },
    { id: "6", label: "6", action: { type: "digit", digit: 6 } },
    { id: "clear", label: "清除", variant: "danger", action: { type: "clear" } },
  ],
  [
    { id: "1", label: "1", action: { type: "digit", digit: 1 } },
    { id: "2", label: "2", action: { type: "digit", digit: 2 } },
    { id: "3", label: "3", action: { type: "digit", digit: 3 } },
    { id: "frac", label: "分數", action: { type: "fraction_bar" } },
  ],
  [
    { id: "0", label: "0", action: { type: "digit", digit: 0 } },
    { id: ".", label: ".", action: { type: "decimal_point" } },
    { id: "+", label: "+", action: { type: "operator", op: "+" } },
    { id: "-", label: "−", action: { type: "operator", op: "-" } },
  ],
];

export const __TEST_KEYPAD__ = { keypadReduce, keypadInitial, parseFractionBuffer };

// src/input/keypad-state.mjs
//
// Phase 5B — Pure state-machine mirror of NativeMathKeypad.tsx so unit
// tests can import it with node --test (no TS transpilation required).
//
// MUST stay in lock-step with the TSX reducer.  If you change the
// reducer behavior, change both files.

export function keypadInitial(mode = "any") {
  return { value: { kind: "empty" }, active_field: "integer", buffer: "" };
}

export function parseFractionBuffer(numBuf, denBuf) {
  const n = numBuf === "" ? 0 : parseInt(numBuf, 10);
  const d = denBuf === "" ? 0 : parseInt(denBuf, 10);
  if (d === 0) return { kind: "empty" };
  return { kind: "fraction", numerator: n, denominator: d };
}

function readOtherField(state) {
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

function reduceBuffer(state, buffer) {
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

export function keypadReduce(state, action) {
  switch (action.type) {
    case "clear":
      return { value: { kind: "empty" }, active_field: state.active_field, buffer: "" };
    case "backspace": {
      if (state.buffer.length > 0) {
        const nextBuf = state.buffer.slice(0, -1);
        return reduceBuffer(state, nextBuf);
      }
      return { value: { kind: "empty" }, active_field: state.active_field, buffer: "" };
    }
    case "focus_field":
      return { ...state, active_field: action.field, buffer: "" };
    case "decimal_point":
      if (state.active_field !== "integer") return state;
      if (state.value.kind === "operator_expr") return state;
      if (state.buffer.includes(".")) return state;
      return { ...state, buffer: state.buffer + "." };
    case "digit": {
      if (state.buffer.length >= 8) return state;
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
      return {
        value: { kind: "empty" },
        active_field: "numerator",
        buffer: "",
      };
  }
  return state;
}

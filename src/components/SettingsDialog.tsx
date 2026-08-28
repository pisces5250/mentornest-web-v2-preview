// src/components/SettingsDialog.tsx
//
// Phase 5C-1.1 Round 4 — Quiet Graph Settings modal.
//
// Quiet Graph language: single elevation shadow, 2 px corner radius,
// hairline border, hairline divider between header and body.  Options
// are full-width rows; the selected option gets a 2 px moss border.
//
// Accessibility contract preserved:
//   - focus trap while open (Tab cycles within the dialog)
//   - closing returns focus to the gear button
//   - ESC closes
//   - aria-modal + role=dialog + labelledby
//   - color-vision-safe + high-contrast + reduced-motion inherited from
//     body via [data-mode] / @media rules in app.css
//   - keyboard shortcuts default OFF (HD-WV2-3)
//
// NO new design tokens; uses existing --mn-qg-* variables.

import React, { useCallback, useEffect, useRef } from "react";

export type ColorMode = "default" | "high-contrast" | "color-vision-safe";

export interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  currentMode: ColorMode;
  onModeChange: (mode: ColorMode) => void;
  returnFocusRef: React.RefObject<HTMLElement>;
}

const MODES: Array<{ value: ColorMode; label: string; description: string }> = [
  { value: "default",          label: "預設",     description: "一般的顯示方式" },
  { value: "high-contrast",    label: "高對比",   description: "加深顏色對比，文字更清楚" },
  { value: "color-vision-safe", label: "色覺安全", description: "調整顏色，讓色弱的朋友也看得清楚" },
];

export function SettingsDialog(props: SettingsDialogProps) {
  const { open, onClose, currentMode, onModeChange, returnFocusRef } = props;
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = "settings-dialog-title";
  const descId = "settings-dialog-desc";

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      "button, [href], input, [tabindex]:not([tabindex='-1'])"
    );
    const first = focusables[0];
    first?.focus();

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      if (!first) return;
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handler);
    return () => {
      document.removeEventListener("keydown", handler);
      (returnFocusRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose, returnFocusRef]);

  if (!open) return null;

  return (
    <div
      className="mn-settings-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="mn-settings-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        data-testid="settings-dialog"
      >
        <header className="mn-settings-dialog__header">
          <h2 id={titleId} className="mn-settings-dialog__title">顯示設定</h2>
          <button
            type="button"
            className="mn-settings-dialog__close"
            aria-label="關閉設定"
            data-testid="settings-close"
            onClick={onClose}
          >×</button>
        </header>
        <p id={descId} className="mn-settings-dialog__desc">
          選擇適合你的顯示方式。
        </p>
        <fieldset className="mn-settings-dialog__modes" role="radiogroup" aria-label="顯示方式">
          <legend className="mn-sr-only">顯示方式</legend>
          {MODES.map((m) => (
            <label key={m.value} className="mn-settings-dialog__mode-option">
              <input
                type="radio"
                name="mn-color-mode"
                value={m.value}
                checked={currentMode === m.value}
                onChange={() => onModeChange(m.value)}
                data-testid={`mode-${m.value}`}
              />
              <span className="mn-settings-dialog__mode-label">{m.label}</span>
              <span className="mn-settings-dialog__mode-desc">{m.description}</span>
            </label>
          ))}
        </fieldset>
      </div>
    </div>
  );
}

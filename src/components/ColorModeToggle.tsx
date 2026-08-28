import React, { useState, useEffect } from "react";

type Mode = "default" | "high-contrast" | "color-vision-safe";

const MODES: Array<{ value: Mode; label: string }> = [
  { value: "default", label: "預設" },
  { value: "high-contrast", label: "高對比" },
  { value: "color-vision-safe", label: "色覺安全" },
];

export function ColorModeToggle() {
  const [mode, setMode] = useState<Mode>("default");
  useEffect(() => {
    if (mode === "default") {
      document.documentElement.removeAttribute("data-mode");
    } else {
      document.documentElement.setAttribute("data-mode", mode);
    }
  }, [mode]);
  return (
    <div className="mn-mode-toggle" role="group" aria-label="色彩模式">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          aria-pressed={mode === m.value}
          onClick={() => setMode(m.value)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
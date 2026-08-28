// src/components/ColorMode.tsx
//
// Phase 5C-1.1 — Color-mode controller.
//
// Single source of truth for the [data-mode] attribute on <html>.  Replaces
// the inline effect in ColorModeToggle.tsx so the same controller can be
// consumed from App.tsx, the SettingsDialog, and any future consumer.
//
// All mode changes are persisted via localStorage so they survive reload.

import React, { useCallback, useEffect, useState } from "react";
import type { ColorMode } from "./SettingsDialog";

const STORAGE_KEY = "mentornest.color-mode.v1";

function readStoredMode(): ColorMode {
  if (typeof window === "undefined") return "default";
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === "default" || raw === "high-contrast" || raw === "color-vision-safe") {
      return raw;
    }
  } catch (e) {
    // ignore
  }
  return "default";
}

function applyMode(mode: ColorMode) {
  if (typeof document === "undefined") return;
  if (mode === "default") {
    document.documentElement.removeAttribute("data-mode");
  } else {
    document.documentElement.setAttribute("data-mode", mode);
  }
}

export interface ColorModeControllerProps {
  children: (api: {
    mode: ColorMode;
    setMode: (m: ColorMode) => void;
  }) => React.ReactNode;
}

export function ColorModeController(props: ColorModeControllerProps) {
  const [mode, setModeState] = useState<ColorMode>(() => readStoredMode());

  // Apply on mount + on change.
  useEffect(() => {
    applyMode(mode);
  }, [mode]);

  const setMode = useCallback((m: ColorMode) => {
    setModeState(m);
    try {
      window.localStorage.setItem(STORAGE_KEY, m);
    } catch (e) {
      // ignore
    }
  }, []);

  return <>{props.children({ mode, setMode })}</>;
}

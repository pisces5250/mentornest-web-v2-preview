// src/foundation/use_keypad_visibility.ts
//
// Phase 5C-1.1 Round 5 — Decide whether the on-screen numeric keypad
// should default to visible or hidden.
//
// Phone (≤480px): default COLLAPSED.  The OS already provides a
//   software keyboard for touch typing; an additional on-screen 4x4
//   grid is mostly visual noise and eats vertical space.
// Tablet (481-900px): default EXPANDED.  Touch-only, no OS keyboard.
// Desktop (>900px): default COLLAPSED.  Physical keyboard is faster.
//
// Returns the default visibility boolean; the keypad component still
// tracks user override via its own toggle state.
//
// SSR-safe: returns the desktop (collapsed) default on the server, then
// updates after mount.

import { useEffect, useState } from "react";

const TABLET_QUERY = "(min-width: 481px) and (max-width: 900px)";

export function useKeypadVisibility(): boolean {
  const [shouldExpand, setShouldExpand] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(TABLET_QUERY);
    const update = () => setShouldExpand(mql.matches);
    update();
    if (mql.addEventListener) mql.addEventListener("change", update);
    else mql.addListener(update);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", update);
      else mql.removeListener(update);
    };
  }, []);

  return shouldExpand;
}
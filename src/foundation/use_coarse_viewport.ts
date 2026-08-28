// src/foundation/use_coarse_viewport.ts
//
// Phase 5C-1.1 — Detect a coarse / small viewport so the keypad can
// default-open on touch devices and default-collapse on desktops.
//
// We use (pointer: coarse) OR (max-width: 900px).  This is intentionally
// generous — tablets often report (pointer: fine) with mouse connected,
// and we still want a more touch-friendly default there.
//
// SSR-safe: returns false on the server / first paint, then updates
// after mount.

import { useEffect, useState } from "react";

const QUERY = "(pointer: coarse), (max-width: 900px)";

export function useCoarseViewport(): boolean {
  const [isCoarse, setIsCoarse] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(QUERY);
    const update = () => setIsCoarse(mql.matches);
    update();
    // Older Safari uses addListener.
    if (mql.addEventListener) mql.addEventListener("change", update);
    else mql.addListener(update);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener("change", update);
      else mql.removeListener(update);
    };
  }, []);

  return isCoarse;
}

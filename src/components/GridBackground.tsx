// src/components/GridBackground.tsx
//
// Phase 5C-1.1 Round 4 — Quiet Graph visual language.
//
// Renders the page-wide grid as a single fixed-position SVG element. The
// grid sits behind every interactive surface; pointer events pass through
// (aria-hidden + pointer-events: none in CSS). It honors the user's
// [data-mode="high-contrast"] and [data-mode="color-vision-safe"] modes:
// in either accessibility mode the grid is suppressed so structural
// devices (hairlines, dividers, accent bars) carry the visual weight
// instead.
//
// Density, spacing, line weight, and rendering technique are at the
// designer's discretion (per sign-off 2026-08-28 13:29 UTC). This
// component commits to:
//   - 16px interval (matches the spacing scale's 8px step × 2)
//   - 1px line, color #C9C2B2 (very low contrast against #F4F1EA)
//   - single inline SVG, 64×64 tile, repeated via background-image
//   - hidden when prefers-contrast: more OR when [data-mode!="default"]
//
// We use a CSS background-image (data URL) instead of an actual <svg>
// in the DOM so the grid costs zero rendering nodes and never
// interferes with focus, hit testing, or accessibility trees.

import React from "react";

// Inline 64×64 SVG with a 16px grid. The svg+xml data URI is small
// enough to be a CSS background without measurable cost.
const GRID_SVG_DATA_URI =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64' viewBox='0 0 64 64'>
      <path d='M64 0 L0 0 L0 64' fill='none' stroke='#C9C2B2' stroke-width='1'/>
      <path d='M16 0 L16 64 M32 0 L32 64 M48 0 L48 64 M0 16 L64 16 M0 32 L64 32 M0 48 L64 48' fill='none' stroke='#D9D2BF' stroke-width='0.5' opacity='0.55'/>
    </svg>`
  );

export function GridBackground() {
  return (
    <div
      className="mn-grid-background"
      aria-hidden="true"
      data-testid="grid-background"
    />
  );
}

// Exported so it can be reused in Storybook / tests if needed.
export const GRID_BACKGROUND_IMAGE = `url("${GRID_SVG_DATA_URI}")`;

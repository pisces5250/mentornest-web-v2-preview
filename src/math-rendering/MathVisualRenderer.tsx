// src/math-rendering/MathVisualRenderer.tsx
//
// Phase 5B — Controlled React renderer for math visuals.
//
// Rules (per R3 + per user constraint):
//   - math_visual_engine_render is AUTHORITATIVE for the visual semantics.
//     This component only controls layout / chrome (figure border, caption,
//     aria, responsive viewBox handling, role/aria attributes).
//   - SVG string is consumed from math_visual_engine.generateVisualSVG(primitive, descriptor).
//   - SVG is sanitized before injection (whitelisted elements + attributes only).
//     The sanitizer lives in svg-sanitizer.mjs (pure ESM, unit-testable).
//   - No arbitrary external SVG/script/style injection.
//   - Responsive viewBox handling: outer wrapper uses 100% width; inner
//     SVG keeps its native viewBox.
//   - Accessible title / description forwarded as screen-reader-only <span>
//     so the inner SVG can remain aria-hidden=true (decorative).
//   - Keyboard + screen-reader safe.
//
// Supported primitives: fraction_bar, number_line, area_model.

import React from "react";
import { sanitizeSvg, filterAttrs } from "./svg-sanitizer.mjs";

type Primitive = "fraction_bar" | "number_line" | "area_model" | "bar_model";

export interface MathVisualDescriptor {
  type: Primitive;
  version?: number;
  numerator?: number | null;
  denominator?: number | null;
  splits?: Array<{ from: number; to: number; label?: string | null }>;
  label?: string | null;
  from?: number;
  to?: number;
  marks?: Array<{ value: number; label?: string | null; kind?: string }>;
  highlight?: number | null;
  rows?: number;
  cols?: number;
}

export interface MathVisualRendererProps {
  primitive: Primitive;
  descriptor: MathVisualDescriptor;
  svg: string;
  aria_label: string;
  aria_description?: string;
  caption?: string;
  aspect_ratio?: "16/9" | "4/3" | "1/1" | "3/2" | "auto";
  variant?: "default" | "minimal" | "emphasis";
}

const ASPECT_RATIOS: Record<NonNullable<MathVisualRendererProps["aspect_ratio"]>, string> = {
  "16/9": "16 / 9",
  "4/3": "4 / 3",
  "1/1": "1 / 1",
  "3/2": "3 / 2",
  "auto": "auto",
};

export function MathVisualRenderer(props: MathVisualRendererProps) {
  const sanitizeResult = sanitizeSvg(props.svg);

  if (!sanitizeResult.ok) {
    return (
      <div role="alert" className="mn-math-visual mn-math-visual--error" data-testid="math-visual-error">
        圖示無法顯示（{sanitizeResult.reason}）
      </div>
    );
  }

  const variantClass =
    props.variant === "minimal" ? "mn-math-visual--minimal" :
    props.variant === "emphasis" ? "mn-math-visual--emphasis" :
    "";

  const aspect = ASPECT_RATIOS[props.aspect_ratio ?? "16/9"];

  const descId = `mn-mv-desc-${props.primitive}-${Math.abs(hashStr(props.aria_label)) % 1_000_000}`;

  return (
    <figure className={`mn-math-visual ${variantClass}`} data-testid="math-visual">
      <div className="mn-math-visual__frame" style={{ aspectRatio: aspect }}>
        <div
          className="mn-math-visual__svg-wrap"
          aria-hidden="true"
          // dangerouslySetInnerHTML is safe BECAUSE we sanitized above.
          dangerouslySetInnerHTML={{ __html: sanitizeResult.sanitized ?? "" }}
        />
      </div>
      {props.caption && (
        <figcaption className="mn-math-visual__caption">{props.caption}</figcaption>
      )}
      <span id={descId} className="mn-sr-only" data-testid="math-visual-sr">
        {props.aria_label}{props.aria_description ? `。${props.aria_description}` : ""}
      </span>
    </figure>
  );
}

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

export const __TEST__ = { sanitizeSvg, filterAttrs };

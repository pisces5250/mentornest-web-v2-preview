// src/math-rendering/math_visual_engine_render.mjs
//
// ════════════════════════════════════════════════════════════════════════════
// PREVIEW COMPATIBILITY IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════
//
// Standalone re-implementation of the math-visual descriptor + SVG contract
// used by the production mentornest-learning plugin
// (plugins/mentornest-learning/lib/math_visual_engine.mjs).
//
// SCOPE — what this file DOES cover:
//   - renderFractionBar({ numerator, denominator, label? })
//   - renderNumberLine({ from, to, marks? })
//   - renderBarModel({ rows, cols, label? })
//   - generateVisualSVG(primitive, descriptor)
//   - svgValidityCheck(svg) → { valid, reason }
//
// SCOPE — what this file does NOT cover:
//   - learning record writes
//   - knowledge-point routing / hint escalation
//
// DESIGN INVARIANT — math_visual_engine_render REMAINS AUTHORITATIVE:
//   The descriptor schema + SVG output contract documented here is the
//   authoritative contract for all mentornest-web-v2 visual surfaces.
//   The production plugin must conform to this contract; if production
//   changes, this file is the source of truth for the standalone preview
//   and must be updated to match.
//
// All SVG output is whitelist-safe (no <script>, <style>, <foreignObject>,
// no on* handlers). The output satisfies our own svg-sanitizer as well
// as svgValidityCheck below.

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"';

/* ──────────────────────────────────────────────────────────────────────────
 * Validation helpers
 * ────────────────────────────────────────────────────────────────────────── */

function isPositiveInt(n) {
  return Number.isInteger(n) && n > 0;
}

function isNonNegativeInt(n) {
  return Number.isInteger(n) && n >= 0;
}

function escapeXml(s) {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/* ──────────────────────────────────────────────────────────────────────────
 * Builders — return { descriptor, constraints_check }
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * Build a fraction_bar descriptor.
 *
 * @param {{ numerator: number, denominator: number, label?: string|null }}
 * @returns {{ descriptor: object, constraints_check: { ok: boolean, reason?: string } }}
 */
export function renderFractionBar(input) {
  const numerator = Number(input?.numerator);
  const denominator = Number(input?.denominator);
  const label = input?.label ?? null;

  if (!isNonNegativeInt(numerator)) {
    return {
      descriptor: { type: "fraction_bar", version: 1, numerator, denominator, label },
      constraints_check: { ok: false, reason: "numerator-not-non-negative-integer" },
    };
  }
  if (!isPositiveInt(denominator)) {
    return {
      descriptor: { type: "fraction_bar", version: 1, numerator, denominator, label },
      constraints_check: { ok: false, reason: "denominator-not-positive-integer" },
    };
  }

  return {
    descriptor: { type: "fraction_bar", version: 1, numerator, denominator, label },
    constraints_check: { ok: true },
  };
}

/**
 * Build a number_line descriptor.
 *
 * @param {{ from: number, to: number, marks?: Array }}
 */
export function renderNumberLine(input) {
  const from = Number(input?.from);
  const to = Number(input?.to);
  const marks = Array.isArray(input?.marks) ? input.marks : [];

  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    return {
      descriptor: { type: "number_line", version: 1, from, to, marks, highlight: input?.highlight ?? null },
      constraints_check: { ok: false, reason: "from-or-to-not-finite" },
    };
  }
  if (from >= to) {
    return {
      descriptor: { type: "number_line", version: 1, from, to, marks, highlight: input?.highlight ?? null },
      constraints_check: { ok: false, reason: "from-must-be-less-than-to" },
    };
  }
  for (const m of marks) {
    if (!Number.isFinite(m?.value)) {
      return {
        descriptor: { type: "number_line", version: 1, from, to, marks, highlight: input?.highlight ?? null },
        constraints_check: { ok: false, reason: "mark-value-not-finite" },
      };
    }
  }

  return {
    descriptor: { type: "number_line", version: 1, from, to, marks, highlight: input?.highlight ?? null },
    constraints_check: { ok: true },
  };
}

/**
 * Build a bar_model descriptor.
 *
 * Accepts either:
 *   { rows, cols }                       — integer grid
 *   { rows, cols, label }                — with optional label
 *
 * Note: this is the closest builder primitive for area_model. area_model
 * visuals are produced by passing a descriptor with `type: "area_model"`
 * directly to generateVisualSVG (see also g5_fraction_add_unlike_denom
 * test for an example).
 */
export function renderBarModel(input) {
  const rows = Number(input?.rows);
  const cols = Number(input?.cols);
  const label = input?.label ?? null;

  if (!isPositiveInt(rows) || !isPositiveInt(cols)) {
    return {
      descriptor: { type: "bar_model", version: 1, rows, cols, label },
      constraints_check: { ok: false, reason: "rows-or-cols-not-positive-integer" },
    };
  }
  return {
    descriptor: { type: "bar_model", version: 1, rows, cols, label },
    constraints_check: { ok: true, note: "bar_model is descriptor-only; pass to generateVisualSVG" },
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * SVG generators
 * ────────────────────────────────────────────────────────────────────────── */

function svgFractionBar(d) {
  const { numerator, denominator, label } = d;
  const width = 240;
  const height = 60;
  const padX = 8;
  const padY = 8;
  const barY = padY + 8;
  const barH = height - padY * 2 - 16;
  const barW = width - padX * 2;
  const tickW = barW / denominator;

  const ticks = [];
  for (let i = 1; i < denominator; i++) {
    ticks.push(`<line x1="${padX + i * tickW}" y1="${barY}" x2="${padX + i * tickW}" y2="${barY + barH}" stroke="#bbb" stroke-width="1"/>`);
  }
  const filled = [];
  for (let i = 0; i < numerator; i++) {
    const x = padX + i * tickW;
    filled.push(`<rect x="${x.toFixed(2)}" y="${barY}" width="${tickW.toFixed(2)}" height="${barH}" fill="#7aa2ff" opacity="0.55"/>`);
  }
  const labelStr = label ? `${escapeXml(label)}` : `${numerator}/${denominator}`;

  return `<svg ${SVG_NS} viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(labelStr)}">
  <rect x="${padX}" y="${barY}" width="${barW}" height="${barH}" fill="#f3f4f6" stroke="#374151" stroke-width="1.5"/>
  ${ticks.join("\n  ")}
  ${filled.join("\n  ")}
  <text x="${width / 2}" y="${height - 4}" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#111">${labelStr}</text>
</svg>`;
}

function svgNumberLine(d) {
  const { from, to, marks = [] } = d;
  const width = 280;
  const height = 60;
  const padX = 16;
  const padY = 20;
  const lineY = height / 2;
  const lineW = width - padX * 2;
  const span = to - from;
  const project = (v) => padX + ((v - from) / span) * lineW;

  const tickSvg = marks.map((m) => {
    const x = project(m.value);
    const label = m.label != null ? escapeXml(m.label) : String(m.value);
    return `<circle cx="${x.toFixed(2)}" cy="${lineY}" r="4" fill="#7aa2ff"/>
      <text x="${x.toFixed(2)}" y="${lineY + 18}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#111">${label}</text>`;
  }).join("\n  ");

  return `<svg ${SVG_NS} viewBox="0 0 ${width} ${height}" role="img" aria-label="number line from ${from} to ${to}">
  <line x1="${padX}" y1="${lineY}" x2="${width - padX}" y2="${lineY}" stroke="#374151" stroke-width="1.5"/>
  ${tickSvg}
</svg>`;
}

function svgBarModel(d) {
  const { rows, cols, label } = d;
  const cellSize = 24;
  const padX = 8;
  const padY = 8;
  const width = padX * 2 + cols * cellSize;
  const height = padY * 2 + rows * cellSize + (label ? 22 : 0);

  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellSize;
      const y = padY + r * cellSize;
      rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="none" stroke="#374151" stroke-width="1"/>`);
    }
  }
  const labelStr = label ? `<text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#111">${escapeXml(label)}</text>` : "";

  return `<svg ${SVG_NS} viewBox="0 0 ${width} ${height}" role="img" aria-label="bar model ${rows} by ${cols}">
  ${rects.join("\n  ")}
  ${labelStr}
</svg>`;
}

function svgAreaModel(d) {
  // area_model: same as bar_model but with explicit label derived from rows*cols.
  const { rows, cols, label } = d;
  const cellSize = 28;
  const padX = 8;
  const padY = 8;
  const width = padX * 2 + cols * cellSize;
  const height = padY * 2 + rows * cellSize + 22;

  const rects = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = padX + c * cellSize;
      const y = padY + r * cellSize;
      rects.push(`<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="#fff7d6" stroke="#b08900" stroke-width="1"/>`);
    }
  }
  const labelStr = label || `${rows * cols} 格`;
  return `<svg ${SVG_NS} viewBox="0 0 ${width} ${height}" role="img" aria-label="area model ${rows} by ${cols}">
  ${rects.join("\n  ")}
  <text x="${width / 2}" y="${height - 6}" text-anchor="middle" font-family="sans-serif" font-size="12" fill="#111">${escapeXml(labelStr)}</text>
</svg>`;
}

/**
 * Generate the SVG string for a given primitive + descriptor.
 *
 * Returns { svg, validity } so callers can short-circuit on bad input.
 */
export function generateVisualSVG(primitive, descriptor) {
  if (!descriptor || typeof descriptor !== "object") {
    return { svg: "", validity: { valid: false, reason: "missing-descriptor" } };
  }

  let svg = "";
  switch (primitive) {
    case "fraction_bar": {
      if (!isNonNegativeInt(descriptor.numerator) || !isPositiveInt(descriptor.denominator)) {
        return { svg: "", validity: { valid: false, reason: "fraction-bar-invalid-numerator-or-denominator" } };
      }
      svg = svgFractionBar(descriptor);
      break;
    }
    case "number_line": {
      if (!Number.isFinite(descriptor.from) || !Number.isFinite(descriptor.to) || descriptor.from >= descriptor.to) {
        return { svg: "", validity: { valid: false, reason: "number-line-invalid-range" } };
      }
      svg = svgNumberLine(descriptor);
      break;
    }
    case "bar_model": {
      if (!isPositiveInt(descriptor.rows) || !isPositiveInt(descriptor.cols)) {
        return { svg: "", validity: { valid: false, reason: "bar-model-invalid-rows-or-cols" } };
      }
      svg = svgBarModel(descriptor);
      break;
    }
    case "area_model": {
      if (!isPositiveInt(descriptor.rows) || !isPositiveInt(descriptor.cols)) {
        return { svg: "", validity: { valid: false, reason: "area-model-invalid-rows-or-cols" } };
      }
      svg = svgAreaModel(descriptor);
      break;
    }
    default:
      return { svg: "", validity: { valid: false, reason: `unknown-primitive:${primitive}` } };
  }

  return { svg, validity: svgValidityCheck(svg) };
}

/**
 * Convenience wrappers for direct SVG string generation from a builder
 * input (mirrors production's generateFractionBarSVG / generateNumberLineSVG
 * / generateAreaModelSVG).
 */
export function generateFractionBarSVG(input) {
  const { descriptor, constraints_check } = renderFractionBar(input);
  if (!constraints_check.ok) return { svg: "", validity: { valid: false, reason: constraints_check.reason } };
  return generateVisualSVG("fraction_bar", descriptor);
}

export function generateNumberLineSVG(input) {
  const { descriptor, constraints_check } = renderNumberLine(input);
  if (!constraints_check.ok) return { svg: "", validity: { valid: false, reason: constraints_check.reason } };
  return generateVisualSVG("number_line", descriptor);
}

export function generateAreaModelSVG(input) {
  const { descriptor } = renderBarModel(input);
  return generateVisualSVG("area_model", descriptor);
}

/**
 * Lightweight structural validity check for our SVG output.
 * Ensures:
 *   - non-empty string
 *   - contains exactly one <svg ...> opening tag
 *   - contains exactly one </svg> closing tag
 *   - does NOT contain <script>, <style>, <foreignObject>, or on*= handlers
 */
export function svgValidityCheck(svg) {
  if (typeof svg !== "string" || svg.length === 0) {
    return { valid: false, reason: "empty-or-non-string" };
  }
  const opens = (svg.match(/<svg\b/g) ?? []).length;
  const closes = (svg.match(/<\/svg>/g) ?? []).length;
  if (opens !== 1 || closes !== 1) {
    return { valid: false, reason: "svg-tag-count-mismatch" };
  }
  if (/<script\b/i.test(svg)) return { valid: false, reason: "contains-script" };
  if (/<style\b/i.test(svg))  return { valid: false, reason: "contains-style" };
  if (/<foreignObject\b/i.test(svg)) return { valid: false, reason: "contains-foreign-object" };
  if (/\son[a-z]+\s*=/i.test(svg)) return { valid: false, reason: "contains-on-handler" };
  return { valid: true };
}

export const __TEST__ = {
  renderFractionBar, renderNumberLine, renderBarModel,
  generateVisualSVG,
  generateFractionBarSVG, generateNumberLineSVG, generateAreaModelSVG,
  svgValidityCheck,
};

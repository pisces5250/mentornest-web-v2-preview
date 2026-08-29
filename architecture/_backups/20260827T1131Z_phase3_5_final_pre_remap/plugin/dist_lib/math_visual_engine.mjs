// math_visual_engine.mjs
//
// Pure descriptor-based visual primitives for math. Phase 3 sub-session A.
//
// All renderers return PLAIN DESCRIPTORS (data structures), never raw SVG /
// canvas strings. The MentorNest Web lesson renderer turns these descriptors
// into pixels at render time. This keeps the plugin pure and deterministic
// and avoids serialization issues (SVG strings may contain PII if a label is
// treated as text); here every descriptor is a small JSON tree.
//
// Inputs that resolve to NaN, Infinity, negative denominators, or non-finite
// floats are rejected via a shared constraint_check. Rejection is non-throwing
// by default; tools can opt in to strict mode via the input param.

const NON_FINITE = (n) => !Number.isFinite(n);
const IS_INT = (n) => Number.isInteger(n);

function constraintsOk(record) {
  return {
    ok: !record.violations || record.violations.length === 0,
    violations: record.violations || [],
  };
}

function uuid() {
  // Non-cryptographic, since descriptors are not security-sensitive.
  return "vis_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

// ---------- Primitive 1: renderFractionBar ----------

/**
 * Build a fraction-bar descriptor.
 *
 * @param {object} input
 * @param {number} input.numerator          — non-negative integer
 * @param {number} input.denominator        — positive integer
 * @param {Array<{from:number,to:number,label?:string}>} [input.splits]
 *   Optional list of sub-segments (for shading different parts). Each {from,to}
 *   is 0..denominator (inclusive start, exclusive end).
 * @param {string} [input.label]            — top label (e.g. "3/4")
 * @returns {{primitive_id:string, descriptor:object, constraints_check:object}}
 */
export function renderFractionBar(input) {
  const violations = [];
  const numerator = Number(input?.numerator);
  const denominator = Number(input?.denominator);

  if (NON_FINITE(numerator) || NON_FINITE(denominator)) violations.push("non-finite-numerator-or-denominator");
  if (!IS_INT(numerator) || !IS_INT(denominator)) violations.push("non-integer-numerator-or-denominator");
  if (numerator < 0) violations.push("negative-numerator");
  if (denominator <= 0) violations.push("non-positive-denominator");
  if (numerator > denominator) violations.push("numerator-exceeds-denominator");

  const splits = Array.isArray(input?.splits) ? input.splits : [];
  for (const s of splits) {
    if (!s || typeof s !== "object") { violations.push("malformed-split"); continue; }
    const from = Number(s.from), to = Number(s.to);
    if (NON_FINITE(from) || NON_FINITE(to)) { violations.push("split-non-finite"); continue; }
    if (!IS_INT(from) || !IS_INT(to)) { violations.push("split-non-integer"); continue; }
    if (from < 0 || to > denominator) violations.push("split-out-of-range");
    if (to <= from) violations.push("split-empty-or-inverted");
  }

  const descriptor = {
    type: "fraction_bar",
    version: 1,
    numerator: violations.length ? null : numerator,
    denominator: violations.length ? null : denominator,
    splits: violations.length
      ? []
      : splits.map((s) => ({ from: s.from, to: s.to, label: s.label ?? null })),
    label: input?.label ?? null,
    orientation: "horizontal",
    shade_count: violations.length ? 0 : numerator,
  };

  return {
    primitive_id: uuid(),
    descriptor,
    constraints_check: constraintsOk({ violations }),
  };
}

// ---------- Primitive 2: renderNumberLine ----------

/**
 * Build a number-line descriptor.
 *
 * @param {object} input
 * @param {number} input.from
 * @param {number} input.to
 * @param {Array<{value:number,label?:string,kind?:string}>} input.marks
 *   Each {value, label, kind="tick"|"label"|"highlight"|"endpoint"}.
 * @param {number} [input.highlight] — value to emphasize (interval marker)
 * @returns {{primitive_id:string, descriptor:object, constraints_check:object}}
 */
export function renderNumberLine(input) {
  const violations = [];
  const from = Number(input?.from);
  const to = Number(input?.to);
  if (NON_FINITE(from) || NON_FINITE(to)) violations.push("non-finite-bounds");
  if (from >= to) violations.push("from-not-less-than-to");
  const marks = Array.isArray(input?.marks) ? input.marks : [];
  if (marks.length === 0) violations.push("no-marks");

  const cleanMarks = [];
  for (const m of marks) {
    if (!m || typeof m !== "object") { violations.push("malformed-mark"); continue; }
    const v = Number(m.value);
    if (NON_FINITE(v)) { violations.push("mark-non-finite"); continue; }
    if (v < from || v > to) { violations.push("mark-out-of-range"); continue; }
    const kind = ["tick", "label", "highlight", "endpoint"].includes(m.kind) ? m.kind : "tick";
    cleanMarks.push({ value: v, label: m.label ?? null, kind });
  }

  const highlight = input?.highlight === undefined ? null : Number(input.highlight);
  if (highlight !== null && (NON_FINITE(highlight) || highlight < from || highlight > to)) {
    violations.push("highlight-out-of-range");
  }

  const descriptor = {
    type: "number_line",
    version: 1,
    from: violations.length ? null : from,
    to: violations.length ? null : to,
    marks: cleanMarks,
    highlight: violations.length ? null : highlight,
    arrows: true,
  };

  return {
    primitive_id: uuid(),
    descriptor,
    constraints_check: constraintsOk({ violations }),
  };
}

// ---------- Primitive 3: renderBarModel ----------

/**
 * Build a bar-model descriptor for word problems.
 *
 * @param {object} input
 * @param {Array<{label:string,size:number}>} input.parts
 *   Sizes need not sum to a target — that's the renderer / teacher's choice.
 * @param {"part-part-whole"|"comparison"|"multiplication"} input.question_type
 * @returns {{primitive_id:string, descriptor:object, constraints_check:object}}
 */
export function renderBarModel(input) {
  const violations = [];
  const qtypes = new Set(["part-part-whole", "comparison", "multiplication"]);
  const qt = input?.question_type;
  if (!qtypes.has(qt)) violations.push("unknown-question-type");

  const parts = Array.isArray(input?.parts) ? input.parts : [];
  if (parts.length < 2) violations.push("too-few-parts");

  const cleanParts = [];
  for (const p of parts) {
    if (!p || typeof p !== "object") { violations.push("malformed-part"); continue; }
    const size = Number(p.size);
    if (NON_FINITE(size) || size < 0) { violations.push("part-invalid-size"); continue; }
    cleanParts.push({ label: String(p.label ?? ""), size });
  }

  const descriptor = {
    type: "bar_model",
    version: 1,
    question_type: qtypes.has(qt) ? qt : null,
    parts: cleanParts,
    orientation: "horizontal",
    show_braces: qt === "part-part-whole",
    show_ratio: qt === "comparison" || qt === "multiplication",
  };

  return {
    primitive_id: uuid(),
    descriptor,
    constraints_check: constraintsOk({ violations }),
  };
}

// ---------- Primitive 4: renderPercentageGrid ----------

/**
 * Build a 10×10 grid descriptor for percentages (one cell = 1%).
 *
 * @param {object} input
 * @param {number} input.percentage — 0..100
 * @param {number} [input.rows=10]
 * @param {number} [input.cols=10]
 * @returns {{primitive_id:string, descriptor:object, constraints_check:object}}
 */
export function renderPercentageGrid(input) {
  const violations = [];
  const pct = Number(input?.percentage);
  const rows = Number(input?.rows ?? 10);
  const cols = Number(input?.cols ?? 10);
  if (NON_FINITE(pct)) violations.push("non-finite-percentage");
  if (pct < 0 || pct > 100) violations.push("percentage-out-of-range");
  if (!IS_INT(rows) || rows <= 0) violations.push("invalid-rows");
  if (!IS_INT(cols) || cols <= 0) violations.push("invalid-cols");

  const filled = pct * rows * cols / 100;
  const filledCells = Math.round(filled);

  const descriptor = {
    type: "percentage_grid",
    version: 1,
    percentage: violations.length ? null : pct,
    rows: violations.length ? null : rows,
    cols: violations.length ? null : cols,
    filled_cells: filledCells,
    total_cells: rows * cols,
  };

  return {
    primitive_id: uuid(),
    descriptor,
    constraints_check: constraintsOk({ violations }),
  };
}

// ---------- Primitive 5: renderGeometryDiagram ----------

/**
 * Build a geometry-descriptor (rectangle, square, circle, triangle).
 *
 * @param {object} input
 * @param {"rectangle"|"square"|"circle"|"triangle"} input.shape
 * @param {object} input.dimensions — {width?,height?,side?,radius?,base?,height2?}
 * @param {Array<{role:string,label?:string}>} [input.annotations]
 * @returns {{primitive_id:string, descriptor:object, constraints_check:object}}
 */
export function renderGeometryDiagram(input) {
  const violations = [];
  const shapes = new Set(["rectangle", "square", "circle", "triangle"]);
  const shape = input?.shape;
  if (!shapes.has(shape)) violations.push("unknown-shape");

  const dims = input?.dimensions || {};
  const cleanDims = {};
  for (const [k, v] of Object.entries(dims)) {
    const n = Number(v);
    if (NON_FINITE(n)) { violations.push(`non-finite-${k}`); continue; }
    if (n < 0) { violations.push(`negative-${k}`); continue; }
    cleanDims[k] = n;
  }

  const annotations = Array.isArray(input?.annotations) ? input.annotations : [];
  const cleanAnnotations = annotations
    .filter((a) => a && typeof a === "object" && typeof a.role === "string")
    .map((a) => ({ role: a.role, label: a.label ?? null }));

  const descriptor = {
    type: "geometry_diagram",
    version: 1,
    shape: shapes.has(shape) ? shape : null,
    dimensions: cleanDims,
    annotations: cleanAnnotations,
    show_grid: false,
  };

  return {
    primitive_id: uuid(),
    descriptor,
    constraints_check: constraintsOk({ violations }),
  };
}

// ---------- Primitive 6: renderUnitConversionDiagram ----------

/**
 * Build a unit-conversion ladder descriptor.
 *
 * @param {object} input
 * @param {{unit:string,value:number}} input.from
 * @param {{unit:string,value:number}} input.to
 * @param {"length"|"weight"|"volume"} input.kind
 * @returns {{primitive_id:string, descriptor:object, constraints_check:object}}
 */
export function renderUnitConversionDiagram(input) {
  const violations = [];
  const kinds = new Set(["length", "weight", "volume"]);
  const kind = input?.kind;
  if (!kinds.has(kind)) violations.push("unknown-kind");

  const from = input?.from ?? {};
  const to = input?.to ?? {};
  if (typeof from.unit !== "string" || from.unit.length === 0) violations.push("missing-from-unit");
  if (typeof to.unit !== "string" || to.unit.length === 0) violations.push("missing-to-unit");
  const fv = Number(from.value);
  const tv = Number(to.value);
  if (NON_FINITE(fv)) violations.push("non-finite-from-value");
  if (NON_FINITE(tv)) violations.push("non-finite-to-value");
  if (fv < 0) violations.push("negative-from-value");
  if (tv < 0) violations.push("negative-to-value");

  // Heuristic mapping factor — kept as descriptor. The renderer is the only
  // place that turns it into a graphical ladder.
  const FACTORS = {
    length: { m: 1, cm: 0.01, km: 1000, mm: 0.001 },
    weight: { kg: 1, g: 0.001, "mg": 0.000001, "公噸": 1000 },
    volume: { L: 1, mL: 0.001, "立方公分": 0.001, kL: 1000 },
  };
  const factorTable = FACTORS[kind] || null;
  let ratio = null;
  if (factorTable && from.unit in factorTable && to.unit in factorTable) {
    ratio = (factorTable[from.unit] / factorTable[to.unit]);
  }

  const descriptor = {
    type: "unit_conversion",
    version: 1,
    kind: kinds.has(kind) ? kind : null,
    from: typeof from.unit === "string" ? { unit: from.unit, value: violations.length ? null : fv } : null,
    to: typeof to.unit === "string" ? { unit: to.unit, value: violations.length ? null : tv } : null,
    factor_table_ref: kind,
    ratio,
  };

  return {
    primitive_id: uuid(),
    descriptor,
    constraints_check: constraintsOk({ violations }),
  };
}

// ---------- Descriptor listing (for tests / diagnostics) ----------

export const VISUAL_PRIMITIVES = [
  "fraction_bar",
  "number_line",
  "bar_model",
  "percentage_grid",
  "geometry_diagram",
  "unit_conversion",
];

// ---------- SVG Validity self-check (exported for testing) ----------

const SVG_PRIMARY = "#4a90e2";
const SVG_HIGHLIGHT = "#f5a623";
const SVG_SUCCESS = "#7ed321";
const SVG_ERROR = "#d0021b";
const SVG_TEXT = "#333333";
const SVG_BG = "#f8f9fa";

export function svgValidityCheck(svg) {
  if (typeof svg !== "string") return { valid: false, reason: "not-a-string" };
  const hasOpen = svg.includes("<svg ");
  const hasClose = svg.includes("</svg>");
  const hasXmlns = svg.includes('xmlns="http://www.w3.org/2000/svg"');
  const hasViewBox = svg.includes('viewBox="');
  const hasTitle = svg.includes("<title>") && svg.includes("</title>");
  const hasDesc = svg.includes("<desc>") && svg.includes("</desc>");
  if (!hasOpen || !hasClose) return { valid: false, reason: "missing-svg-tags" };
  if (!hasXmlns) return { valid: false, reason: "missing-xmlns" };
  if (!hasViewBox) return { valid: false, reason: "missing-viewBox" };
  if (!hasTitle) return { valid: false, reason: "missing-title" };
  if (!hasDesc) return { valid: false, reason: "missing-desc" };
  return { valid: true };
}

// ---------- SVG Primitive 1: number_line ----------

/**
 * Generate a self-contained SVG string for a number line.
 * @param {object} opts
 * @param {number} opts.from
 * @param {number} opts.to
 * @param {Array<{value:number,label?:string,kind?:string}>} opts.marks
 * @param {number|null} opts.highlight
 * @returns {{svg:string, validity:object}}
 */
export function generateNumberLineSVG({ from, to, marks = [], highlight = null } = {}) {
  const W = 600, H = 140, PAD = 50;
  const lineY = 75, lineH = 4;
  const minX = PAD, maxX = W - PAD;
  const range = to - from;
  const scale = (v) => minX + ((v - from) / range) * (maxX - minX);

  const parts = [];

  // Background
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${SVG_BG}"/>`);

  // Highlight region between two outer marks
  if (highlight !== null && marks.length >= 2) {
    const sorted = [...marks].sort((a, b) => a.value - b.value);
    const lo = scale(sorted[0].value);
    const hi = scale(sorted[sorted.length - 1].value);
    parts.push(`<rect x="${lo}" y="${lineY - 18}" width="${hi - lo}" height="36" fill="${SVG_HIGHLIGHT}" opacity="0.25" rx="4"/>`);
  }

  // Main line
  parts.push(`<line x1="${minX}" y1="${lineY}" x2="${maxX}" y2="${lineY}" stroke="${SVG_TEXT}" stroke-width="${lineH}" stroke-linecap="round"/>`);

  // Arrow heads at ends
  parts.push(`<polygon points="${minX},${lineY - 6} ${minX + 10},${lineY} ${minX},${lineY + 6}" fill="${SVG_TEXT}"/>`);
  parts.push(`<polygon points="${maxX},${lineY - 6} ${maxX - 10},${lineY} ${maxX},${lineY + 6}" fill="${SVG_TEXT}"/>`);

  // Marks
  for (const m of marks) {
    const x = scale(m.value);
    const kind = m.kind || "tick";
    const label = m.label ?? String(m.value);
    const isEndpoint = kind === "endpoint";
    const isHighlight = kind === "highlight";
    const tickH = isEndpoint ? 18 : 12;
    const color = isHighlight ? SVG_HIGHLIGHT : isEndpoint ? SVG_PRIMARY : SVG_TEXT;

    // Tick mark
    parts.push(`<line x1="${x}" y1="${lineY - tickH}" x2="${x}" y2="${lineY + tickH}" stroke="${color}" stroke-width="${isEndpoint ? 3 : 2}" stroke-linecap="round"/>`);

    // Dot for highlight kind
    if (isHighlight) {
      parts.push(`<circle cx="${x}" cy="${lineY}" r="7" fill="${SVG_HIGHLIGHT}"/>`);
    }

    // Label below
    const fontSize = isEndpoint ? 14 : 12;
    parts.push(`<text x="${x}" y="${lineY + tickH + 16}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="${fontSize}" fill="${SVG_TEXT}">${escapeXml(label)}</text>`);
  }

  // Range labels at ends
  parts.push(`<text x="${minX - 2}" y="${lineY - 22}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="${SVG_TEXT}">${from}</text>`);
  parts.push(`<text x="${maxX + 2}" y="${lineY - 22}" text-anchor="start" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="${SVG_TEXT}">${to}</text>`);

  const svgContent = parts.join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>Number Line from ${from} to ${to}</title>
  <desc>Number line diagram showing integers from ${from} to ${to} with tick marks${highlight !== null ? " and highlight region" : ""}.</desc>
  ${svgContent}
</svg>`;

  return { svg, validity: svgValidityCheck(svg) };
}

// ---------- SVG Primitive 2: fraction_bar ----------

/**
 * Generate a self-contained SVG string for a fraction bar.
 * @param {object} opts
 * @param {number} opts.numerator
 * @param {number} opts.denominator
 * @param {Array<{from:number,to:number,label?:string}>} [opts.splits]
 * @param {string|null} opts.label
 * @returns {{svg:string, validity:object}}
 */
export function generateFractionBarSVG({ numerator, denominator, splits = [], label = null } = {}) {
  const W = Math.max(400, denominator * 60 + 80);
  const H = 110;
  const barX = 40, barY = 55, barH = 40;
  const partW = (W - barX * 2) / denominator;
  const shaded = Math.min(numerator, denominator);

  const parts = [];

  // Background
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${SVG_BG}"/>`);

  // Unshaded parts (light outline only)
  for (let i = 0; i < denominator; i++) {
    const x = barX + i * partW;
    parts.push(`<rect x="${x}" y="${barY}" width="${partW - 2}" height="${barH}" fill="none" stroke="${SVG_TEXT}" stroke-width="1" opacity="0.4"/>`);
  }

  // Shaded parts
  for (let i = 0; i < shaded; i++) {
    const x = barX + i * partW;
    parts.push(`<rect x="${x}" y="${barY}" width="${partW - 2}" height="${barH}" fill="${SVG_PRIMARY}" opacity="0.85" rx="2"/>`);
  }

  // Part dividers
  for (let i = 0; i <= denominator; i++) {
    const x = barX + i * partW - 1;
    parts.push(`<line x1="${x}" y1="${barY}" x2="${x}" y2="${barY + barH}" stroke="${SVG_BG}" stroke-width="2"/>`);
  }

  // Split labels
  if (splits.length > 0) {
    for (const s of splits) {
      const x1 = barX + s.from * partW;
      const x2 = barX + s.to * partW;
      const mid = (x1 + x2) / 2;
      if (s.label) {
        parts.push(`<text x="${mid}" y="${barY - 6}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="11" fill="${SVG_HIGHLIGHT}">${escapeXml(s.label)}</text>`);
      }
      parts.push(`<line x1="${x1}" y1="${barY}" x2="${x1}" y2="${barY - 5}" stroke="${SVG_HIGHLIGHT}" stroke-width="1.5"/>`);
      parts.push(`<line x1="${x2}" y1="${barY}" x2="${x2}" y2="${barY - 5}" stroke="${SVG_HIGHLIGHT}" stroke-width="1.5"/>`);
    }
  }

  // Fraction label above
  const displayLabel = label !== null ? label : `${numerator}/${denominator}`;
  parts.push(`<text x="${barX + (denominator * partW) / 2}" y="${barY - 14}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" font-weight="bold" fill="${SVG_TEXT}">${escapeXml(displayLabel)}</text>`);

  // Numerator/denominator count labels
  parts.push(`<text x="${barX - 12}" y="${barY + barH / 2 + 5}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="${SVG_PRIMARY}">${shaded}</text>`);
  parts.push(`<text x="${barX - 12}" y="${barY + barH + 14}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="${SVG_TEXT}">${denominator}</text>`);

  const svgContent = parts.join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>Fraction Bar ${displayLabel}</title>
  <desc>Fraction bar showing ${shaded} out of ${denominator} parts shaded for the fraction ${displayLabel}.</desc>
  ${svgContent}
</svg>`;

  return { svg, validity: svgValidityCheck(svg) };
}

// ---------- SVG Primitive 3: area_model ----------

/**
 * Generate a self-contained SVG string for a multiplication area model (M × N).
 * @param {object} opts
 * @param {number} opts.rows  — M
 * @param {number} opts.cols — N
 * @param {string|null} opts.label — optional label e.g. "3 × 4"
 * @returns {{svg:string, validity:object}}
 */
export function generateAreaModelSVG({ rows = 3, cols = 4, label = null } = {}) {
  const CELL = 40;
  const W = cols * CELL + 60;
  const H = rows * CELL + 60;
  const gridX = 30, gridY = 30;

  const displayLabel = label !== null ? label : `${rows} × ${cols}`;
  const parts = [];

  // Background
  parts.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${SVG_BG}"/>`);

  // Cells
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = gridX + c * CELL;
      const y = gridY + r * CELL;
      const filled = (r * cols + c) < (rows * cols); // all filled in multiplication model
      parts.push(`<rect x="${x + 1}" y="${y + 1}" width="${CELL - 2}" height="${CELL - 2}" fill="${filled ? SVG_PRIMARY : SVG_SUCCESS}" opacity="${filled ? 0.7 : 0.3}" stroke="${SVG_BG}" stroke-width="2" rx="3"/>`);
    }
  }

  // Row count (left)
  parts.push(`<text x="${gridX - 8}" y="${gridY + (rows * CELL) / 2}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="${SVG_TEXT}" transform="rotate(-90,${gridX - 8},${gridY + (rows * CELL) / 2})">${rows}</text>`);

  // Col count (top)
  parts.push(`<text x="${gridX + (cols * CELL) / 2}" y="${gridY - 8}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="14" fill="${SVG_TEXT}">${cols}</text>`);

  // Result label
  const result = rows * cols;
  parts.push(`<text x="${W - 8}" y="${H - 8}" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="13" fill="${SVG_SUCCESS}" font-weight="bold">= ${result}</text>`);

  // Product label in center
  parts.push(`<text x="${gridX + (cols * CELL) / 2}" y="${gridY + (rows * CELL) / 2 + 5}" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-size="16" fill="white" font-weight="bold">${displayLabel}</text>`);

  const svgContent = parts.join("\n  ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <title>Area Model ${displayLabel}</title>
  <desc>Area model showing a ${rows} by ${cols} rectangular grid for multiplication, with total area of ${result} square units.</desc>
  ${svgContent}
</svg>`;

  return { svg, validity: svgValidityCheck(svg) };
}

// ---------- Escape XML special characters ----------

function escapeXml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ---------- SVG generator for the tool layer ----------

/**
 * Generate SVG for the given primitive + descriptor.
 * Returns { svg, validity } or { svg: null, validity: { valid: false, reason } }.
 * @param {string} primitive
 * @param {object} descriptor
 * @returns {{svg:string|null, validity:object}}
 */
export function generateVisualSVG(primitive, descriptor) {
  switch (primitive) {
    case "number_line": {
      const { from, to, marks, highlight } = descriptor;
      return generateNumberLineSVG({ from, to, marks, highlight });
    }
    case "fraction_bar": {
      const { numerator, denominator, splits, label } = descriptor;
      return generateFractionBarSVG({ numerator, denominator, splits: splits || [], label: label ?? null });
    }
    case "area_model": {
      // Area model uses rows/cols from descriptor (distinct from bar_model)
      const { rows = 3, cols = 4, label: lbl = null } = descriptor;
      return generateAreaModelSVG({ rows, cols, label: lbl });
    }
    default:
      return { svg: null, validity: { valid: false, reason: `unsupported-primitive-for-svg:${primitive}` } };
  }
}

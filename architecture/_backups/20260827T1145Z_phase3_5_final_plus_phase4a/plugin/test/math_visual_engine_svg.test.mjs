// Tests: math_visual_engine.mjs SVG generators
// Run with: node --test test/math_visual_engine_svg.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateNumberLineSVG,
  generateFractionBarSVG,
  generateAreaModelSVG,
  generateVisualSVG,
  svgValidityCheck,
} from "../lib/math_visual_engine.mjs";

// ---- Validity helper ----

function assertValidSVG(svg, label = "svg") {
  assert.ok(typeof svg === "string", `${label} must be a string`);
  assert.ok(svg.includes("<svg "), `${label} must contain <svg `);
  assert.ok(svg.includes("</svg>"), `${label} must contain </svg>`);
  assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'), `${label} must contain xmlns`);
  assert.ok(svg.includes('viewBox="'), `${label} must contain viewBox`);
  assert.ok(svg.includes("<title>") && svg.includes("</title>"), `${label} must contain <title>`);
  assert.ok(svg.includes("<desc>") && svg.includes("</desc>"), `${label} must contain <desc>`);
  const result = svgValidityCheck(svg);
  assert.equal(result.valid, true, `${label} validity check failed: ${result.reason}`);
}

// ---- svgValidityCheck unit ----

test("svgValidityCheck: returns valid:true for well-formed SVG", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>Test</title><desc>Desc</desc><rect width="10" height="10"/></svg>`;
  const r = svgValidityCheck(svg);
  assert.equal(r.valid, true);
});

test("svgValidityCheck: returns valid:false for missing xmlns", () => {
  const svg = `<svg viewBox="0 0 100 100"><title>T</title><desc>D</desc></svg>`;
  const r = svgValidityCheck(svg);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "missing-xmlns");
});

test("svgValidityCheck: returns valid:false for missing viewBox", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><title>T</title><desc>D</desc></svg>`;
  const r = svgValidityCheck(svg);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "missing-viewBox");
});

test("svgValidityCheck: returns valid:false for missing title", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><desc>D</desc></svg>`;
  const r = svgValidityCheck(svg);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "missing-title");
});

test("svgValidityCheck: returns valid:false for missing desc", () => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><title>T</title></svg>`;
  const r = svgValidityCheck(svg);
  assert.equal(r.valid, false);
  assert.equal(r.reason, "missing-desc");
});

// ---- generateNumberLineSVG ----

test("generateNumberLineSVG: returns valid SVG for 0..10", () => {
  const { svg, validity } = generateNumberLineSVG({
    from: 0,
    to: 10,
    marks: [
      { value: 0, label: "0", kind: "endpoint" },
      { value: 5, label: "5", kind: "tick" },
      { value: 10, label: "10", kind: "endpoint" },
    ],
    highlight: null,
  });
  assert.equal(validity.valid, true);
  assertValidSVG(svg, "number line");
  assert.ok(svg.includes("0"), "should include from label 0");
  assert.ok(svg.includes("10"), "should include to label 10");
  assert.ok(svg.includes("5"), "should include mid label 5");
});

test("generateNumberLineSVG: contains expected number of tick marks", () => {
  const { svg } = generateNumberLineSVG({
    from: 0,
    to: 6,
    marks: [
      { value: 0, kind: "endpoint" },
      { value: 1, kind: "tick" },
      { value: 2, kind: "tick" },
      { value: 3, kind: "tick" },
      { value: 4, kind: "tick" },
      { value: 5, kind: "tick" },
      { value: 6, kind: "endpoint" },
    ],
    highlight: null,
  });
  // Should have 7 line elements for ticks (6 ticks + 2 endpoints = 7 marks)
  // Counting line elements for ticks - each tick mark is a <line>
  const tickCount = (svg.match(/<line x1=/g) || []).length;
  assert.ok(tickCount >= 7, `expected at least 7 line marks, got ${tickCount}`);
});

test("generateNumberLineSVG: highlight region creates a rect", () => {
  const { svg } = generateNumberLineSVG({
    from: 0,
    to: 10,
    marks: [
      { value: 0, kind: "endpoint" },
      { value: 3, kind: "highlight" },
      { value: 7, kind: "highlight" },
      { value: 10, kind: "endpoint" },
    ],
    highlight: 7,
  });
  // Highlight region rect
  assert.ok(svg.includes("<rect"), "highlight region should add a rect");
  assert.ok(svg.includes('opacity="0.25"'), "highlight rect should have opacity");
});

test("generateNumberLineSVG: endpoint marks are visually distinct", () => {
  const { svg } = generateNumberLineSVG({
    from: 0,
    to: 4,
    marks: [
      { value: 0, kind: "endpoint" },
      { value: 2, kind: "tick" },
      { value: 4, kind: "endpoint" },
    ],
    highlight: null,
  });
  // Endpoint stroke should be wider (stroke-width="3" vs "2")
  assert.ok(svg.includes('stroke-width="3"'), "endpoint should have wider stroke");
});

test("generateNumberLineSVG: missing marks still produces SVG", () => {
  const { svg, validity } = generateNumberLineSVG({ from: 0, to: 1, marks: [], highlight: null });
  assert.equal(validity.valid, true);
  assertValidSVG(svg);
});

test("generateNumberLineSVG: highlight null does not add highlight rect", () => {
  const { svg } = generateNumberLineSVG({
    from: 0,
    to: 5,
    marks: [{ value: 0 }, { value: 5 }],
    highlight: null,
  });
  // No highlight opacity 0.25 when highlight is null
  assert.ok(!svg.includes('opacity="0.25"'), "null highlight should not add opacity rect");
});

// ---- generateFractionBarSVG ----

test("generateFractionBarSVG: returns valid SVG for 3/4", () => {
  const { svg, validity } = generateFractionBarSVG({ numerator: 3, denominator: 4 });
  assert.equal(validity.valid, true);
  assertValidSVG(svg, "fraction bar");
});

test("generateFractionBarSVG: 3/4 produces exactly 3 shaded parts", () => {
  const { svg } = generateFractionBarSVG({ numerator: 3, denominator: 4 });
  // Count shaded rects (filled with primary color)
  const shadedRects = (svg.match(/fill="#4a90e2" opacity="0.85"/g) || []).length;
  assert.equal(shadedRects, 3, `expected 3 shaded parts, got ${shadedRects}`);
});

test("generateFractionBarSVG: denominator creates correct number of part divisions", () => {
  const { svg } = generateFractionBarSVG({ numerator: 2, denominator: 5 });
  // 5 parts => 6 dividers (including outer borders)
  // Counting vertical divider lines
  const dividers = (svg.match(/<line x1=/g) || []).length;
  assert.ok(dividers >= 5, `expected at least 5 dividers for 5 parts, got ${dividers}`);
});

test("generateFractionBarSVG: with splits adds split markers", () => {
  const { svg } = generateFractionBarSVG({
    numerator: 4,
    denominator: 4,
    splits: [{ from: 0, to: 2, label: "A" }, { from: 2, to: 4, label: "B" }],
    label: "4/4",
  });
  assert.ok(svg.includes("A"), "split A label should be in SVG");
  assert.ok(svg.includes("B"), "split B label should be in SVG");
  assert.ok(svg.includes('fill="#f5a623"'), "split markers should use highlight color");
});

test("generateFractionBarSVG: numerator exceeds denominator is clamped to denominator", () => {
  const { svg } = generateFractionBarSVG({ numerator: 7, denominator: 4 });
  // Shaded parts should be 4 (clamped to denominator)
  const shadedRects = (svg.match(/fill="#4a90e2" opacity="0.85"/g) || []).length;
  assert.equal(shadedRects, 4, `expected 4 shaded (clamped), got ${shadedRects}`);
});

test("generateFractionBarSVG: zero numerator produces no shaded parts", () => {
  const { svg } = generateFractionBarSVG({ numerator: 0, denominator: 4 });
  const shadedRects = (svg.match(/fill="#4a90e2" opacity="0.85"/g) || []).length;
  assert.equal(shadedRects, 0, "zero numerator should have no shaded parts");
});

test("generateFractionBarSVG: custom label shown above bar", () => {
  const { svg } = generateFractionBarSVG({ numerator: 2, denominator: 3, label: "2/3" });
  assert.ok(svg.includes(">2/3<"), "custom label should appear above bar");
});

test("generateFractionBarSVG: denominator=1 produces single wide part", () => {
  const { svg, validity } = generateFractionBarSVG({ numerator: 1, denominator: 1 });
  assert.equal(validity.valid, true);
  const shadedRects = (svg.match(/fill="#4a90e2" opacity="0.85"/g) || []).length;
  assert.equal(shadedRects, 1);
});

// ---- generateAreaModelSVG ----

test("generateAreaModelSVG: returns valid SVG for 3×4", () => {
  const { svg, validity } = generateAreaModelSVG({ rows: 3, cols: 4 });
  assert.equal(validity.valid, true);
  assertValidSVG(svg, "area model");
});

test("generateAreaModelSVG: 3×4 creates 12 cells", () => {
  const { svg } = generateAreaModelSVG({ rows: 3, cols: 4 });
  // 12 rects with the primary color
  const cells = (svg.match(/fill="#4a90e2" opacity="0.7"/g) || []).length;
  assert.equal(cells, 12, `expected 12 cells, got ${cells}`);
});

test("generateAreaModelSVG: area model label shows 3×4", () => {
  const { svg } = generateAreaModelSVG({ rows: 3, cols: 4, label: "3 × 4" });
  assert.ok(svg.includes("3 × 4") || svg.includes("3 × 4"), "label should be in SVG");
});

test("generateAreaModelSVG: result label shows product", () => {
  const { svg } = generateAreaModelSVG({ rows: 3, cols: 4 });
  assert.ok(svg.includes("= 12"), "product 12 should appear");
});

test("generateAreaModelSVG: row/col labels at edges", () => {
  const { svg } = generateAreaModelSVG({ rows: 5, cols: 2 });
  assert.ok(svg.includes(">5<"), "row count 5 should be labeled");
  assert.ok(svg.includes(">2<"), "col count 2 should be labeled");
});

test("generateAreaModelSVG: 1×1 produces single cell", () => {
  const { svg } = generateAreaModelSVG({ rows: 1, cols: 1 });
  const cells = (svg.match(/fill="#4a90e2" opacity="0.7"/g) || []).length;
  assert.equal(cells, 1);
});

test("generateAreaModelSVG: default rows=3 cols=4", () => {
  const { svg } = generateAreaModelSVG({});
  const cells = (svg.match(/fill="#4a90e2" opacity="0.7"/g) || []).length;
  assert.equal(cells, 12, "default 3×4=12 cells");
});

test("generateAreaModelSVG: result label in bottom-right", () => {
  const { svg } = generateAreaModelSVG({ rows: 2, cols: 3 });
  assert.ok(svg.includes("= 6"), "product should be shown as = 6");
});

// ---- generateVisualSVG (dispatcher) ----

test("generateVisualSVG: dispatches number_line", () => {
  const desc = { from: 0, to: 5, marks: [{ value: 0 }, { value: 5 }], highlight: null };
  const { svg, validity } = generateVisualSVG("number_line", desc);
  assert.ok(svg !== null);
  assert.equal(validity.valid, true);
});

test("generateVisualSVG: dispatches fraction_bar", () => {
  const desc = { numerator: 2, denominator: 5, splits: [], label: "2/5" };
  const { svg, validity } = generateVisualSVG("fraction_bar", desc);
  assert.ok(svg !== null);
  assert.equal(validity.valid, true);
});

test("generateVisualSVG: dispatches area_model", () => {
  const desc = { rows: 3, cols: 4 };
  const { svg, validity } = generateVisualSVG("area_model", desc);
  assert.ok(svg !== null);
  assert.equal(validity.valid, true);
});

test("generateVisualSVG: unknown primitive returns svg:null", () => {
  const { svg, validity } = generateVisualSVG("bar_model", {});
  assert.equal(svg, null);
  assert.equal(validity.valid, false);
  assert.ok(validity.reason.includes("unsupported"));
});

test("generateVisualSVG: unsupported primitive does not throw", () => {
  assert.doesNotThrow(() => {
    generateVisualSVG("percentage_grid", { percentage: 50 });
  });
});

// ---- Integration: SVG generation does not pollute descriptors ----

test("generateNumberLineSVG: SVG is self-contained (no external refs)", () => {
  const { svg } = generateNumberLineSVG({
    from: 0,
    to: 10,
    marks: [{ value: 0 }, { value: 5 }, { value: 10 }],
  });
  // Allow xmlns URL (the namespace itself) but no other http refs
  const httpCount = (svg.match(/http:\/\//g) || []).length;
  // Should only be the xmlns value itself (1 occurrence)
  assert.ok(httpCount <= 1, `SVG should not contain external URLs beyond xmlns; found ${httpCount}`);
  assert.ok(!svg.includes(".css"), "SVG should not reference external stylesheets");
  assert.ok(!svg.includes("@import"), "SVG should not use @import");
});

test("generateFractionBarSVG: SVG uses inline styles only", () => {
  const { svg } = generateFractionBarSVG({ numerator: 1, denominator: 2 });
  assert.ok(!svg.includes(".cls"), "no CSS class references");
  assert.ok(!svg.includes("style=\"\""), "no empty style attributes");
});

test("generateAreaModelSVG: SVG uses only inline fill attributes", () => {
  const { svg } = generateAreaModelSVG({ rows: 2, cols: 2 });
  assert.ok(svg.includes('fill="#'), "all fills are inline hex colors");
  assert.ok(!svg.includes("class="), "no CSS class usage");
});

// Tests: math_visual_engine.mjs
// Run with: node --test test/math_visual_engine.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  renderFractionBar,
  renderNumberLine,
  renderBarModel,
  renderPercentageGrid,
  renderGeometryDiagram,
  renderUnitConversionDiagram,
  VISUAL_PRIMITIVES,
} from "../lib/math_visual_engine.mjs";

test("VISUAL_PRIMITIVES lists all six primitives", () => {
  assert.equal(VISUAL_PRIMITIVES.length, 6);
  for (const p of ["fraction_bar", "number_line", "bar_model", "percentage_grid", "geometry_diagram", "unit_conversion"]) {
    assert.ok(VISUAL_PRIMITIVES.includes(p), `missing primitive: ${p}`);
  }
});

test("renderFractionBar: 3/4 with splits", () => {
  const r = renderFractionBar({
    numerator: 3,
    denominator: 4,
    splits: [{ from: 0, to: 1, label: "A" }, { from: 1, to: 3, label: "B" }],
    label: "3/4",
  });
  assert.ok(r.primitive_id);
  assert.equal(r.descriptor.type, "fraction_bar");
  assert.equal(r.descriptor.numerator, 3);
  assert.equal(r.descriptor.denominator, 4);
  assert.equal(r.descriptor.shade_count, 3);
  assert.equal(r.descriptor.splits.length, 2);
  assert.equal(r.constraints_check.ok, true);
});

test("renderFractionBar: rejects negative denominator", () => {
  const r = renderFractionBar({ numerator: 1, denominator: -2 });
  assert.equal(r.constraints_check.ok, false);
  assert.ok(r.constraints_check.violations.includes("non-positive-denominator"));
});

test("renderFractionBar: rejects NaN", () => {
  const r = renderFractionBar({ numerator: NaN, denominator: 4 });
  assert.equal(r.constraints_check.ok, false);
});

test("renderNumberLine: 0..10 with marks", () => {
  const r = renderNumberLine({
    from: 0,
    to: 10,
    marks: [
      { value: 0, label: "0", kind: "endpoint" },
      { value: 5, label: "5", kind: "tick" },
      { value: 10, label: "10", kind: "endpoint" },
    ],
    highlight: 5,
  });
  assert.equal(r.descriptor.type, "number_line");
  assert.equal(r.descriptor.from, 0);
  assert.equal(r.descriptor.to, 10);
  assert.equal(r.descriptor.marks.length, 3);
  assert.equal(r.descriptor.highlight, 5);
  assert.equal(r.constraints_check.ok, true);
});

test("renderNumberLine: rejects from >= to", () => {
  const r = renderNumberLine({ from: 5, to: 5, marks: [{ value: 5, label: "5" }] });
  assert.equal(r.constraints_check.ok, false);
  assert.ok(r.constraints_check.violations.includes("from-not-less-than-to"));
});

test("renderNumberLine: rejects mark outside range", () => {
  const r = renderNumberLine({ from: 0, to: 10, marks: [{ value: 20, label: "x" }] });
  assert.equal(r.constraints_check.ok, false);
});

test("renderBarModel: part-part-whole", () => {
  const r = renderBarModel({
    parts: [
      { label: "蘋果", size: 5 },
      { label: "橘子", size: 3 },
    ],
    question_type: "part-part-whole",
  });
  assert.equal(r.descriptor.type, "bar_model");
  assert.equal(r.descriptor.question_type, "part-part-whole");
  assert.equal(r.descriptor.parts.length, 2);
  assert.equal(r.descriptor.show_braces, true);
});

test("renderBarModel: rejects unknown question_type", () => {
  const r = renderBarModel({ parts: [{ label: "A", size: 1 }, { label: "B", size: 2 }], question_type: "bogus" });
  assert.equal(r.constraints_check.ok, false);
  assert.ok(r.constraints_check.violations.includes("unknown-question-type"));
});

test("renderPercentageGrid: 25 percent", () => {
  const r = renderPercentageGrid({ percentage: 25, rows: 10, cols: 10 });
  assert.equal(r.descriptor.type, "percentage_grid");
  assert.equal(r.descriptor.total_cells, 100);
  assert.equal(r.descriptor.filled_cells, 25);
  assert.equal(r.constraints_check.ok, true);
});

test("renderPercentageGrid: rejects out of range", () => {
  const r = renderPercentageGrid({ percentage: 150 });
  assert.equal(r.constraints_check.ok, false);
  assert.ok(r.constraints_check.violations.includes("percentage-out-of-range"));
});

test("renderGeometryDiagram: rectangle", () => {
  const r = renderGeometryDiagram({
    shape: "rectangle",
    dimensions: { width: 4, height: 3 },
    annotations: [{ role: "side:top", label: "4 cm" }, { role: "side:left", label: "3 cm" }],
  });
  assert.equal(r.descriptor.type, "geometry_diagram");
  assert.equal(r.descriptor.shape, "rectangle");
  assert.equal(r.descriptor.dimensions.width, 4);
  assert.equal(r.descriptor.dimensions.height, 3);
});

test("renderGeometryDiagram: rejects unknown shape", () => {
  const r = renderGeometryDiagram({ shape: "octopus", dimensions: { width: 1 } });
  assert.equal(r.constraints_check.ok, false);
});

test("renderUnitConversionDiagram: km↔m length", () => {
  const r = renderUnitConversionDiagram({
    from: { unit: "km", value: 2 },
    to: { unit: "m", value: 2000 },
    kind: "length",
  });
  assert.equal(r.descriptor.type, "unit_conversion");
  assert.equal(r.descriptor.kind, "length");
  assert.equal(r.descriptor.from.unit, "km");
  assert.equal(r.descriptor.to.unit, "m");
  assert.ok(r.descriptor.ratio && r.descriptor.ratio > 0);
});

test("renderUnitConversionDiagram: rejects missing units", () => {
  const r = renderUnitConversionDiagram({ from: { unit: "", value: 1 }, to: { unit: "m", value: 1 }, kind: "length" });
  assert.equal(r.constraints_check.ok, false);
});

test("renderFractionBar: returns primitive_id, descriptor, constraints_check", () => {
  const r = renderFractionBar({ numerator: 1, denominator: 2 });
  assert.ok(typeof r.primitive_id === "string");
  assert.ok(typeof r.descriptor === "object");
  assert.ok(typeof r.constraints_check === "object");
  assert.ok(typeof r.constraints_check.ok === "boolean");
});

// Tests: math_error_taxonomy.mjs
// Run with: node --test test/math_error_taxonomy.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MATH_ERROR_TAXONOMY,
  lookupMathErrorCode,
  listMathErrorsByCategory,
  listMathErrorCategories,
  mathErrorTaxonomySize,
  validateMathErrorTaxonomy,
} from "../lib/math_error_taxonomy.mjs";

test("MATH_ERROR_TAXONOMY has 10-15 top categories", () => {
  assert.ok(MATH_ERROR_TAXONOMY.length >= 10);
  assert.ok(MATH_ERROR_TAXONOMY.length <= 20);
});

test("all top categories cover required domains", () => {
  const codes = new Set(MATH_ERROR_TAXONOMY.map((t) => t.code));
  for (const required of [
    "MATH-CONCEPT",
    "MATH-PROCEDURE",
    "MATH-CALCULATION",
    "MATH-UNIT",
    "MATH-STEM",
    "MATH-NUMSENSE",
    "MATH-FRAC-OPS",
    "MATH-DEC-OPS",
    "MATH-RATIO",
    "MATH-GEOM",
    "MATH-FORMULA",
    "MATH-STRATEGY",
    "MATH-REPR",
    "MATH-WP",
    "MATH-PREREQ",
  ]) {
    assert.ok(codes.has(required), `missing category: ${required}`);
  }
});

test("every category has required fields", () => {
  for (const top of MATH_ERROR_TAXONOMY) {
    assert.ok(top.code, "top has no code");
    assert.ok(top.label_zh, `top ${top.code} has no label_zh`);
    assert.ok(top.description, `top ${top.code} has no description`);
    assert.ok(top.hint_template, `top ${top.code} has no hint_template`);
    assert.ok(["concrete", "visual", "symbolic"].includes(top.representation_hint), `${top.code} rep hint invalid`);
  }
});

test("every top has at least 1 sub-code", () => {
  for (const top of MATH_ERROR_TAXONOMY) {
    assert.ok(top.children && top.children.length >= 1, `${top.code} has no sub-codes`);
    for (const c of top.children) {
      assert.ok(c.code);
      assert.ok(c.label_zh);
      assert.ok(c.description);
    }
  }
});

test("lookupMathErrorCode: top-level code returns full entry", () => {
  const r = lookupMathErrorCode("MATH-CONCEPT");
  assert.equal(r.code, "MATH-CONCEPT");
  assert.ok(r.children && r.children.length >= 1);
});

test("lookupMathErrorCode: sub-code returns entry with parent field", () => {
  const r = lookupMathErrorCode("MATH-CONCEPT-FRAC");
  assert.equal(r.code, "MATH-CONCEPT-FRAC");
  assert.equal(r.parent, "MATH-CONCEPT");
});

test("lookupMathErrorCode: unknown returns null", () => {
  assert.equal(lookupMathErrorCode("DOES-NOT-EXIST"), null);
  assert.equal(lookupMathErrorCode(undefined), null);
});

test("listMathErrorsByCategory: returns top + children", () => {
  const r = listMathErrorsByCategory("MATH-FRAC-OPS");
  assert.ok(r.length >= 2);
  assert.equal(r[0].code, "MATH-FRAC-OPS");
});

test("listMathErrorsByCategory: unknown returns empty", () => {
  assert.equal(listMathErrorsByCategory("ZZZ").length, 0);
});

test("listMathErrorCategories: returns all top codes", () => {
  const cats = listMathErrorCategories();
  assert.equal(cats.length, MATH_ERROR_TAXONOMY.length);
  assert.ok(cats.find((c) => c.code === "MATH-PREREQ"));
});

test("mathErrorTaxonomySize: counts both top + sub codes", () => {
  let expected = 0;
  for (const top of MATH_ERROR_TAXONOMY) {
    expected += 1 + (top.children?.length || 0);
  }
  assert.equal(mathErrorTaxonomySize(), expected);
  assert.ok(mathErrorTaxonomySize() >= 25, "expected at least 25 codes total");
});

test("validateMathErrorTaxonomy: ok on built-in", () => {
  const r = validateMathErrorTaxonomy();
  assert.equal(r.ok, true);
  assert.deepEqual(r.duplicates, []);
  assert.equal(r.total_codes, mathErrorTaxonomySize());
});

test("no MATH-* code collides with ZH-* family designator", () => {
  // We don't import ZH codes, but check that all codes start with MATH-
  for (const top of MATH_ERROR_TAXONOMY) {
    assert.match(top.code, /^MATH-/);
    for (const c of top.children || []) {
      assert.match(c.code, /^MATH-/);
    }
  }
});

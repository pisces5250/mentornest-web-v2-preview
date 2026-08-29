// Tests: chinese_error_taxonomy
// Run with: node --test test/chinese_error_taxonomy.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHINESE_ERROR_TAXONOMY,
  lookupErrorCode,
  listByCategory,
  listCategories,
  taxonomySize,
  validateTaxonomy,
  assertValidErrorCode,
} from "../lib/chinese_error_taxonomy.mjs";

test("taxonomy size is between 15 and 25", () => {
  const n = taxonomySize();
  assert.ok(n >= 15, `too few (${n})`);
  assert.ok(n <= 25, `too many (${n})`);
});

test("all codes are unique", () => {
  const codes = CHINESE_ERROR_TAXONOMY.map((e) => e.code);
  assert.equal(new Set(codes).size, codes.length);
});

test("taxonomy validation passes", () => {
  const r = validateTaxonomy();
  assert.equal(r.ok, true);
  assert.deepEqual(r.errors, []);
});

test("each entry has hint_template + mini_lesson_hint + examples", () => {
  for (const e of CHINESE_ERROR_TAXONOMY) {
    assert.ok(e.hint_template && e.hint_template.length > 5, `${e.code} hint_template too short`);
    assert.ok(e.mini_lesson_hint && e.mini_lesson_hint.length > 3, `${e.code} mini_lesson_hint too short`);
    assert.ok(Array.isArray(e.examples) && e.examples.length > 0, `${e.code} examples missing`);
  }
});

test("lookupErrorCode: known code returns entry, unknown returns null", () => {
  const first = CHINESE_ERROR_TAXONOMY[0];
  const r = lookupErrorCode(first.code);
  assert.ok(r);
  assert.equal(r.code, first.code);
  const r2 = lookupErrorCode("NOT-A-CODE");
  assert.equal(r2, null);
});

test("listByCategory returns at least one entry for each major group", () => {
  for (const cat of ["字詞辨識", "詞語", "成語", "標點符號", "病句", "閱讀理解_明示", "閱讀理解_推論", "閱讀理解_主旨", "修辭", "文章結構", "書寫", "拼音", "文言文"]) {
    const r = listByCategory(cat);
    assert.ok(r.length >= 1, `${cat} empty`);
  }
});

test("Chinese codes do NOT reuse math codes", () => {
  const mathCodes = ["FRAC_OPERATION", "DECIMAL_PLACE", "UNIT_CONVERSION", "CONCEPT_MIS", "CARELESS_ARITH", "READ_COMP"];
  for (const m of mathCodes) {
    const r = lookupErrorCode(m);
    assert.equal(r, null, `Chinese taxonomy must NOT contain math code ${m}`);
  }
});

test("assertValidErrorCode throws on unknown", () => {
  assert.throws(() => assertValidErrorCode("NOPE"));
  assert.doesNotThrow(() => assertValidErrorCode(CHINESE_ERROR_TAXONOMY[0].code));
});

test("categories list is non-empty and dedup'd", () => {
  const cats = listCategories();
  assert.ok(cats.length > 5);
  assert.equal(new Set(cats).size, cats.length);
});

test("every category in listCategories has at least one entry", () => {
  const cats = listCategories();
  for (const c of cats) {
    assert.ok(listByCategory(c).length >= 1);
  }
});
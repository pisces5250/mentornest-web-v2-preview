// test/social_studies_error_taxonomy.test.mjs — unit tests for SS-* taxonomy

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SOCIAL_STUDIES_ERROR_TAXONOMY,
  lookupSocialStudiesErrorCode,
  listSocialStudiesErrorsByCategory,
  listSocialStudiesErrorCategories,
  socialStudiesErrorTaxonomySize,
  validateSocialStudiesErrorTaxonomy,
} from "../lib/social_studies_error_taxonomy.mjs";

test("taxonomy size is between 15 and 25 (inclusive)", () => {
  const size = socialStudiesErrorTaxonomySize();
  assert.ok(size >= 15 && size <= 25, `expected 15..25, got ${size}`);
});

test("taxonomy validation passes (no dupes, prefix OK)", () => {
  const v = validateSocialStudiesErrorTaxonomy();
  assert.equal(v.valid, true, JSON.stringify(v));
  assert.equal(v.errors.length, 0);
});

test("all codes start with SS-", () => {
  for (const e of SOCIAL_STUDIES_ERROR_TAXONOMY) {
    assert.ok(e.code.startsWith("SS-"), `bad code: ${e.code}`);
  }
});

test("every entry has the required fields", () => {
  for (const e of SOCIAL_STUDIES_ERROR_TAXONOMY) {
    assert.ok(e.category, `missing category: ${e.code}`);
    assert.ok(e.label_zh, `missing label_zh: ${e.code}`);
    assert.ok(e.description, `missing description: ${e.code}`);
    assert.ok(Array.isArray(e.examples) && e.examples.length > 0, `examples: ${e.code}`);
    assert.ok(e.hint_template, `missing hint_template: ${e.code}`);
    assert.ok(e.mini_lesson_hint, `missing mini_lesson_hint: ${e.code}`);
  }
});

test("categories include the 9 required axes", () => {
  const cats = listSocialStudiesErrorCategories();
  for (const expected of [
    "history", "geography", "civics", "culture-society",
    "data-interpretation", "source-comparison", "timeline", "map", "causality",
  ]) {
    assert.ok(cats.includes(expected), `missing category: ${expected}`);
  }
});

test("lookup by exact code returns the entry", () => {
  const code = SOCIAL_STUDIES_ERROR_TAXONOMY[0].code;
  const entry = lookupSocialStudiesErrorCode(code);
  assert.equal(entry.code, code);
});

test("lookup with unknown code returns null", () => {
  assert.equal(lookupSocialStudiesErrorCode("SS-DOES-NOT-EXIST"), null);
  assert.equal(lookupSocialStudiesErrorCode(""), null);
});

test("listByCategory returns only that category", () => {
  const historyEntries = listSocialStudiesErrorsByCategory("history");
  assert.ok(historyEntries.length > 0);
  for (const e of historyEntries) assert.equal(e.category, "history");
  const noneEntries = listSocialStudiesErrorsByCategory("nonexistent");
  assert.equal(noneEntries.length, 0);
});

test("categories are deduplicated", () => {
  const cats = listSocialStudiesErrorCategories();
  assert.equal(cats.length, new Set(cats).size);
});

test("known history codes cover spec-required axes", () => {
  const history = listSocialStudiesErrorsByCategory("history");
  const codes = history.map((e) => e.code);
  // spec lists: era-order, causal-reverse, source-mix, dynasty-misattribute, figure-event-mismatch
  assert.ok(codes.includes("SS-HIST-ERA-ORDER"));
  assert.ok(codes.includes("SS-HIST-CAUSAL-REVERSE"));
  assert.ok(codes.includes("SS-HIST-SOURCE-MIX"));
  assert.ok(codes.includes("SS-HIST-DYNASTY-MISATTR"));
  assert.ok(codes.includes("SS-HIST-FIGURE-EVENT-MISMATCH"));
});

test("known causality codes cover short/long, multi-cause, chain", () => {
  const codes = listSocialStudiesErrorsByCategory("causality").map((e) => e.code);
  assert.ok(codes.includes("SS-CAUSAL-SHORT-LONG"));
  assert.ok(codes.includes("SS-CAUSAL-MULTI"));
  assert.ok(codes.includes("SS-CAUSAL-CHAIN"));
});
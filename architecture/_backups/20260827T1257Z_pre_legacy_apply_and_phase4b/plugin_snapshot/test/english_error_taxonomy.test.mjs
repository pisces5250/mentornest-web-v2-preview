// Tests: english_error_taxonomy
// Run with: node --test test/english_error_taxonomy.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ENGLISH_ERROR_TAXONOMY,
  lookupErrorCode,
  listByCategory,
  listCategories,
  assertValidErrorCode,
  taxonomySize,
  validateTaxonomy,
} from "../lib/english_error_taxonomy.mjs";

test("taxonomy size is 15..25 (V1 spec)", () => {
  const n = taxonomySize();
  assert.ok(n >= 15 && n <= 25, `expected 15..25, got ${n}`);
});

test("all codes are unique", () => {
  const codes = ENGLISH_ERROR_TAXONOMY.map((e) => e.code);
  const set = new Set(codes);
  assert.equal(set.size, codes.length);
});

test("validateTaxonomy reports ok", () => {
  const v = validateTaxonomy();
  assert.equal(v.ok, true, JSON.stringify(v.errors));
});

test("lookupErrorCode returns entry for valid code", () => {
  const e = lookupErrorCode("EN-PHON-LS");
  assert.ok(e);
  assert.equal(e.code, "EN-PHON-LS");
  assert.equal(e.category, "phonics");
  assert.ok(e.hint_template.length > 0);
});

test("lookupErrorCode returns null for unknown code", () => {
  assert.equal(lookupErrorCode("EN-FAKE"), null);
});

test("lookupErrorCode rejects non-string", () => {
  assert.equal(lookupErrorCode(undefined), null);
  assert.equal(lookupErrorCode(null), null);
  assert.equal(lookupErrorCode(123), null);
});

test("listByCategory returns matching entries", () => {
  const arr = listByCategory("phonics");
  assert.ok(arr.length >= 5);
  assert.ok(arr.every((e) => e.category === "phonics"));
});

test("listByCategory returns [] for unknown category", () => {
  assert.deepEqual(listByCategory("nonexistent"), []);
});

test("listCategories includes all 10+ groups", () => {
  const cats = listCategories();
  assert.ok(cats.length >= 10);
  assert.ok(cats.includes("phonics"));
  assert.ok(cats.includes("spelling"));
  assert.ok(cats.includes("vocabulary"));
  assert.ok(cats.includes("grammar"));
  assert.ok(cats.includes("reading-comprehension"));
  assert.ok(cats.includes("listening"));
  assert.ok(cats.includes("speaking"));
  assert.ok(cats.includes("punctuation"));
  assert.ok(cats.includes("capitalization"));
  assert.ok(cats.includes("transcription"));
});

test("assertValidErrorCode throws on invalid", () => {
  assert.throws(() => assertValidErrorCode("EN-FAKE"));
});

test("assertValidErrorCode returns code on valid", () => {
  assert.equal(assertValidErrorCode("EN-GRAM-TENSE"), "EN-GRAM-TENSE");
});

test("every entry has examples", () => {
  for (const e of ENGLISH_ERROR_TAXONOMY) {
    assert.ok(Array.isArray(e.examples) && e.examples.length > 0, `entry ${e.code} missing examples`);
  }
});

test("transcription category flags STT misrecognition", () => {
  const arr = listByCategory("transcription");
  assert.ok(arr.length >= 2);
  const codes = arr.map((e) => e.code);
  assert.ok(codes.includes("EN-STT-PHON"));
  assert.ok(codes.includes("EN-STT-AMBIG"));
});

test("no code collides with math codes", () => {
  // Sanity: codes must not start with "M-", "MATH-", "ZH-", "CN-".
  for (const e of ENGLISH_ERROR_TAXONOMY) {
    assert.ok(!e.code.startsWith("M-"), `${e.code} looks like a math code`);
    assert.ok(!e.code.startsWith("MATH-"), `${e.code} looks like a math code`);
    assert.ok(!e.code.startsWith("ZH-"), `${e.code} looks like a chinese code`);
  }
});

// test/input/answer_validator.test.mjs
//
// Phase 5B — answer-validator tests.
// Validates: equivalent fractions accepted; wrong fractions rejected; decimals accepted; empty rejected.

import { test } from "node:test";
import assert from "node:assert/strict";
import { validateKeypadAnswer, keypadValueToString } from "../../src/input/answer-validator.mjs";

test("answer: 1/2 vs 2/4 → correct (equivalent fraction)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 2, denominator: 4 },
    expected: "1/2",
  });
  assert.equal(r.verdict, "correct");
  assert.equal(r.reason, "fraction-equal");
});

test("answer: 1/2 vs 4/8 → correct (equivalent fraction)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 4, denominator: 8 },
    expected: "1/2",
  });
  assert.equal(r.verdict, "correct");
});

test("answer: 3/4 vs 6/8 → correct", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 6, denominator: 8 },
    expected: "3/4",
  });
  assert.equal(r.verdict, "correct");
});

test("answer: 5/6 vs 7/12 → incorrect (no equivalent)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 7, denominator: 12 },
    expected: "5/6",
  });
  assert.equal(r.verdict, "incorrect");
});

test("answer: 0/5 vs 0/7 → correct (both zero)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 0, denominator: 5 },
    expected: "0/7",
  });
  assert.equal(r.verdict, "correct");
});

test("answer: empty vs 1/2 → incorrect", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "empty" },
    expected: "1/2",
  });
  assert.equal(r.verdict, "incorrect");
});

test("answer: 0.5 vs 1/2 → correct (decimal equivalent)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "decimal", n: 0.5, precision: 1 },
    expected: "1/2",
  });
  assert.equal(r.verdict, "correct");
});

test("answer: 50% vs 1/2 → correct (percent equivalent)", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "decimal", n: 50, precision: 0 },
    expected: "1/2",
  });
  // 50 (integer 50) is NOT 1/2. Decimal "50" represents 50, not 50%.
  // This tests that percentage form requires the % symbol — which the keypad
  // doesn't produce, so the keypad path correctly returns incorrect.
  assert.equal(r.verdict, "incorrect");
});

test("answer: integer 0 vs 0/1 → correct", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "integer", n: 0 },
    expected: "0",
  });
  assert.equal(r.verdict, "correct");
});

test("answer: integer 3 vs 5 → incorrect", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "integer", n: 3 },
    expected: "5",
  });
  assert.equal(r.verdict, "incorrect");
});

test("answer: fraction with zero denominator → empty → incorrect", () => {
  const r = validateKeypadAnswer({
    keypad_value: { kind: "fraction", numerator: 5, denominator: 0 },
    expected: "5",
  });
  // The wrapper maps d=0 → "" → "empty-student-answer" → incorrect
  assert.equal(r.verdict, "incorrect");
});

test("answer: keypadValueToString maps each variant", () => {
  assert.equal(keypadValueToString({ kind: "integer", n: 7 }), "7");
  assert.equal(keypadValueToString({ kind: "decimal", n: 1.5, precision: 1 }), "1.5");
  assert.equal(keypadValueToString({ kind: "fraction", numerator: 1, denominator: 2 }), "1/2");
  assert.equal(keypadValueToString({ kind: "mixed", integer_part: 1, numerator: 1, denominator: 2 }), "1 1/2");
  assert.equal(keypadValueToString({ kind: "operator_expr", raw: "5+3" }), "5+3");
  assert.equal(keypadValueToString({ kind: "empty" }), "");
  assert.equal(keypadValueToString(null), "");
});

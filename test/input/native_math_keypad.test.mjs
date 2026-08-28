// test/input/native_math_keypad.test.mjs
//
// Phase 5B — NativeMathKeypad pure state-machine tests.
// Imports the keypad state machine exported by NativeMathKeypad.tsx via
// a small .mjs mirror so node --test can run without TS transpilation.

import { test } from "node:test";
import assert from "node:assert/strict";

// Mirror the keypadReduce logic from NativeMathKeypad.tsx (kept in sync).
import { keypadReduce, keypadInitial, parseFractionBuffer } from "../../src/input/keypad-state.mjs";

test("keypad: initial state is empty + integer field", () => {
  const s = keypadInitial();
  assert.equal(s.active_field, "integer");
  assert.equal(s.buffer, "");
  assert.equal(s.value.kind, "empty");
});

test("keypad: digit on integer field → integer value", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "digit", digit: 1 });
  s = keypadReduce(s, { type: "digit", digit: 2 });
  s = keypadReduce(s, { type: "digit", digit: 3 });
  assert.equal(s.value.kind, "integer");
  if (s.value.kind === "integer") assert.equal(s.value.n, 123);
});

test("keypad: decimal_point on integer field → decimal value", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "digit", digit: 1 });
  s = keypadReduce(s, { type: "decimal_point" });
  s = keypadReduce(s, { type: "digit", digit: 5 });
  assert.equal(s.value.kind, "decimal");
  if (s.value.kind === "decimal") {
    assert.equal(s.value.n, 1.5);
    assert.equal(s.value.precision, 1);
  }
});

test("keypad: clear → back to empty", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "digit", digit: 5 });
  s = keypadReduce(s, { type: "clear" });
  assert.equal(s.value.kind, "empty");
});

test("keypad: backspace on empty buffer → no-op (no crash)", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "backspace" });
  assert.equal(s.value.kind, "empty");
});

test("keypad: backspace reduces digit count", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "digit", digit: 1 });
  s = keypadReduce(s, { type: "digit", digit: 2 });
  s = keypadReduce(s, { type: "digit", digit: 3 });
  s = keypadReduce(s, { type: "backspace" });
  assert.equal(s.value.kind, "integer");
  if (s.value.kind === "integer") assert.equal(s.value.n, 12);
});

test("keypad: fraction_bar switches active field to numerator", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "fraction_bar" });
  assert.equal(s.active_field, "numerator");
});

test("keypad: focus_field switches denominator/numerator", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "fraction_bar" });
  s = keypadReduce(s, { type: "focus_field", field: "denominator" });
  assert.equal(s.active_field, "denominator");
  s = keypadReduce(s, { type: "focus_field", field: "numerator" });
  assert.equal(s.active_field, "numerator");
});

test("keypad: parseFractionBuffer returns empty when denominator is 0", () => {
  const v = parseFractionBuffer("5", "0");
  assert.equal(v.kind, "empty");
});

test("keypad: parseFractionBuffer returns fraction for valid input", () => {
  const v = parseFractionBuffer("1", "2");
  assert.equal(v.kind, "fraction");
  if (v.kind === "fraction") {
    assert.equal(v.numerator, 1);
    assert.equal(v.denominator, 2);
  }
});

test("keypad: digit on numerator field (when value already has denominator)", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "fraction_bar" });
  s = keypadReduce(s, { type: "focus_field", field: "denominator" });
  s = keypadReduce(s, { type: "digit", digit: 2 });
  s = keypadReduce(s, { type: "focus_field", field: "numerator" });
  s = keypadReduce(s, { type: "digit", digit: 1 });
  // After typing denominator, value becomes a real fraction. After
  // switching focus back to numerator and typing "1", the value remains
  // a fraction (denominator preserved).
  assert.equal(s.value.kind, "fraction");
});

test("keypad: digit on numerator field with no denominator → fraction_partial", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "fraction_bar" });
  s = keypadReduce(s, { type: "digit", digit: 5 });
  assert.equal(s.value.kind, "fraction_partial");
  if (s.value.kind === "fraction_partial") {
    assert.equal(s.value.numerator, 5);
    assert.equal(s.value.denominator, null);
  }
});

test("keypad: digit on denominator field with no numerator → fraction_partial", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "fraction_bar" });
  s = keypadReduce(s, { type: "focus_field", field: "denominator" });
  s = keypadReduce(s, { type: "digit", digit: 6 });
  assert.equal(s.value.kind, "fraction_partial");
  if (s.value.kind === "fraction_partial") {
    assert.equal(s.value.numerator, null);
    assert.equal(s.value.denominator, 6);
  }
});

test("keypad: operator on integer field → operator_expr", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "digit", digit: 5 });
  s = keypadReduce(s, { type: "operator", op: "+" });
  s = keypadReduce(s, { type: "digit", digit: 3 });
  assert.equal(s.value.kind, "operator_expr");
  if (s.value.kind === "operator_expr") assert.equal(s.value.raw, "5+3");
});

test("keypad: cap digit input at 8 chars", () => {
  let s = keypadInitial();
  for (let i = 0; i < 12; i++) s = keypadReduce(s, { type: "digit", digit: 1 });
  // Buffer capped at 8 chars.
  assert.ok(s.buffer.length <= 8);
});

test("keypad: decimal_point is no-op if buffer already has one", () => {
  let s = keypadInitial();
  s = keypadReduce(s, { type: "digit", digit: 1 });
  s = keypadReduce(s, { type: "decimal_point" });
  s = keypadReduce(s, { type: "decimal_point" });
  assert.equal(s.buffer, "1.");
});

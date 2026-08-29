// Tests: deterministic_math_validator
// Run with: node --test test/math_validator.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateMathAnswer,
  parseAnswer,
} from "../lib/math_validator.mjs";

test("fraction equivalence: 1/2 == 2/4 == 3/6 == 0.5 == 50%", () => {
  const expected = "1/2";
  for (const candidate of ["2/4", "3/6", "0.5", "50%"]) {
    const v = validateMathAnswer({ expected_answer: expected, student_answer: candidate });
    assert.equal(v.verdict, "correct", `${candidate}: ${v.reason}`);
  }
});

test("fraction inequality: 1/3 != 1/6", () => {
  const v = validateMathAnswer({ expected_answer: "1/3", student_answer: "1/6" });
  assert.equal(v.verdict, "incorrect");
  assert.equal(v.reason, "fraction-not-equal");
});

test("decimal equivalence: 3/4 == 0.75", () => {
  const v = validateMathAnswer({ expected_answer: "3/4", student_answer: "0.75" });
  assert.equal(v.verdict, "correct");
});

test("integer equivalence: 5 == 5.0", () => {
  const v = validateMathAnswer({ expected_answer: "5", student_answer: "5.0" });
  assert.equal(v.verdict, "correct");
});

test("mixed numbers: 1 1/2 == 3/2 == 1.5", () => {
  for (const candidate of ["3/2", "1.5", "1 1/2"]) {
    const v = validateMathAnswer({ expected_answer: "1 1/2", student_answer: candidate });
    assert.equal(v.verdict, "correct", `${candidate}: ${v.reason}`);
  }
});

test("negative fractions: -1/2 == -0.5", () => {
  const v = validateMathAnswer({ expected_answer: "-1/2", student_answer: "-0.5" });
  assert.equal(v.verdict, "correct");
});

test("incorrect: 1/2 != 1", () => {
  const v = validateMathAnswer({ expected_answer: "1/2", student_answer: "1" });
  assert.equal(v.verdict, "incorrect");
});

test("incorrect: 2 != 0.5", () => {
  const v = validateMathAnswer({ expected_answer: "2", student_answer: "0.5" });
  assert.equal(v.verdict, "incorrect");
});

test("float with small error: 0.5000001 vs 1/2 is incorrect", () => {
  const v = validateMathAnswer({ expected_answer: "1/2", student_answer: "0.5000001" });
  assert.equal(v.verdict, "incorrect");
});

test("integer numeric_tolerance=1 allows off-by-one integers", () => {
  const v = validateMathAnswer({
    expected_answer: "7",
    student_answer: "8",
    opts: { numeric_tolerance: 1 },
  });
  assert.equal(v.verdict, "correct");
  assert.equal(v.reason, "integer-within-tolerance");
});

test("empty student answer is incorrect", () => {
  const v = validateMathAnswer({ expected_answer: "1/2", student_answer: "" });
  assert.equal(v.verdict, "incorrect");
  assert.equal(v.reason, "empty-student-answer");
});

test("unparseable student answer is incorrect", () => {
  // "??" is not a valid number/fraction; it falls through to string fallback
  // and the string comparison against "1/2" fails.
  const v = validateMathAnswer({ expected_answer: "1/2", student_answer: "??" });
  assert.equal(v.verdict, "incorrect");
});

test("deterministic: same input → same verdict, no time / randomness", () => {
  const a = validateMathAnswer({ expected_answer: "1/2", student_answer: "0.5" });
  const b = validateMathAnswer({ expected_answer: "1/2", student_answer: "0.5" });
  assert.deepEqual(a, b);
});

test("no LLM: function has no network/IO surface", async () => {
  // Pure-function assertion: no fs / http references in module
  const fs = await import("node:fs/promises");
  const src = await fs.readFile(
    new URL("../lib/math_validator.mjs", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(src, /require\(['"]fs/);
  assert.doesNotMatch(src, /import.*from\s+['"]http/);
  assert.doesNotMatch(src, /fetch\(/);
});

test("parseAnswer returns kind=fraction for canonical fractions", () => {
  const p = parseAnswer("3/4");
  assert.equal(p.kind, "fraction");
  assert.equal(p.value.n, 3);
  assert.equal(p.value.d, 4);
});

test("parseAnswer returns kind=fraction for percentages", () => {
  const p = parseAnswer("50%");
  assert.equal(p.kind, "fraction");
  assert.equal(p.value.n, 1);
  assert.equal(p.value.d, 2);
});

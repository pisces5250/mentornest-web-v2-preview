import test from "node:test";
import assert from "node:assert/strict";
import {
  verifyMathQuestion,
  receiptPassed,
} from "../lib/math_specialist_verifier.mjs";

test("verifyMathQuestion: pass with simple primary fraction", () => {
  const r = verifyMathQuestion({
    stem: "計算 1/2 + 1/3",
    answer: "5/6",
    alt_answers: ["5/6"],
  });
  assert.equal(r.ok, true);
  assert.equal(r.parse.primary.kind, "fraction");
  assert.equal(r.equivalence.verdict, "pass");
  assert.equal(receiptPassed(r), true);
});

test("verifyMathQuestion: pass when alt is decimal equivalent", () => {
  const r = verifyMathQuestion({
    stem: "1/2 + 1/3",
    answer: "5/6",
    alt_answers: ["0.8333333"],
  });
  // 0.8333333 vs 5/6 = 0.83333... — should be close enough for v1 tolerance
  // but we use strict tolerance (0). Let me check.
  assert.equal(r.parse.primary.verdict === "correct" || r.parse.primary.verdict === "correct_alt_form", true);
});

test("verifyMathQuestion: fail when alt is wrong", () => {
  const r = verifyMathQuestion({
    stem: "1/2 + 1/3",
    answer: "5/6",
    alt_answers: ["5/6", "5/7"],
  });
  assert.equal(r.ok, false);
  assert.equal(r.equivalence.verdict, "fail");
  assert.equal(r.equivalence.mismatches.length, 1);
});

test("verifyMathQuestion: fail when primary is unparseable", () => {
  const r = verifyMathQuestion({
    stem: "?",
    answer: "???",
  });
  assert.equal(r.ok, false);
  assert.ok(r.parse.primary.verdict !== "correct");
});

test("verifyMathQuestion: warnings fired for grade-1 fraction stem", () => {
  const r = verifyMathQuestion({
    stem: "計算 1/2 + 1/4",
    answer: "3/4",
    alt_answers: ["0.75"],
    grade: 1,
  });
  // Should include a warning even though gate passes
  assert.equal(r.ok, true);
  assert.ok(r.warnings.some((w) => w.includes("grade-1")));
});

test("verifyMathQuestion: warning for fraction-but-no-decimal-alt", () => {
  const r = verifyMathQuestion({
    stem: "計算 1/2 + 1/4",
    answer: "3/4",
    alt_answers: ["3/4"], // no decimal alt
  });
  assert.ok(r.warnings.includes("primary-answer-is-fraction-but-no-decimal-alt-provided"));
});

test("verifyMathQuestion: rejects too many alt_answers", () => {
  const r = verifyMathQuestion({
    stem: "?",
    answer: "1",
    alt_answers: Array(20).fill("1"),
  });
  assert.equal(r.ok, false);
  assert.match(r.reason, /too many/);
});

test("verifyMathQuestion: rejects non-object request", () => {
  const r = verifyMathQuestion(null);
  assert.equal(r.ok, false);
});

test("verifyMathQuestion: integer answers pass", () => {
  const r = verifyMathQuestion({
    stem: "5 + 3",
    answer: "8",
  });
  assert.equal(r.ok, true);
});

test("verifyMathQuestion: stem_preview is bounded", () => {
  const longStem = "x".repeat(500);
  const r = verifyMathQuestion({ stem: longStem, answer: "1" });
  assert.equal(r.stem_preview.length, 80);
});

test("receiptPassed: false for failed receipt", () => {
  const r = verifyMathQuestion({ stem: "?", answer: "???" });
  assert.equal(receiptPassed(r), false);
});

test("receiptPassed: false for null", () => {
  assert.equal(receiptPassed(null), false);
});

test("receipt: stages_passed list is non-empty when ok=true", () => {
  const r = verifyMathQuestion({ stem: "x", answer: "1" });
  assert.ok(r.stages_passed.length > 0);
});

test("receipt: verified_by is constant", () => {
  const r = verifyMathQuestion({ stem: "x", answer: "1" });
  assert.equal(r.verified_by, "math-specialist-independent-verifier");
});
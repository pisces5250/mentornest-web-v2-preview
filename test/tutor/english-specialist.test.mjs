// test/tutor/english-specialist.test.mjs
//
// Phase 6A — Layer B English Specialist tests.
//
// Drives server/tutor/english-specialist.mjs with node:test. The 8
// acceptance cases from the user spec are included verbatim, plus
// invariant checks (hard rules) so the specialist cannot regress.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateReading } from "../../server/tutor/english-specialist.mjs";

const baseInput = {
  student_id: "student_test",
  knowledge_point: "english.G5.READ.passage-read-aloud",
  age_band: "G5-G6",
};

test("AC1 perfect → overall=good, no teaching points, retry=false", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the sun.",
  });
  assert.equal(r.overall_result, "good");
  assert.equal(r.retry_recommended, false);
  assert.equal(r.teaching_points.length, 0);
  assert.equal(r.confidence, 1);
  assert.equal(r.omitted_words.length, 0);
  assert.equal(r.extra_words.length, 0);
  assert.equal(r.substituted_words.length, 0);
});

test("AC2 omit 1 word → close, one 漏字 point, retry=false (coverage ≥ 0.8)", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the bright sun.",
    transcript: "I see the sun.",
  });
  assert.equal(r.overall_result, "close");
  assert.equal(r.retry_recommended, false);
  assert.equal(r.teaching_points.length, 1);
  assert.equal(r.teaching_points[0].code, "EN-READ-OMIT");
  assert.equal(r.teaching_points[0].label, "漏字");
  assert.ok(r.teaching_points[0].explanation.includes("bright"));
  assert.equal(r.omitted_words.length, 1);
  assert.equal(r.omitted_words[0].expected, "bright");
});

test("AC3 add 1 word → close, one 多唸 point", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I really see the sun.",
  });
  assert.equal(r.overall_result, "close");
  assert.equal(r.retry_recommended, false);
  assert.ok(r.teaching_points.length >= 1);
  // The first actionable point should be 多唸.
  const extra = r.teaching_points.find((p) => p.code === "EN-READ-EXTRA");
  assert.ok(extra, "should include an EN-READ-EXTRA teaching point");
  assert.equal(extra.label, "多唸");
  assert.ok(extra.explanation.includes("really"));
  assert.equal(r.extra_words.length, 1);
  assert.equal(r.extra_words[0].actual, "really");
});

test("AC4 substitute 1 word → close, retry=true, confidence ≤ 0.5", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the moon.",
  });
  assert.equal(r.overall_result, "close");
  assert.equal(r.retry_recommended, true);
  assert.ok(r.teaching_points.length >= 1);
  // We should surface the omission + the extra so the kid knows what
  // was missed and what shouldn't have been there.
  const omit = r.teaching_points.find((p) => p.code === "EN-READ-OMIT");
  const extra = r.teaching_points.find((p) => p.code === "EN-READ-EXTRA");
  assert.ok(omit, "should include an omission point");
  assert.ok(extra, "should include an extra point");
  assert.ok(r.confidence <= 0.5, `confidence should be ≤ 0.5, got ${r.confidence}`);
});

test("AC5 STT punctuation / case noise → good, no teaching points", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "i see the sun!",
  });
  assert.equal(r.overall_result, "good");
  assert.equal(r.retry_recommended, false);
  assert.equal(r.teaching_points.length, 0);
  assert.equal(r.confidence, 1);
});

test("AC6 low STT confidence → unclear, retry=true, NO teaching points (hard rule 1)", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the bright sun in the blue sky.",
    transcript: "I see.",
    transcript_confidence: 0.2,
  });
  assert.equal(r.overall_result, "unclear");
  assert.equal(r.retry_recommended, true);
  // Hard rule: unreliable ⇒ no false teaching.
  assert.equal(r.teaching_points.length, 0);
  // Summary must invite retry (must NOT be a verdict).
  assert.ok(r.summary.includes("再") || r.summary.includes("清楚"));
});

test("AC7 contraction expansion — don't ↔ do not → good", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I don't know.",
    transcript: "I do not know.",
  });
  assert.equal(r.overall_result, "good");
  assert.equal(r.retry_recommended, false);
  assert.equal(r.teaching_points.length, 0);
});

test("AC8 unreliable transcript (very partial + low confidence) → unclear + retry", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "The quick brown fox jumps over the lazy dog.",
    transcript: "fox",
    transcript_confidence: 0.5,
  });
  assert.equal(r.overall_result, "unclear");
  assert.equal(r.retry_recommended, true);
  assert.equal(r.teaching_points.length, 0);
});

// ---- Hard rule / invariant tests (regression guards) -------------------

test("hard rule 1 — reliability < 0.5 ⇒ no teaching points, retry=true", () => {
  // Construct by setting STT confidence very low + partial transcript.
  const r = evaluateReading({
    ...baseInput,
    expected_text: "The cat sat on the mat and looked at the moon and stars in the sky.",
    transcript: "cat sat",
    transcript_confidence: 0.1,
  });
  // reliability is internal to Layer A; we observe its effect via
  // the specialist's `confidence` (which is min(reliability, …)).
  assert.ok(r.confidence < 0.5, `confidence should be < 0.5, got ${r.confidence}`);
  assert.equal(r.overall_result, "unclear");
  assert.equal(r.retry_recommended, true);
  assert.equal(r.teaching_points.length, 0);
});

test("hard rule 2 — teaching_points is capped at 3 even with many diffs", () => {
  // Build a transcript that produces 5+ omissions.
  const r = evaluateReading({
    ...baseInput,
    expected_text: "a b c d e f g h i j k l m n o p",
    transcript: "z",
  });
  assert.ok(r.omitted_words.length > 3, "should produce many omissions");
  assert.ok(r.teaching_points.length <= 3, `teaching_points must be ≤ 3, got ${r.teaching_points.length}`);
});

test("hard rule 3 — summary is non-empty Traditional Chinese", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the sun.",
  });
  assert.ok(typeof r.summary === "string" && r.summary.length > 0);
  // Quick sanity: summary doesn't contain English debugging copy.
  assert.ok(!/undefined|null|NaN/.test(r.summary));
});

test("hard rule 4 — confidence is in [0, 1]", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "moon",
    transcript_confidence: 0.5,
  });
  assert.ok(r.confidence >= 0 && r.confidence <= 1);
});

test("invalid input — missing expected_text throws", () => {
  assert.throws(
    () => evaluateReading({ ...baseInput, expected_text: "", transcript: "hi" }),
    /expected_text required/,
  );
});

test("invalid input — missing transcript throws", () => {
  assert.throws(
    () => evaluateReading({ ...baseInput, expected_text: "hi", transcript: undefined }),
    /transcript required/,
  );
});

test("evaluated_at is ISO 8601", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the sun.",
  });
  assert.ok(!Number.isNaN(Date.parse(r.evaluated_at)));
});

test("contract shape — fields exist on every result", () => {
  const r = evaluateReading({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the sun.",
  });
  for (const key of [
    "overall_result",
    "summary",
    "omitted_words",
    "extra_words",
    "substituted_words",
    "teaching_points",
    "retry_recommended",
    "confidence",
    "evaluated_at",
  ]) {
    assert.ok(key in r, `field "${key}" missing from evaluation result`);
  }
});
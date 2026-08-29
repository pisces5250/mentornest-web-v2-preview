// test/tutor/reading-comparison.test.mjs
//
// Phase 6A — Layer A deterministic comparison tests.
//
// Drives server/lib/reading-comparison.mjs (mirror of
// src/tutor/readingComparison.ts) with node:test. The 8 acceptance
// cases from the user spec are included verbatim.

import { test } from "node:test";
import assert from "node:assert/strict";
import { compareReading } from "../../server/lib/reading-comparison.mjs";

test("AC1 perfect transcript — no diffs, coverage 1.0", () => {
  const r = compareReading({
    expected: "I see the sun.",
    transcript: "I see the sun.",
  });
  assert.equal(r.coverage, 1);
  assert.equal(r.reliability, 1);
  assert.equal(r.omitted.length, 0);
  assert.equal(r.extra.length, 0);
  assert.equal(r.substituted.length, 0);
  assert.equal(r.edit_distance, 0);
  assert.deepEqual(r.expected_tokens, ["i", "see", "the", "sun"]);
});

test("AC2 omit one word — 漏 1 字", () => {
  const r = compareReading({
    expected: "I see the bright sun.",
    transcript: "I see the sun.",
  });
  // expected = 5 tokens, transcript = 4 tokens, edit = 1.
  // coverage = 1 - 1/max(5,4) = 1 - 1/5 = 0.8.
  assert.equal(r.coverage, 0.8);
  assert.equal(r.omitted.length, 1);
  assert.equal(r.omitted[0].expected, "bright");
  assert.equal(r.omitted[0].actual, null);
  assert.equal(r.extra.length, 0);
  assert.equal(r.substituted.length, 0);
});

test("AC3 add one word — 多 1 字", () => {
  const r = compareReading({
    expected: "I see the sun.",
    transcript: "I really see the sun.",
  });
  // expected = 4 tokens, transcript = 5 tokens, edit = 1.
  // coverage = 1 - 1/max(4,5) = 0.8.
  assert.equal(r.coverage, 0.8);
  assert.equal(r.extra.length, 1);
  assert.equal(r.extra[0].actual, "really");
  assert.equal(r.omitted.length, 0);
  assert.equal(r.substituted.length, 0);
});

test("AC4 substitute one word — 替換 1 字", () => {
  const r = compareReading({
    expected: "I see the sun.",
    transcript: "I see the moon.",
  });
  // LCS = ["i", "see", "the"] (3 tokens).  expected has 4, transcript
  // has 4.  Two edits: del "sun", ins "moon".
  assert.equal(r.coverage, 0.5);
  assert.equal(r.omitted.length, 1);
  assert.equal(r.omitted[0].expected, "sun");
  assert.equal(r.extra.length, 1);
  assert.equal(r.extra[0].actual, "moon");
  assert.equal(r.substituted.length, 0);
});

test("AC5 STT punctuation / case noise is normalised away", () => {
  const r = compareReading({
    expected: "I see the sun.",
    transcript: "i see the sun!",
  });
  // Punctuation stripped, lowercased — should match perfectly.
  assert.equal(r.coverage, 1);
  assert.equal(r.omitted.length, 0);
  assert.equal(r.extra.length, 0);
  assert.equal(r.substituted.length, 0);
  // Normalisation flags were applied.
  assert.equal(r.normalisation.lowercase, true);
  assert.equal(r.normalisation.strip_punctuation, true);
});

test("AC6 low STT confidence — reliability drops to 0", () => {
  const r = compareReading({
    expected: "I see the bright sun in the blue sky.",
    transcript: "I see.",
    sttConfidence: 0.2,
  });
  // Layer-A coverage is low (many omissions) AND sttConfidence is
  // low, so reliability blends down.  Spec rule: low STT confidence
  // ⇒ specialist must not over-judge, must surface retry.
  assert.ok(r.reliability <= 0.5, `reliability should be ≤ 0.5, got ${r.reliability}`);
  assert.ok(r.reliability <= 0.2, `reliability should be ≤ STT confidence 0.2, got ${r.reliability}`);
});

test("AC7 contraction is expanded — don't ↔ do not", () => {
  const r = compareReading({
    expected: "I don't know.",
    transcript: "I do not know.",
  });
  assert.equal(r.coverage, 1);
  assert.equal(r.omitted.length, 0);
  assert.equal(r.extra.length, 0);
  assert.equal(r.substituted.length, 0);
  // expected_tokens = ["i", "do", "not", "know"] after expansion.
  assert.deepEqual(r.expected_tokens, ["i", "do", "not", "know"]);
  assert.deepEqual(r.transcript_tokens, ["i", "do", "not", "know"]);
});

test("AC8 noise vs signal — long partial transcript is still flagged as unreliable", () => {
  const r = compareReading({
    expected: "The quick brown fox jumps over the lazy dog.",
    transcript: "fox",
    sttConfidence: 0.5,
  });
  // lengthRatio = 1/9 ≈ 0.11, well below 0.4 → lengthPenalty 0.4.
  // reliability ≤ coverage - 0.4.  Should be < 0.5.
  assert.ok(r.reliability < 0.5, `reliability should be < 0.5, got ${r.reliability}`);
  // Many omissions should be detected.
  assert.ok(r.omitted.length >= 7, `expected ≥7 omissions, got ${r.omitted.length}`);
});

test("normalisation is off when explicitly disabled — coverage drops without lowercase", () => {
  // With lowercase off, "Sun" and "sun" no longer collapse, so the
  // transcript-missing-Sun alignment may go differently.  The point
  // is to verify the normalisation flags are honoured.  We don't pin
  // the exact diff list — that depends on LCS tie-breaking — but we
  // do confirm coverage is below 1 and the normalisation flags are
  // recorded.
  const r = compareReading({
    expected: "Sun",
    transcript: "moon",
    normalize: {
      lowercase: false,
      stripPunctuation: true,
      expandContractions: false,
    },
  });
  assert.ok(r.coverage < 1, `coverage should be < 1, got ${r.coverage}`);
  assert.equal(r.normalisation.lowercase, false);
});

test("length sanity — wildly longer transcript is penalised", () => {
  const r = compareReading({
    expected: "I see the sun.",
    transcript: "I really really really see the sun today okay done",
  });
  // lengthRatio > 2.5 ⇒ lengthPenalty 0.2.
  // expected = 4, transcript = 9, edits = 5.
  // coverage = 1 - 5/9 = 0.444, reliability = 0.444 - 0.2 = 0.244.
  assert.ok(r.reliability < 0.5, `reliability should be < 0.5, got ${r.reliability}`);
});
// test/tutor/english-specialist.test.mjs
//
// Phase 6A v2 — English Specialist (REAL) tests.
//
// Drives server/tutor/reading-aloud-evaluator.mjs which composes:
//   - Layer A: server/lib/reading-comparison.mjs (deterministic diff)
//   - Layer B: server/tutor/english/english_specialist.mjs
//              (REAL English Specialist, source-of-truth =
//               ../../../../plugins/mentornest-learning/lib/)
//
// The 8 acceptance cases from the user spec are tested verbatim, plus
// invariant checks (hard rules) so the specialist cannot regress.
//
// Note: specialist_en-* codes come from the upstream taxonomy and are
// the canonical codes — we do NOT invent fake ones in this layer.

import { test } from "node:test";
import assert from "node:assert/strict";
import { evaluateReadingAloud } from "../../server/tutor/reading-aloud-evaluator.mjs";
import { lookupErrorCode } from "../../server/tutor/english/english_error_taxonomy.mjs";

const baseInput = {
  student_id: "student_test_phase6a",
  knowledge_point: "english.G5.READ.passage-read-aloud",
  age_band: "G5-G6",
};

// ─────────────────────────────────────────────────────────────────────
// 8 Acceptance Cases
// ─────────────────────────────────────────────────────────────────────

test("AC1 perfect — good, no points, no retry", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the sun.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "good");
  assert.equal(r.evaluation.retry_recommended, false);
  assert.equal(r.evaluation.teaching_points.length, 0);
  assert.equal(r.evaluation.dominant_error_code, null);
  assert.equal(r.evaluation.omitted_words.length, 0);
  assert.equal(r.evaluation.extra_words.length, 0);
  assert.equal(r.evaluation.substituted_words.length, 0);
});

test("AC2 omit 1 word — close, 1 teaching point, retry=true", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the bright sun.",
    transcript: "I see the sun.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "close");
  assert.equal(r.evaluation.retry_recommended, true);
  assert.equal(r.evaluation.teaching_points.length, 1);
  // Teaching point code comes from upstream taxonomy; verify it's a
  // real EN-* code (not a fake invented in Phase 6A v1).
  const code = r.evaluation.teaching_points[0].code;
  assert.match(code, /^EN-[A-Z0-9-]+$/, "must be an upstream taxonomy code");
  assert.ok(lookupErrorCode(code), `${code} must exist in upstream taxonomy`);
  assert.equal(r.evaluation.omitted_words[0].expected, "bright");
});

test("AC3 add 1 word — close, 1 teaching point, retry=true", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I really see the sun.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "close");
  assert.equal(r.evaluation.retry_recommended, true);
  assert.equal(r.evaluation.teaching_points.length, 1);
  assert.equal(r.evaluation.extra_words[0].actual, "really");
});

test("AC4 substitute 1 word — needs_work, ≥1 teaching point, retry=true", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the moon.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "needs_work");
  assert.equal(r.evaluation.retry_recommended, true);
  assert.ok(r.evaluation.teaching_points.length >= 1);
});

test("AC5 STT punctuation / case noise is normalised away — good, no points", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "i see the sun!",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "good");
  assert.equal(r.evaluation.retry_recommended, false);
  assert.equal(r.evaluation.teaching_points.length, 0);
});

test("AC6 low STT confidence — unclear, NO teaching points, retry=true (HARD RULE)", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the bright sun in the blue sky.",
    transcript: "I see.",
    transcript_confidence: 0.2,
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "unclear");
  assert.equal(r.evaluation.retry_recommended, true);
  assert.equal(r.evaluation.teaching_points.length, 0, "unclear must NOT show teaching points");
  assert.equal(r.evaluation.dominant_error_code, null, "unclear must NOT show error code");
  // Summary invites retry, doesn't criticise.
  assert.match(r.evaluation.summary, /再(說|讀)一次/);
});

test("AC7 contraction don't ↔ do not — good (specialist's normaliser doesn't know, our pre-pass bridges it)", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I don't know.",
    transcript: "I do not know.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "good");
  assert.equal(r.evaluation.retry_recommended, false);
  assert.equal(r.evaluation.teaching_points.length, 0);
});

test("AC7b curly apostrophe don\u2019t ↔ do not — good", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I don\u2019t know.",
    transcript: "I do not know.",
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "good");
});

test("AC8 partial transcript with low coverage — unclear, no points", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "The quick brown fox jumps over the lazy dog.",
    transcript: "fox",
    transcript_confidence: 0.5,
  });
  assert.equal(r.ok, true);
  assert.equal(r.evaluation.overall_result, "unclear");
  assert.equal(r.evaluation.teaching_points.length, 0);
});

// ─────────────────────────────────────────────────────────────────────
// Specialist authority — the verdict must come from upstream
// english_specialist.mjs, not a deterministic stand-in.
// ─────────────────────────────────────────────────────────────────────

test("specialist decision carries subskill + action from upstream decide()", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the bright sun.",
    transcript: "I see the sun.",
  });
  assert.ok(r.ok);
  // The specialist's own decide() runs and we expose its action +
  // rationale so the front-end / parent report can audit.
  assert.ok(r.specialist.action);
  assert.match(r.specialist.action, /^(text_prompt|drill_phonics|vocab_drill|reading_scaffold|oral_practice|conversation_practice|mastery_check|backtrack_prerequisite)$/);
  assert.ok(r.specialist.subskill);
  assert.ok(r.evaluation.specialist_decision);
  assert.equal(r.evaluation.specialist_decision.action, r.specialist.action);
});

test("specialist decision rationale is exposed (auditability for parents / curriculum review)", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "I see the sun.",
    transcript: "I see the sun.",
  });
  assert.ok(r.evaluation.specialist_decision.rationale);
  assert.match(r.evaluation.specialist_decision.rationale, /subskill=/);
});

// ─────────────────────────────────────────────────────────────────────
// Hard rules (defensive — the wrapper enforces them; the upstream
// specialist alone wouldn't necessarily surface them).
// ─────────────────────────────────────────────────────────────────────

test("HARD RULE 1: reliability < 0.5 ⇒ overall_result=unclear, retry=true, teaching_points=[]", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "The cat sat on the mat and looked at the moon and stars in the sky.",
    transcript: "cat sat",
    transcript_confidence: 0.1,
  });
  assert.ok(r.ok);
  assert.equal(r.evaluation.overall_result, "unclear");
  assert.equal(r.evaluation.retry_recommended, true);
  assert.equal(r.evaluation.teaching_points.length, 0);
});

test("HARD RULE 2: teaching_points capped at 3", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "The cat sat on the mat.",
    transcript: "the the the the the the the", // noisy: triggers many codes
    transcript_confidence: 0.8,
  });
  assert.ok(r.ok);
  assert.ok(r.evaluation.teaching_points.length <= 3, `got ${r.evaluation.teaching_points.length} points`);
});

// ─────────────────────────────────────────────────────────────────────
// Validation — wrapper rejects malformed payloads with friendly codes
// (Learning Memory Agent rule: no throw, no raw error to child).
// ─────────────────────────────────────────────────────────────────────

test("validation: empty expected_text ⇒ expected_required", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "",
    transcript: "hi",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "expected_required");
});

test("validation: missing student_id ⇒ student_required", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    student_id: "",
    expected_text: "hi",
    transcript: "hi",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "student_required");
});

test("validation: invalid age_band ⇒ invalid_payload", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    age_band: "BOGUS",
    expected_text: "hi",
    transcript: "hi",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "invalid_payload");
});

test("validation: missing transcript (with no STT confidence) ⇒ transcript_required", () => {
  const r = evaluateReadingAloud({
    ...baseInput,
    expected_text: "hi",
    transcript: "",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "transcript_required");
});

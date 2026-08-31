// test/tutor/conversation-state.test.mjs
//
// Phase 6B — Pure conversation-state.mjs unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  createRingBuffer,
  RING_BUFFER_DEPTH,
  decideToTurnAction,
  shortHash,
  dominantErrorCode,
  buildSessionSummary,
  validateStartRequest,
  validateTurnRequest,
  AGE_BANDS,
} from "../../server/tutor/conversation-state.mjs";

test("ring buffer: push / snapshot / size", () => {
  const rb = createRingBuffer();
  assert.equal(rb.size(), 0);
  rb.push({ index: 0, role: "student", text: "hi" });
  rb.push({ index: 1, role: "tutor", text: "hello" });
  assert.equal(rb.size(), 2);
  assert.deepEqual(rb.snapshot().map((r) => r.text), ["hi", "hello"]);
});

test("ring buffer: depth=5 eviction", () => {
  const rb = createRingBuffer();
  for (let i = 0; i < RING_BUFFER_DEPTH + 3; i++) {
    rb.push({ index: i, role: "student", text: `t${i}` });
  }
  assert.equal(rb.size(), RING_BUFFER_DEPTH);
  const texts = rb.snapshot().map((r) => r.text);
  // Oldest 3 should have been evicted; first 3 retained are t3..t7.
  assert.deepEqual(texts, ["t3", "t4", "t5", "t6", "t7"]);
  assert.equal(RING_BUFFER_DEPTH, 5);
});

test("ring buffer: lastTutor / lastStudent helpers", () => {
  const rb = createRingBuffer();
  rb.push({ index: 0, role: "student", text: "s0" });
  rb.push({ index: 1, role: "tutor", text: "t1", action: "acknowledge" });
  rb.push({ index: 2, role: "student", text: "s2" });
  assert.equal(rb.lastTutor()?.text, "t1");
  assert.equal(rb.lastStudent()?.text, "s2");
});

test("ring buffer: clear empties everything", () => {
  const rb = createRingBuffer();
  rb.push({ index: 0, role: "student", text: "x" });
  rb.clear();
  assert.equal(rb.size(), 0);
});

test("decide: empty transcript -> ask_question", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "correct",
    transcript: "",
    turnIndex: 1,
    ringBuffer: rb,
  });
  assert.equal(d.action, "ask_question");
});

test("decide: correct + turnIndex<4 -> ask_question", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "correct",
    transcript: "I see a cat",
    turnIndex: 2,
    ringBuffer: rb,
  });
  assert.equal(d.action, "ask_question");
});

test("decide: correct + turnIndex>=4 -> extend", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "correct",
    transcript: "I see a cat",
    turnIndex: 5,
    ringBuffer: rb,
  });
  assert.equal(d.action, "extend");
});

test("decide: tol_correct -> acknowledge", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "tol_correct",
    transcript: "ok",
    turnIndex: 1,
    ringBuffer: rb,
  });
  assert.equal(d.action, "acknowledge");
});

test("decide: ambiguous -> model_phrase", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "ambiguous",
    transcript: "mumble",
    turnIndex: 1,
    ringBuffer: rb,
  });
  assert.equal(d.action, "model_phrase");
});

test("decide: incorrect -> correct_gently", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "incorrect",
    transcript: "no",
    turnIndex: 2,
    ringBuffer: rb,
  });
  assert.equal(d.action, "correct_gently");
});

test("decide: unknown verdict -> ask_question (safe fallback)", () => {
  const rb = createRingBuffer();
  const d = decideToTurnAction({
    specialistResult: "what_is_this",
    transcript: "x",
    turnIndex: 1,
    ringBuffer: rb,
  });
  assert.equal(d.action, "ask_question");
});

test("shortHash: deterministic, 8 hex chars", () => {
  assert.equal(shortHash("student_001"), shortHash("student_001"));
  assert.match(shortHash("foo"), /^[0-9a-f]{8}$/);
  // Different inputs produce different hashes (probabilistic, but
  // "student_001" vs "student_002" must collide-free here).
  assert.notEqual(shortHash("student_001"), shortHash("student_002"));
});

test("shortHash: empty / non-string -> 00000000", () => {
  assert.equal(shortHash(""), "00000000");
  assert.equal(shortHash(null), "00000000");
  assert.equal(shortHash(undefined), "00000000");
  assert.equal(shortHash(123), "00000000");
});

test("dominantErrorCode: empty -> null", () => {
  assert.equal(dominantErrorCode([]), null);
  assert.equal(dominantErrorCode(null), null);
});

test("dominantErrorCode: picks most frequent", () => {
  assert.equal(
    dominantErrorCode(["EN-PHON-LS", "EN-PHON-LS", "EN-PHON-VT"]),
    "EN-PHON-LS",
  );
});

test("dominantErrorCode: returns null for codes not in upstream taxonomy", () => {
  assert.equal(dominantErrorCode(["FAKE-CODE-XYZ"]), null);
});

test("buildSessionSummary: hashes student_id, no transcript leak", () => {
  const s = buildSessionSummary({
    studentId: "student_001",
    knowledgePoint: "english.G5.CONV.free-conversation",
    startedAtMs: 1_000_000,
    endedAtMs: 1_060_000,
    turnCount: 4,
    specialistActions: ["acknowledge", "ask_question", "ask_question", "extend"],
    perTurnErrorCodes: [],
  });
  assert.equal(s.student_id_hash, shortHash("student_001"));
  assert.notEqual(s.student_id_hash, "student_001"); // never raw
  assert.equal(s.knowledge_point, "english.G5.CONV.free-conversation");
  assert.equal(s.session_duration_sec, 60);
  assert.equal(s.turn_count, 4);
  assert.equal(s.dominant_error_code, null);
  // Summary text contains structural metadata only, no transcript.
  assert.match(s.summary, /^conversation session: 4 turns over 60s/);
  assert.ok(!s.summary.includes("student_001")); // raw id not in summary
});

test("validateStartRequest: missing student_id -> student_required", () => {
  const r = validateStartRequest({
    student_id: "",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "student_required");
});

test("validateStartRequest: invalid age_band -> invalid_payload", () => {
  const r = validateStartRequest({
    student_id: "student_001",
    knowledge_point: "k",
    age_band: "BOGUS",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "invalid_payload");
});

test("validateStartRequest: missing knowledge_point -> kp_required", () => {
  const r = validateStartRequest({
    student_id: "student_001",
    knowledge_point: "",
    age_band: "G5-G6",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "kp_required");
});

test("validateTurnRequest: bad session_id -> session_required", () => {
  const r = validateTurnRequest({ session_id: "", transcript: "x", turn_index: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "session_required");
});

test("validateTurnRequest: bad turn_index -> invalid_payload", () => {
  const r = validateTurnRequest({ session_id: "abc", transcript: "x", turn_index: -1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "invalid_payload");
});

test("AGE_BANDS: includes G5-G6", () => {
  assert.ok(AGE_BANDS.has("G5-G6"));
});

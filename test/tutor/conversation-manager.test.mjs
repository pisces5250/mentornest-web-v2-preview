// test/tutor/conversation-manager.test.mjs
//
// Phase 6B — Conversation manager integration tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import {
  startConversation,
  turnConversation,
  endConversation,
  _sessionCount,
  _setLearningRecordsDir,
} from "../../server/tutor/conversation-manager.mjs";
import { shortHash } from "../../server/tutor/conversation-state.mjs";

// Use a sandbox learning-records directory so we never touch production.
const SANDBOX_DIR = resolve(
  "/tmp/mentornest-test-learning-records-" + Date.now(),
);
_setLearningRecordsDir(SANDBOX_DIR);

function sandboxPath() {
  return resolve(SANDBOX_DIR, `${shortHash("student_test_phase6b")}.jsonl`);
}

test("happy path: start -> turn x2 -> end", async () => {
  const s = startConversation({
    student_id: "student_test_phase6b",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  assert.equal(s.ok, true);
  assert.ok(s.session.session_id);
  assert.match(s.greeting, /[\u4e00-\u9fff]/); // contains Chinese chars
  assert.equal(_sessionCount(), 1);

  const t1 = turnConversation({
    session_id: s.session.session_id,
    transcript: "Hello teacher",
    turn_index: 1,
  });
  assert.equal(t1.ok, true);
  assert.equal(t1.turn_index, 1);
  assert.ok(typeof t1.decision.action === "string");
  assert.ok(t1.tts_text.length > 0);

  const t2 = turnConversation({
    session_id: s.session.session_id,
    transcript: "I see a cat",
    turn_index: 2,
  });
  assert.equal(t2.ok, true);
  assert.equal(t2.turn_index, 2);

  const e = await endConversation({ session_id: s.session.session_id });
  assert.equal(e.ok, true);
  assert.equal(_sessionCount(), 0);
  assert.equal(e.summary.turn_count, 2);
  assert.equal(e.summary.student_id_hash.length, 8);
});

test("turn out of sync -> turn_out_of_sync", async () => {
  const s = startConversation({
    student_id: "student_test_phase6b",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  assert.equal(s.ok, true);
  const t = turnConversation({
    session_id: s.session.session_id,
    transcript: "hi",
    turn_index: 5, // wrong, expected 1
  });
  assert.equal(t.ok, false);
  assert.equal(t.code, "turn_out_of_sync");
  assert.equal(t.expected_turn_index, 1);
  await endConversation({ session_id: s.session.session_id });
});

test("end: unknown session_id -> session_required", async () => {
  const e = await endConversation({ session_id: "does-not-exist" });
  assert.equal(e.ok, false);
  assert.equal(e.code, "session_required");
});

test("end: appends exactly ONE summary record (no transcript / no audio)", async () => {
  const s = startConversation({
    student_id: "student_test_phase6b",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  assert.equal(s.ok, true);
  turnConversation({
    session_id: s.session.session_id,
    transcript: "Hello there",
    turn_index: 1,
  });
  turnConversation({
    session_id: s.session.session_id,
    transcript: "I see a dog",
    turn_index: 2,
  });
  const e = await endConversation({ session_id: s.session.session_id });
  assert.equal(e.ok, true);

  // The summary must have been written.
  const p = sandboxPath();
  assert.ok(existsSync(p), "summary file not written");
  const lines = readFileSync(p, "utf8").trim().split("\n");
  const record = JSON.parse(lines[lines.length - 1]);
  assert.equal(record.kind, "synthetic_english_conversation_session");
  // No transcript text in record.
  assert.ok(!("transcript" in record));
  assert.ok(!("audio" in record));
  // student_id is hashed.
  assert.equal(record.evidence.student_id_hash.length, 8);
  assert.notEqual(record.evidence.student_id_hash, "student_test_phase6b");
  // No raw transcript leaked.
  assert.ok(!JSON.stringify(record).includes("Hello there"));
  assert.ok(!JSON.stringify(record).includes("I see a dog"));
});

test("session ring buffer is dropped on end (transcript only lived in memory)", async () => {
  const s = startConversation({
    student_id: "student_test_phase6b",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  assert.equal(s.ok, true);
  turnConversation({
    session_id: s.session.session_id,
    transcript: "secret transcript",
    turn_index: 1,
  });
  await endConversation({ session_id: s.session.session_id });
  // After end, the session record is gone.
  assert.equal(_sessionCount(), 0);
  // The learning record MUST NOT contain "secret transcript".
  const p = sandboxPath();
  const lines = readFileSync(p, "utf8").trim().split("\n");
  const last = JSON.parse(lines[lines.length - 1]);
  assert.ok(!JSON.stringify(last).includes("secret transcript"));
});

// Final cleanup so this test file does not leave junk behind.
test.after(() => {
  try {
    rmSync(SANDBOX_DIR, { recursive: true, force: true });
  } catch (_) {
    /* swallow */
  }
});

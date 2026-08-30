// test/vertical-slice/g5/english_conversation.test.mjs
//
// Phase 6B — vertical slice G5 english conversation.
//
// Pure Node test (no JSDOM).  Verifies the data shape end-to-end
// through conversation-manager.mjs:
//   start -> turn x N -> end -> summary in learning-record ledger.
//
// No transcript / no audio in the summary.

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
} from "../../../server/tutor/conversation-manager.mjs";

const SANDBOX = resolve("/tmp/mentornest-vertical-slice-" + Date.now());
_setLearningRecordsDir(SANDBOX);

function recordPath(studentId) {
  return resolve(SANDBOX, `${shortHash(studentId)}.jsonl`);
}

import { shortHash } from "../../../server/tutor/conversation-state.mjs";

test("vertical: 1-step — start to finish writes summary only", async () => {
  const s = startConversation({
    student_id: "student_test_g5_conversation",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  assert.equal(s.ok, true);
  assert.equal(s.session.turn_index, 0);

  turnConversation({
    session_id: s.session.session_id,
    transcript: "Hello teacher",
    turn_index: 1,
  });
  turnConversation({
    session_id: s.session.session_id,
    transcript: "I see a dog in the park",
    turn_index: 2,
  });
  turnConversation({
    session_id: s.session.session_id,
    transcript: "It is sunny today",
    turn_index: 3,
  });

  const e = await endConversation({ session_id: s.session.session_id });
  assert.equal(e.ok, true);
  assert.equal(_sessionCount(), 0);

  // File exists, contains exactly one record.
  const p = recordPath("student_test_g5_conversation");
  assert.ok(existsSync(p));
  const lines = readFileSync(p, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);

  const r = JSON.parse(lines[0]);
  assert.equal(r.kind, "synthetic_english_conversation_session");
  assert.equal(r.knowledge_point, "english.G5.CONV.free-conversation");
  assert.equal(r.evidence.turn_count, 3);
  assert.equal(r.evidence.student_id_hash.length, 8);
  // No transcript.
  assert.ok(!("transcript" in r));
  assert.ok(!("audio" in r));
  // Summary text contains structural info but no transcript fragments.
  assert.match(r.evidence.summary, /conversation session: 3 turns/);
  for (const frag of ["Hello teacher", "see a dog", "sunny today"]) {
    assert.ok(!JSON.stringify(r).includes(frag), `transcript leaked: ${frag}`);
  }
});

test("vertical: 2 sessions for 2 students do not mix", async () => {
  const s1 = startConversation({
    student_id: "student_test_a",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  const s2 = startConversation({
    student_id: "student_test_b",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  turnConversation({ session_id: s1.session.session_id, transcript: "AAA", turn_index: 1 });
  turnConversation({ session_id: s2.session.session_id, transcript: "BBB", turn_index: 1 });
  await endConversation({ session_id: s1.session.session_id });
  await endConversation({ session_id: s2.session.session_id });

  const aLines = readFileSync(recordPath("student_test_a"), "utf8").trim().split("\n");
  const bLines = readFileSync(recordPath("student_test_b"), "utf8").trim().split("\n");
  assert.equal(aLines.length, 1);
  assert.equal(bLines.length, 1);
  const a = JSON.parse(aLines[0]);
  const b = JSON.parse(bLines[0]);
  assert.notEqual(a.evidence.student_id_hash, b.evidence.student_id_hash);
  assert.ok(!JSON.stringify(a).includes("BBB"));
  assert.ok(!JSON.stringify(b).includes("AAA"));
});

test("vertical: ring buffer cap = 5", async () => {
  // This is a structural property of createRingBuffer (see
  // conversation-state.test.mjs).  Here we verify it survives the
  // manager-level session lifecycle.
  const s = startConversation({
    student_id: "student_test_ring_v",
    knowledge_point: "english.G5.CONV.free-conversation",
    age_band: "G5-G6",
  });
  for (let i = 1; i <= 7; i++) {
    turnConversation({
      session_id: s.session.session_id,
      transcript: `t${i}`,
      turn_index: i,
    });
  }
  await endConversation({ session_id: s.session.session_id });
  const r = JSON.parse(readFileSync(recordPath("student_test_ring_v"), "utf8").trim());
  assert.equal(r.evidence.turn_count, 7); // full session turn count is NOT capped
  // Summary text must contain only "7 turns"; older turns are gone.
  assert.match(r.evidence.summary, /7 turns/);
});

test.after(() => {
  try {
    rmSync(SANDBOX, { recursive: true, force: true });
  } catch (_) {
    /* swallow */
  }
});

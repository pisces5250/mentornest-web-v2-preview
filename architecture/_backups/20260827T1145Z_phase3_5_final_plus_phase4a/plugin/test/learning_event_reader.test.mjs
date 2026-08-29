// Tests: learning_event_reader
// Run with: node --test test/learning_event_reader.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readLearningEvents,
  summarizeLearningEvents,
  assertStudentId,
} from "../lib/learning_event_reader.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const RECORDS_DIR = "/home/node/.openclaw/workspace/data/learning-records";

test("reads the existing 26 events for student_001", async () => {
  const events = await readLearningEvents("student_001");
  assert.equal(events.length, 26, `expected 26, got ${events.length}`);
});

test("summary returns 3 buckets for student_001 (math × 3 KPs)", async () => {
  const s = await summarizeLearningEvents("student_001");
  assert.equal(s.event_count, 26);
  assert.equal(s.bucket_count, 3);
});

test("rejects invalid student_id", async () => {
  await assert.rejects(() => readLearningEvents("OTHER_CHILD"));
  await assert.rejects(() => readLearningEvents(""));
  await assert.rejects(() => readLearningEvents("../etc/passwd"));
  await assert.rejects(() => readLearningEvents("student_001'; DROP TABLE"));
});

test("cross-student isolation: cannot read student_002's events when querying student_001", async () => {
  // student_002 has no JSONL on disk; the function should not surface any
  // other student's data just because we asked for student_001.
  const events = await readLearningEvents("student_001");
  const allStudentIds = new Set(events.map((e) => e.student_id));
  assert.ok(allStudentIds.has("student_001"));
  for (const id of allStudentIds) {
    assert.equal(id, "student_001");
  }
});

test("subject filter returns only that subject", async () => {
  const events = await readLearningEvents("student_001", { subject: "math" });
  for (const e of events) assert.equal(e.subject, "math");
});

test("time-window filter: 'since' filters out older events", async () => {
  const all = await readLearningEvents("student_001");
  const lastTs = all[all.length - 1].timestamp;
  const recent = await readLearningEvents("student_001", { since: lastTs });
  assert.equal(recent.length, 1);
  assert.equal(recent[0].timestamp, lastTs);
});

test("missing student JSONL returns empty list (not an error)", async () => {
  const events = await readLearningEvents("student_002");
  assert.deepEqual(events, []);
});

test("assertStudentId accepts valid ids", () => {
  assert.equal(assertStudentId("student_001"), "student_001");
  assert.equal(assertStudentId("student_abc-def_123"), "student_abc-def_123");
});

test("assertStudentId rejects path traversal and SQL-like", () => {
  assert.throws(() => assertStudentId("../etc"));
  assert.throws(() => assertStudentId("a;b"));
  assert.throws(() => assertStudentId(""));
});

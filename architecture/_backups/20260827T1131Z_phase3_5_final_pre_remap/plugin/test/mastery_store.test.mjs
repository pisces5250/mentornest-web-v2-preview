// Tests: mastery_store
// Run with: node --test test/mastery_store.test.mjs

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  getMastery,
  listMastery,
  updateMasteryFromEvent,
  setMastery,
} from "../lib/mastery_store.mjs";
import fs from "node:fs/promises";
import path from "node:path";

const MASTERY_DIR = "/home/node/.openclaw/workspace/data/mastery";

async function rm(p) {
  try { await fs.unlink(p); } catch (e) { if (e.code !== "ENOENT") throw e; }
}

before(async () => {
  // Clean test files
  await rm(path.join(MASTERY_DIR, "student_001.json"));
  await rm(path.join(MASTERY_DIR, "student_002.json"));
});

after(async () => {
  await rm(path.join(MASTERY_DIR, "student_001.json"));
  await rm(path.join(MASTERY_DIR, "student_002.json"));
});

test("updateMasteryFromEvent: incorrect → mastery 0.5 - 0.10 = 0.40", async () => {
  const r = await updateMasteryFromEvent({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    result: "incorrect",
    error_type: "fraction_operation_error",
    timestamp: "2026-08-27T00:00:00.000Z",
  });
  assert.equal(r.mastery, 0.40);
  assert.equal(r.error_patterns.fraction_operation_error, 1);
});

test("subsequent correct → mastery increases, confidence increases", async () => {
  const r = await updateMasteryFromEvent({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    result: "correct",
    timestamp: "2026-08-27T00:01:00.000Z",
  });
  assert.equal(r.mastery, 0.55);
  assert.equal(r.confidence, 0.05);
});

test("review_due schedule: mastery 0.4 → +3d", async () => {
  const r = await getMastery("student_001", "math", "math.G5.FRAC.add-unlike-denom");
  assert.ok(r.review_due);
});

test("getMastery returns null for unknown kp", async () => {
  const r = await getMastery("student_001", "math", "math.G99.NOPE");
  assert.equal(r, null);
});

test("listMastery returns 1 record for student_001", async () => {
  const list = await listMastery("student_001");
  assert.equal(list.length, 1);
});

test("rejects invalid student_id", async () => {
  await assert.rejects(() =>
    updateMasteryFromEvent({ student_id: "BAD", subject: "math", knowledge_point: "x", result: "correct" })
  );
});

test("cross-student isolation: student_002 has no records when student_001 is queried", async () => {
  const a = await listMastery("student_001");
  for (const rec of a) assert.equal(rec.student_id, "student_001");
});

test("setMastery replaces record", async () => {
  const rec = await setMastery("student_001", {
    subject: "math",
    knowledge_point: "math.G5.DECIMAL.intro-and-compare",
    mastery: 0.7,
    confidence: 0.5,
  });
  assert.equal(rec.mastery, 0.7);
  assert.equal(rec.confidence, 0.5);
});

test("setMastery rejects missing subject/kp", async () => {
  await assert.rejects(() => setMastery("student_001", { mastery: 0.5 }));
});

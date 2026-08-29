// Tests: mastery_engine_v2
// Run with: node --test test/mastery_engine_v2.test.mjs

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  rateEvidenceQuality,
  retentionScore,
  fsrsIntervalDays,
  aggregateParentMastery,
  assertNotDirectMasteryAssignment,
  updateMasteryFromEvidence,
  updateSubskillMasteryFromEvidence,
  annotateMasteryWithSchoolAlignment,
  getMasteryV2,
  listMasteryV2,
  aggregateErrorPatterns,
  getRetentionSignal,
  listEvidence,
} from "../lib/mastery_engine_v2.mjs";

const STUDENT = "student_t_mastery_v2";
const MASTERY_DIR = "/home/node/.openclaw/workspace/data/mastery";
const EVIDENCE_DIR = "/home/node/.openclaw/workspace/data/mastery-evidence";

async function cleanup() {
  try { await fs.unlink(path.join(MASTERY_DIR, `${STUDENT}.json`)); } catch {}
  try { await fs.unlink(path.join(EVIDENCE_DIR, `${STUDENT}.jsonl`)); } catch {}
}

before(cleanup);
after(cleanup);

// --- quality rating --------------------------------------------------------

test("rateEvidenceQuality: correct with no hints and first attempt -> 5 (easy)", () => {
  assert.equal(rateEvidenceQuality({ result: "correct", first_attempt: true, hints: 0 }), 5);
});

test("rateEvidenceQuality: correct with hints -> 4", () => {
  assert.equal(rateEvidenceQuality({ result: "correct", hints: 1 }), 4);
});

test("rateEvidenceQuality: partially_correct -> 3", () => {
  assert.equal(rateEvidenceQuality({ result: "partially_correct" }), 3);
});

test("rateEvidenceQuality: incorrect with concept misunderstanding -> 1", () => {
  assert.equal(rateEvidenceQuality({ result: "incorrect", error_type: "concept_misunderstanding" }), 1);
});

test("rateEvidenceQuality: incorrect with many hints -> 1", () => {
  assert.equal(rateEvidenceQuality({ result: "incorrect", hints: 3 }), 1);
});

test("rateEvidenceQuality: improved -> 3", () => {
  assert.equal(rateEvidenceQuality({ result: "improved" }), 3);
});

// --- retention model -------------------------------------------------------

test("retentionScore: same day -> 1.0", () => {
  const now = "2026-08-27T00:00:00Z";
  const last = "2026-08-27T00:00:00Z";
  assert.equal(retentionScore(last, now), 1);
});

test("retentionScore: 21 days later -> ~0.5", () => {
  const now = "2026-09-17T00:00:00Z"; // 21 days after
  const last = "2026-08-27T00:00:00Z";
  assert.ok(retentionScore(last, now) >= 0.45 && retentionScore(last, now) <= 0.55);
});

// --- FSRS intervals --------------------------------------------------------

test("fsrsIntervalDays: again -> ~10 minutes", () => {
  const d = fsrsIntervalDays({ quality_rating: 1, mastery: 0.5 });
  assert.ok(d < 0.01);
});

test("fsrsIntervalDays: easy on mastery 0.8 -> ~36 days", () => {
  const d = fsrsIntervalDays({ quality_rating: 5, mastery: 0.8 });
  assert.equal(d, 36);
});

test("fsrsIntervalDays: hard -> exactly 1 day", () => {
  assert.equal(fsrsIntervalDays({ quality_rating: 2, mastery: 0.5 }), 1);
});

// --- aggregate parent mastery ---------------------------------------------

test("aggregateParentMastery: empty -> null", () => {
  assert.equal(aggregateParentMastery([]), null);
});

test("aggregateParentMastery: weighted by evidence_count", () => {
  const m = aggregateParentMastery([
    { mastery: 0.5, evidence_count: 1 },
    { mastery: 0.9, evidence_count: 3 },
  ]);
  // expected = (0.5*1 + 0.9*3) / 4 = 3.2 / 4 = 0.8
  assert.equal(m, 0.8);
});

// --- direct mastery assignment guard --------------------------------------

test("assertNotDirectMasteryAssignment: rejects set_mastery", () => {
  assert.throws(
    () => assertNotDirectMasteryAssignment({ tool: "any_tool", params: { set_mastery: 0.9 } }),
    (e) => e.code === "DIRECT_MASTERY_FORBIDDEN"
  );
});

test("assertNotDirectMasteryAssignment: rejects non-engine mastery= on unknown tool", () => {
  assert.throws(
    () => assertNotDirectMasteryAssignment({ tool: "learning_director_emit", params: { mastery: 0.9 } }),
    (e) => e.code === "DIRECT_MASTERY_FORBIDDEN"
  );
});

test("assertNotDirectMasteryAssignment: allows master_store_get to take mastery filter", () => {
  assert.doesNotThrow(() =>
    assertNotDirectMasteryAssignment({ tool: "mastery_store_get", params: { mastery: 0.5 } })
  );
});

// --- update from evidence (engine integration) ----------------------------

test("updateMasteryFromEvidence: rejects set_mastery", async () => {
  await assert.rejects(() =>
    updateMasteryFromEvidence({
      student_id: STUDENT,
      subject: "math",
      knowledge_point: "math.G5.FRAC.x",
      result: "correct",
      set_mastery: 0.9,
    })
  );
});

test("updateMasteryFromEvidence: rejects direct mastery in input", async () => {
  await assert.rejects(() =>
    updateMasteryFromEvidence({
      student_id: STUDENT,
      subject: "math",
      knowledge_point: "math.G5.FRAC.x",
      result: "correct",
      mastery: 0.9,
    })
  );
});

test("updateMasteryFromEvidence: first correct increases mastery from 0.5", async () => {
  await cleanup();
  const out = await updateMasteryFromEvidence({
    student_id: STUDENT,
    subject: "math",
    knowledge_point: "math.G5.FRAC.x",
    result: "correct",
    first_attempt: true,
    hints: 0,
  });
  assert.ok(out.record.mastery >= 0.65);
  assert.equal(out.record.evidence_count, 1);
  assert.ok(out.record.confidence > 0);
  assert.ok(out.record.review_due);
});

test("updateMasteryFromEvidence: aggregates error_patterns", async () => {
  await cleanup();
  await updateMasteryFromEvidence({
    student_id: STUDENT, subject: "math", knowledge_point: "math.G5.FRAC.y",
    result: "incorrect", error_type: "fraction_operation_error",
  });
  await updateMasteryFromEvidence({
    student_id: STUDENT, subject: "math", knowledge_point: "math.G5.FRAC.y",
    result: "incorrect", error_type: "concept_misunderstanding",
  });
  const rec = await getMasteryV2(STUDENT, "math", "math.G5.FRAC.y");
  assert.equal(rec.error_patterns.fraction_operation_error, 1);
  assert.equal(rec.error_patterns.concept_misunderstanding, 1);
});

test("updateMasteryFromEvidence: appends evidence row to ledger (append-only)", async () => {
  await cleanup();
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "k1", result: "correct" });
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "k2", result: "incorrect" });
  const ev = await listEvidence(STUDENT);
  assert.equal(ev.count, 2);
  assert.equal(ev.events[0].subject, "math");
  assert.equal(ev.events[1].result, "incorrect");
});

test("updateSubskillMasteryFromEvidence: writes subskill record", async () => {
  await cleanup();
  const out = await updateSubskillMasteryFromEvidence({
    student_id: STUDENT, subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subskill: "common-denominator",
    result: "correct",
    first_attempt: true,
    hints: 0,
  });
  assert.equal(out.record.subskill, "common-denominator");
  assert.ok(out.record.mastery >= 0.65);
});

// --- school_alignment annotation -------------------------------------------

test("annotateMasteryWithSchoolAlignment: sets school_alignment on existing record", async () => {
  await cleanup();
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "k_align", result: "correct" });
  const out = await annotateMasteryWithSchoolAlignment({
    student_id: STUDENT, subject: "math", knowledge_point: "k_align", school_alignment: "lagging",
  });
  assert.equal(out.school_alignment, "lagging");
  // Mastery unchanged
  const before = await getMasteryV2(STUDENT, "math", "k_align");
  assert.ok(before.mastery > 0.5);
});

test("annotateMasteryWithSchoolAlignment: rejects bad value", async () => {
  await assert.rejects(() =>
    annotateMasteryWithSchoolAlignment({
      student_id: STUDENT, subject: "math", knowledge_point: "k_align", school_alignment: "nope",
    })
  );
});

// --- aggregation queries ---------------------------------------------------

test("aggregateErrorPatterns: sums across records", async () => {
  await cleanup();
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "kA", result: "incorrect", error_type: "fraction_operation_error" });
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "kA", result: "incorrect", error_type: "fraction_operation_error" });
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "chinese", knowledge_point: "cA", result: "incorrect", error_type: "vocabulary_gap" });
  const out = await aggregateErrorPatterns(STUDENT);
  assert.equal(out.by_type.fraction_operation_error, 2);
  assert.equal(out.by_type.vocabulary_gap, 1);
});

test("getRetentionSignal: returns average_retention + stale_count", async () => {
  await cleanup();
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "kR1", result: "correct" });
  const out = await getRetentionSignal(STUDENT, new Date().toISOString());
  assert.equal(out.record_count, 1);
  assert.ok(out.average_retention > 0.95);
  assert.equal(out.stale_count, 0);
});

test("listMasteryV2: filter by min_mastery", async () => {
  await cleanup();
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "highA", result: "correct", first_attempt: true });
  await updateMasteryFromEvidence({ student_id: STUDENT, subject: "math", knowledge_point: "lowA", result: "incorrect" });
  const high = await listMasteryV2(STUDENT, { min_mastery: 0.6 });
  assert.equal(high.length >= 1, true);
  assert.equal(high.every((r) => r.mastery >= 0.6), true);
});

test("cross-student isolation: student_002 sees no records for student_t", async () => {
  const out = await listMasteryV2("student_002");
  for (const r of out) {
    assert.equal(r.student_id, "student_002");
  }
});

// Tests: school_progress (Curriculum Agent v1)
// Run with: node --test test/school_progress.test.mjs

import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

import {
  SOURCE_TYPES,
  assertRecordInvariants,
  buildConfirmedRecord,
  buildInferredRecord,
  appendProgressRecord,
  readProgress,
  inferProgressFromEvidence,
  buildPromotionToConfirmed,
  buildTextbookMapping,
  suggestCurriculumUnit,
  computeSchoolAlignment,
  trackConfirmedVsInferred,
} from "../lib/school_progress.mjs";

const WORKSPACE = "/home/node/.openclaw/workspace";
const PROG_DIR = path.join(WORKSPACE, "data", "curriculum-progress");

async function rmStudent(student) {
  try { await fs.unlink(path.join(PROG_DIR, `${student}.jsonl`)); } catch (e) { if (e.code !== "ENOENT") throw e; }
}

before(async () => {
  await fs.mkdir(PROG_DIR, { recursive: true });
  await rmStudent("student_t_school_progress");
});

after(async () => {
  await rmStudent("student_t_school_progress");
});

// --- source types whitelist -------------------------------------------------

test("SOURCE_TYPES: exactly the five declared types", () => {
  assert.deepEqual([...SOURCE_TYPES], [
    "official_curriculum",
    "parent_confirmed",
    "teacher_material_confirmed",
    "textbook_mapping",
    "inferred_from_learning",
  ]);
});

// --- confirmed build --------------------------------------------------------

test("buildConfirmedRecord: parent_confirmed is allowed", () => {
  const r = buildConfirmedRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "家長口述 2026-08-20",
    confidence: 0.9,
  });
  assert.equal(r.schema_version, "school-progress-v1");
  assert.ok(r.record_id);
  assert.ok(r.confirmed_at);
  assert.equal(r.inferred_at, undefined);
});

test("buildConfirmedRecord: rejects inferred source_type", () => {
  assert.throws(() =>
    buildConfirmedRecord({
      student_id: "student_t_school_progress",
      subject: "math",
      grade: 5,
      curriculum_unit: "五上",
      knowledge_points: ["math.G5.FRAC.x"],
      status: "in_progress",
      source_type: "inferred_from_learning",
      source_reference: "x",
      confidence: 0.5,
    })
  );
});

test("buildConfirmedRecord: rejects malformed KP id", () => {
  assert.throws(() =>
    buildConfirmedRecord({
      student_id: "student_t_school_progress",
      subject: "math",
      grade: 5,
      curriculum_unit: "五上",
      knowledge_points: ["NOT_A_KP"],
      status: "in_progress",
      source_type: "parent_confirmed",
      source_reference: "x",
      confidence: 0.5,
    })
  );
});

test("buildConfirmedRecord: rejects invalid student_id", () => {
  assert.throws(() =>
    buildConfirmedRecord({
      student_id: "BAD!",
      subject: "math",
      grade: 5,
      curriculum_unit: "五上",
      knowledge_points: ["math.G5.FRAC.x"],
      status: "in_progress",
      source_type: "parent_confirmed",
      source_reference: "x",
      confidence: 0.5,
    })
  );
});

// --- inferred build ---------------------------------------------------------

test("buildInferredRecord: requires inferred_from_event", () => {
  const r = buildInferredRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    confidence: 0.55,
    inferred_from_event: "2026-08-27T07:36:21Z",
  });
  assert.equal(r.source_type, "inferred_from_learning");
  assert.ok(r.inferred_at);
  assert.equal(r.confirmed_at, undefined);
});

test("buildInferredRecord: rejects 0 confidence", () => {
  assert.throws(() =>
    buildInferredRecord({
      student_id: "student_t_school_progress",
      subject: "math",
      grade: 5,
      curriculum_unit: "五上",
      knowledge_points: ["math.G5.FRAC.x"],
      confidence: 0,
      inferred_from_event: "x",
    })
  );
});

// --- invariant: confirmed vs inferred never co-mingle ---------------------

test("assertRecordInvariants: both confirmed_at and inferred_at → reject", () => {
  assert.throws(() => assertRecordInvariants({
    schema_version: "school-progress-v1",
    record_id: "rid_must_be_long_enough",
    student_id: "student_x",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "x",
    confidence: 0.9,
    confirmed_at: "2026-08-27T00:00:00Z",
    inferred_at: "2026-08-27T00:00:00Z",
  }));
});

test("assertRecordInvariants: missing both → reject", () => {
  assert.throws(() => assertRecordInvariants({
    schema_version: "school-progress-v1",
    record_id: "rid_must_be_long_enough",
    student_id: "student_x",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "x",
    confidence: 0.9,
  }));
});

test("assertRecordInvariants: inferred without inferred_at → reject", () => {
  assert.throws(() => assertRecordInvariants({
    schema_version: "school-progress-v1",
    record_id: "rid_must_be_long_enough",
    student_id: "student_x",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "in_progress",
    source_type: "inferred_from_learning",
    source_reference: "x",
    confidence: 0.5,
  }));
});

test("assertRecordInvariants: rejects forbidden PII fields", () => {
  assert.throws(() => assertRecordInvariants({
    schema_version: "school-progress-v1",
    record_id: "rid_must_be_long_enough",
    student_id: "student_x",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "x",
    confidence: 0.9,
    confirmed_at: "2026-08-27T00:00:00Z",
    display_name: "leak",
  }));
});

// --- persistence: append-only -------------------------------------------------

test("appendProgressRecord: writes line and readProgress returns 1", async () => {
  await rmStudent("student_t_school_progress");
  const r = buildConfirmedRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上 第六單元",
    knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "家長口述",
    confidence: 0.85,
  });
  const out = await appendProgressRecord(WORKSPACE, r);
  assert.equal(out.ok, true);
  const got = await readProgress(WORKSPACE, "student_t_school_progress");
  assert.equal(got.count, 1);
  assert.equal(got.records[0].curriculum_unit, "五上 第六單元");
});

test("appendProgressRecord: second append keeps old record (append-only)", async () => {
  await rmStudent("student_t_school_progress");
  const r1 = buildConfirmedRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上 第四單元",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "first",
    confidence: 0.7,
  });
  const r2 = buildConfirmedRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上 第五單元",
    knowledge_points: ["math.G5.FRAC.y"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "second",
    confidence: 0.8,
    replaces_record_id: r1.record_id,
  });
  await appendProgressRecord(WORKSPACE, r1);
  await appendProgressRecord(WORKSPACE, r2);
  const got = await readProgress(WORKSPACE, "student_t_school_progress");
  assert.equal(got.count, 2);
  // latest_by_subject picks r2 (newer confirmed_at)
  const latest = got.latest_by_subject["math|G5"];
  assert.equal(latest.curriculum_unit, "五上 第五單元");
});

// --- inference ---------------------------------------------------------------

test("inferProgressFromEvidence: empty signals → not_started, conf 0.4", () => {
  const r = inferProgressFromEvidence({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    unit_label: "五上 第六單元",
    evidence: { mastery_recent: 0.2, kps_mastered_recent: [], last_event_at: "2026-08-25T00:00:00Z" },
    unit_knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
  });
  assert.equal(r.candidate.status, "not_started");
  assert.equal(r.candidate.confidence, 0.4);
});

test("inferProgressFromEvidence: all unit KPs mastered → high conf", () => {
  const r = inferProgressFromEvidence({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    unit_label: "五上 第六單元",
    evidence: {
      mastery_recent: 0.75,
      kps_mastered_recent: ["math.G5.FRAC.add-unlike-denom"],
      last_event_at: "2026-08-27T00:00:00Z",
    },
    unit_knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
  });
  assert.equal(r.candidate.status, "in_progress"); // never auto-completed
  assert.ok(r.candidate.confidence >= 0.7);
});

test("inferProgressFromEvidence: rejects PII in evidence", () => {
  assert.throws(() =>
    inferProgressFromEvidence({
      student_id: "student_t_school_progress",
      subject: "math",
      grade: 5,
      unit_label: "五上",
      evidence: { display_name: "leak", mastery_recent: 0.5 },
    })
  );
});

// --- promotion to confirmed --------------------------------------------------

test("buildPromotionToConfirmed: superseded inferred becomes confirmed", () => {
  const inferred = buildInferredRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    confidence: 0.55,
    inferred_from_event: "2026-08-25T00:00:00Z",
  });
  const promoted = buildPromotionToConfirmed(inferred, {
    new_source_type: "parent_confirmed",
    new_source_reference: "家長確認 2026-08-27",
    new_status: "in_progress",
    new_confidence: 0.95,
  });
  assert.equal(promoted.source_type, "parent_confirmed");
  assert.ok(promoted.confirmed_at);
  assert.equal(promoted.inferred_at, undefined);
  assert.equal(promoted.replaces_record_id, inferred.record_id);
});

test("buildPromotionToConfirmed: cannot demote confidence", () => {
  const confirmed = buildConfirmedRecord({
    student_id: "student_t_school_progress",
    subject: "math",
    grade: 5,
    curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "x",
    confidence: 0.95,
  });
  assert.throws(() =>
    buildPromotionToConfirmed(confirmed, { new_confidence: 0.5 })
  );
});

// --- textbook mapping skeleton ----------------------------------------------

test("buildTextbookMapping: validates KPs against curriculum index", () => {
  const curriculum_index = {
    by_id: {
      "math.G5.FRAC.add-unlike-denom": true,
      "math.G5.DECIMAL.intro": true,
    },
  };
  const publisher_map = {
    "康軒": {
      "5上": {
        units: [
          { label: "第六單元 分數", knowledge_points: ["math.G5.FRAC.add-unlike-denom", "math.G5.NOTREAL"] },
          { label: "第七單元 小數", knowledge_points: ["math.G5.DECIMAL.intro"] },
        ],
      },
    },
  };
  const out = buildTextbookMapping({ curriculum_index, publisher_map });
  assert.equal(out.ok, true);
  assert.equal(out.stats.publishers, 1);
  assert.equal(out.stats.units, 2);
  assert.equal(out.stats.knowledge_points, 2);
  // Unknown KP filtered out
  assert.deepEqual(out.mappings["康軒"]["5上"].units[0].knowledge_points, ["math.G5.FRAC.add-unlike-denom"]);
});

test("suggestCurriculumUnit: looks up by stage substring", () => {
  const curriculum_index = {
    by_id: { "math.G5.FRAC.add-unlike-denom": true },
    by_subject: {
      math: {
        "5": { units: [{ stage: "五上", knowledge_points: ["math.G5.FRAC.add-unlike-denom"] }] },
      },
    },
  };
  const publisher_map = {
    康軒: {
      "5上": {
        units: [{ label: "六、分數", knowledge_points: ["math.G5.FRAC.add-unlike-denom"] }],
      },
    },
  };
  const out = suggestCurriculumUnit({
    publisher: "康軒",
    volume: "5上",
    unit_label: "六、五上 分數",
    grade: 5,
    publisher_map,
    curriculum_index,
  });
  assert.equal(out.ok, true);
  assert.equal(out.candidate_publisher_unit.label, "六、分數");
  assert.equal(out.stage_matches.length, 1);
  assert.equal(out.stage_matches[0].subject, "math");
});

// --- school alignment --------------------------------------------------------

test("computeSchoolAlignment: mastery >= 0.7 + school completed → aligned", () => {
  const mastery = [{ subject: "math", knowledge_point: "math.G5.FRAC.x", mastery: 0.85 }];
  const progress = [buildConfirmedRecord({
    student_id: "student_t_school_progress", subject: "math", grade: 5, curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"], status: "completed", source_type: "parent_confirmed", source_reference: "x", confidence: 1.0,
  })];
  const out = computeSchoolAlignment({ mastery, progress_records: progress });
  assert.equal(out.items[0].recommendation_zh_tw.startsWith("對齊："), true);
});

test("computeSchoolAlignment: mastery >= 0.7 + not completed → suggest update", () => {
  const mastery = [{ subject: "math", knowledge_point: "math.G5.FRAC.x", mastery: 0.85 }];
  const progress = [buildConfirmedRecord({
    student_id: "student_t_school_progress", subject: "math", grade: 5, curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"], status: "in_progress", source_type: "parent_confirmed", source_reference: "x", confidence: 1.0,
  })];
  const out = computeSchoolAlignment({ mastery, progress_records: progress });
  assert.match(out.items[0].recommendation_zh_tw, /熟悉/);
});

test("computeSchoolAlignment: low mastery + completed → recommend review", () => {
  const mastery = [{ subject: "math", knowledge_point: "math.G5.FRAC.x", mastery: 0.3 }];
  const progress = [buildConfirmedRecord({
    student_id: "student_t_school_progress", subject: "math", grade: 5, curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.x"], status: "completed", source_type: "parent_confirmed", source_reference: "x", confidence: 1.0,
  })];
  const out = computeSchoolAlignment({ mastery, progress_records: progress });
  assert.match(out.items[0].recommendation_zh_tw, /複習/);
});

test("computeSchoolAlignment: empty progress → recommend補上", () => {
  const mastery = [{ subject: "math", knowledge_point: "math.G5.FRAC.x", mastery: 0.5 }];
  const out = computeSchoolAlignment({ mastery, progress_records: [] });
  assert.match(out.items[0].recommendation_zh_tw, /尚未有/);
});

// --- confirmed-vs-inferred tracker ------------------------------------------

test("trackConfirmedVsInferred: separates confirmed and inferred, surfaces conflicts", () => {
  const c = buildConfirmedRecord({
    student_id: "student_t_school_progress", subject: "math", grade: 5, curriculum_unit: "五上",
    knowledge_points: ["math.G5.FRAC.a"], status: "in_progress", source_type: "parent_confirmed", source_reference: "x", confidence: 1.0,
  });
  const i = buildInferredRecord({
    student_id: "student_t_school_progress", subject: "math", grade: 5, curriculum_unit: "五上 第七單元",
    knowledge_points: ["math.G5.FRAC.b"], confidence: 0.5, inferred_from_event: "2026-08-25T00:00:00Z",
  });
  const out = trackConfirmedVsInferred([c, i], { student_id: "student_t_school_progress" });
  assert.equal(out.confirmed.length, 1);
  assert.equal(out.inferred.length, 1);
  assert.equal(out.conflicts.length, 1);
  assert.equal(out.conflicts[0].key, "math|G5");
});

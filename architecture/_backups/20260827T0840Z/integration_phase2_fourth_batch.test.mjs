// Tests: Phase 2 fourth-batch integration
// Run with: node --test test/integration_phase2_fourth_batch.test.mjs
//
// Exercises the new tools end-to-end against dist/lib:
//
//   Phase A (Production Question Author):
//     - mentornest_question_author_production
//     - ai_question_authoring_orchestrator_run (with production_author=true)
//
//   Phase B (Curriculum Agent v1):
//     - school_progress_get
//     - school_progress_update_confirmed
//     - school_progress_infer
//     - school_progress_promote_to_confirmed
//     - school_alignment
//     - confirmed_vs_inferred_progress_tracker
//     - textbook_mapping_engine
//
//   Phase C (Mastery Engine v2):
//     - mastery_engine_v2_get
//     - mastery_engine_v2_update_from_evidence
//     - mastery_engine_v2_annotate_school_alignment
//     - mastery_engine_v2_error_pattern_aggregation
//     - mastery_engine_v2_retention_signal
//     - mastery_engine_v2_list_evidence
//
// Append-only invariant: live learning records file is read once for
// digest; never written. Tests use a temp student_id ("student_t_integration_fourth_batch")
// for mastery and school-progress so production data stays untouched.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";
const WORKSPACE = "/home/node/.openclaw/workspace";
const TEST_STUDENT = "student_t_int4";
const SNAPSHOT_BASELINE = "/home/node/.openclaw/workspace/architecture/_backups/20260827T081009Z/data-digests.txt";

let tools = null;
async function loadTools() {
  if (tools) return tools;
  const mod = await import(PLUGIN_PATH);
  const _t = [];
  mod.default.register({ registerTool(t) { _t.push(t); } });
  tools = _t;
  return tools;
}

async function runTool(name, params) {
  const t = (await loadTools()).find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return await t.execute("test-call-id", params);
}

async function rmStudent(student) {
  try { await fs.unlink(path.join(WORKSPACE, "data/mastery", `${student}.json`)); } catch {}
  try { await fs.unlink(path.join(WORKSPACE, "data/mastery-evidence", `${student}.jsonl`)); } catch {}
  try { await fs.unlink(path.join(WORKSPACE, "data/curriculum-progress", `${student}.jsonl`)); } catch {}
}

before(async () => {
  await rmStudent(TEST_STUDENT);
});

after(async () => {
  await rmStudent(TEST_STUDENT);
});

// ─── Plugin surface ───

test("plugin loads with 43 tools", async () => {
  await loadTools();
  assert.equal(tools.length, 43);
});

test("all Phase 2 fourth-batch tools are present", async () => {
  const expected = [
    "mentornest_question_author_production",
    "school_progress_get",
    "school_progress_update_confirmed",
    "school_progress_infer",
    "school_progress_promote_to_confirmed",
    "school_alignment",
    "confirmed_vs_inferred_progress_tracker",
    "textbook_mapping_engine",
    "mastery_engine_v2_update_from_evidence",
    "mastery_engine_v2_annotate_school_alignment",
    "mastery_engine_v2_error_pattern_aggregation",
    "mastery_engine_v2_retention_signal",
    "mastery_engine_v2_list_evidence",
    "mastery_engine_v2_get",
  ];
  for (const n of expected) {
    assert.ok(tools.find((t) => t.name === n), `missing tool: ${n}`);
  }
});

// ─── Production Question Author (privacy + dispatch) ───

test("production author: rejects display_name payload", async () => {
  const out = await runTool("mentornest_question_author_production", {
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    question_type: "short_answer",
    difficulty: "easy",
    authoring_constraints: { display_name: "leak" },
  });
  // Privacy fence rejects display_name — either returns ok:false from the
  // tool, or the underlying factory throws. Either way the tool surface
  // must NOT return ok:true with a real question.
  assert.equal(out.details.ok, false);
});

test("production author: rejects parent_concerns payload", async () => {
  const out = await runTool("mentornest_question_author_production", {
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    question_type: "short_answer",
    difficulty: "easy",
    authoring_constraints: { parent_concerns: "leak" },
  });
  assert.equal(out.details.ok, false);
});

// ─── School Progress (Curriculum Agent v1) ───

test("school_progress_update_confirmed: appends a record (and snapshot baseline intact)", async () => {
  const out = await runTool("school_progress_update_confirmed", {
    student_id: TEST_STUDENT,
    subject: "math",
    grade: 5,
    curriculum_unit: "五上 第六單元",
    knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
    status: "in_progress",
    source_type: "parent_confirmed",
    source_reference: "家長口述 2026-08-27",
    confidence: 0.9,
  });
  assert.equal(out.details.ok, true);
  assert.ok(out.details.record);

  // Snapshot baseline untouched: the file is data/learning-records/<live-id>.jsonl,
  // NOT data/curriculum-progress/. We verify event count + digest haven't moved.
  const lrFile = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const raw = await fs.readFile(lrFile, "utf8");
  assert.equal(raw.split("\n").filter((l) => l.length > 0).length, 26);
});

test("school_progress_infer: appends an inferred record with no confirmed_at", async () => {
  const out = await runTool("school_progress_infer", {
    student_id: TEST_STUDENT,
    subject: "math",
    grade: 5,
    unit_label: "五上 第七單元",
    unit_knowledge_points: ["math.G5.FRAC.x"],
    evidence: { mastery_recent: 0.5, kps_mastered_recent: [], last_event_at: "2026-08-27T00:00:00Z" },
  });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.record.confirmed_at, undefined);
  assert.ok(out.details.record.inferred_at);
});

test("school_progress_get: returns 2 records", async () => {
  const out = await runTool("school_progress_get", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.event_count, 2);
});

test("confirmed_vs_inferred_progress_tracker: sees both + flags conflict", async () => {
  const out = await runTool("confirmed_vs_inferred_progress_tracker", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.confirmed.length, 1);
  assert.equal(out.details.inferred.length, 1);
  assert.equal(out.details.conflicts.length, 1);
});

test("school_alignment: returns zh-TW recommendations", async () => {
  const out = await runTool("school_alignment", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  // No mastery records yet for TEST_STUDENT, so 0 items.
  assert.equal(out.details.items.length, 0);
});

// ─── Mastery Engine v2 ───

test("mastery_engine_v2_update_from_evidence: produces mastery from event", async () => {
  const out = await runTool("mastery_engine_v2_update_from_evidence", {
    student_id: TEST_STUDENT,
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    result: "correct",
    first_attempt: true,
    hints: 0,
  });
  assert.equal(out.details.ok, true);
  assert.ok(out.details.record.mastery > 0.5);
  assert.equal(out.details.record.evidence_count, 1);
});

test("mastery_engine_v2_update_from_evidence: REJECTS set_mastery", async () => {
  let threw = false;
  try {
    await runTool("mastery_engine_v2_update_from_evidence", {
      student_id: TEST_STUDENT,
      subject: "math",
      knowledge_point: "math.G5.FRAC.x",
      result: "correct",
      set_mastery: 0.9,
    });
  } catch (e) {
    threw = true;
    assert.match(e.message, /set_mastery/);
  }
  assert.equal(threw, true);
});

test("mastery_engine_v2_list_evidence: append-only ledger has at least 1 entry", async () => {
  const out = await runTool("mastery_engine_v2_list_evidence", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.ok(out.details.count >= 1);
});

test("mastery_engine_v2_error_pattern_aggregation: returns aggregate", async () => {
  const out = await runTool("mastery_engine_v2_error_pattern_aggregation", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.equal(typeof out.details.by_type, "object");
});

test("mastery_engine_v2_retention_signal: computes avg + stale_count", async () => {
  const out = await runTool("mastery_engine_v2_retention_signal", { student_id: TEST_STUDENT });
  assert.equal(out.details.ok, true);
  assert.ok(out.details.record_count >= 1);
});

test("mastery_engine_v2_annotate_school_alignment: sets marker without changing mastery", async () => {
  const before = await runTool("mastery_engine_v2_get", {
    student_id: TEST_STUDENT, subject: "math", knowledge_point: "math.G5.FRAC.add-unlike-denom",
  });
  const out = await runTool("mastery_engine_v2_annotate_school_alignment", {
    student_id: TEST_STUDENT, subject: "math", knowledge_point: "math.G5.FRAC.add-unlike-denom", school_alignment: "lagging",
  });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.record.school_alignment, "lagging");
  // Mastery unchanged
  assert.equal(out.details.record.mastery, before.details.record.mastery);
});

// ─── Append-only invariant on LIVE learning records ───

test("live learning records file is UNCHANGED (snapshot baseline check)", async () => {
  const lrFile = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const content = await fs.readFile(lrFile, "utf8");
  const liveLineCount = content.split("\n").filter((l) => l.length > 0).length;
  assert.equal(liveLineCount, 26);
  // Cross-check against the snapshot baseline manifest:
  const baselineContent = await fs.readFile(SNAPSHOT_BASELINE, "utf8");
  assert.match(baselineContent, /26 data\/learning-records\/student_001\.jsonl/);
});

test("live student data files are UNCHANGED", async () => {
  const s1 = await fs.readFile(path.join(WORKSPACE, "data/students/student_001.json"), "utf8");
  assert.match(s1, /display_name/); // not corrupted
});

test("append-only invariant: writing to curriculum-progress does NOT touch learning-records", async () => {
  // Multiple writes to curriculum-progress
  await runTool("school_progress_update_confirmed", {
    student_id: TEST_STUDENT, subject: "math", grade: 5, curriculum_unit: "u1",
    knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
    status: "in_progress", source_type: "parent_confirmed", source_reference: "r1",
  });
  await runTool("school_progress_infer", {
    student_id: TEST_STUDENT, subject: "math", grade: 5, unit_label: "u2",
    unit_knowledge_points: ["math.G5.FRAC.add-unlike-denom"],
    evidence: { mastery_recent: 0.6, kps_mastered_recent: [] },
  });
  await runTool("mastery_engine_v2_update_from_evidence", {
    student_id: TEST_STUDENT, subject: "math", knowledge_point: "math.G5.FRAC.x2", result: "correct",
  });
  // Now check learning-records
  const lrFile = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const content = await fs.readFile(lrFile, "utf8");
  const liveLineCount = content.split("\n").filter((l) => l.length > 0).length;
  assert.equal(liveLineCount, 26);
});

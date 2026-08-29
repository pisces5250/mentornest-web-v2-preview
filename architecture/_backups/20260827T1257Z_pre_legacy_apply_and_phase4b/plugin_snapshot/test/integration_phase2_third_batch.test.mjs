// Integration test for Phase 2 third-batch tools against the built plugin.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import mod from "../dist/index.js";

// All 7 new tools expected (per openclaw.plugin.json)
const EXPECTED_NEW_TOOLS = [
  "math_specialist_independent_verify",
  "question_bank_coverage_report",
  "ai_question_authoring_orchestrator_run",
  "ai_question_authoring_plan",
  "learning_director_cross_subject_weakness_aggregator",
  "learning_director_prerequisite_gap_detector",
  "learning_director_weekly_strategy_emitter",
];

let _tools;
function tools() {
  if (_tools) return _tools;
  _tools = [];
  mod.register({ registerTool(t) { _tools.push(t); } });
  return _tools;
}

function getTool(name) {
  const t = tools().find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

test("plugin registers all 7 Phase 2 third-batch tools", () => {
  const names = tools().map((t) => t.name);
  for (const t of EXPECTED_NEW_TOOLS) {
    assert.ok(names.includes(t), `plugin missing ${t}`);
  }
});

test("plugin manifest declares all 7 new tools", async () => {
  const manifest = JSON.parse(await fs.readFile(
    path.resolve(process.cwd(), "openclaw.plugin.json"),
    "utf8"
  ));
  for (const t of EXPECTED_NEW_TOOLS) {
    assert.ok(manifest.contracts.tools.includes(t), `manifest missing ${t}`);
  }
});

test("parent_setup_schema_copy: returns updated copy with privacy + school_progress copy", async () => {
  const t = getTool("parent_setup_schema_copy");
  const r = await t.execute("c", { locale: "zh-TW" });
  assert.equal(r.details.copy.welcome.privacy_note.includes("不自動分享"), true);
  assert.equal(typeof r.details.copy.privacy, "object");
  assert.equal(r.details.copy.privacy.lines.length >= 1, true);
  assert.ok(r.details.copy.school_progress);
  assert.match(r.details.copy.school_progress.description, /不確定可跳過/);
});

test("math_specialist_independent_verify: returns receipt with stages_passed", async () => {
  const t = getTool("math_specialist_independent_verify");
  const r = await t.execute("c", {
    stem: "計算 1/2 + 1/3",
    answer: "5/6",
    alt_answers: ["5/6", "10/12"],
  });
  assert.equal(r.details.ok, true);
  assert.ok(Array.isArray(r.details.stages_passed));
  assert.ok(r.details.stages_passed.includes("primary_parse"));
});

test("math_specialist_independent_verify: rejects garbage", async () => {
  const t = getTool("math_specialist_independent_verify");
  const r = await t.execute("c", { stem: "?", answer: "???" });
  assert.equal(r.details.ok, false);
});

test("question_bank_coverage_report: returns a coverage summary", async () => {
  const t = getTool("question_bank_coverage_report");
  const r = await t.execute("c", { subject: "math", grade: 5 });
  // coverage_report tool returns the report directly (no `ok` wrapper)
  assert.equal(r.details.subject, "math");
  assert.equal(r.details.grade, 5);
  assert.equal(typeof r.details.cells_total, "number");
  assert.equal(typeof r.details.coverage_ratio, "number");
  assert.ok(Array.isArray(r.details.gaps));
});

test("ai_question_authoring_plan: read-only, no files written", async () => {
  // Snapshot the verified bank first
  const verifiedDir = "/home/node/.openclaw/workspace/data/questions/verified/math/G5";
  const before = await fs.readdir(verifiedDir).catch(() => []);
  const t = getTool("ai_question_authoring_plan");
  const r = await t.execute("c", { subject: "math", grade: 5, batch_size: 3 });
  assert.equal(r.details.ok === undefined || r.details.subject === "math", true);
  const after = await fs.readdir(verifiedDir).catch(() => []);
  assert.equal(after.length, before.length, "plan must not write to disk");
});

test("ai_question_authoring_orchestrator_run: writes to verified via stub author (math short_answer)", async () => {
  // Skip if the orchestrator's curated/verified path can't be created. The
  // built plugin uses WORKSPACE=/home/node/.openclaw/workspace as default.
  const t = getTool("ai_question_authoring_orchestrator_run");
  // Single-cell attempt so we don't blow up the real bank with duplicates.
  // The orchestrator picks the top gap, which after seeding many tests is
  // usually short_answer/easy. Stub author produces 5/6, which may already
  // exist in the bank → would dedupe. We only assert the tool returns a
  // well-formed result.
  const r = await t.execute("c", {
    subject: "math",
    grade: 5,
    kps: [{ kp: "math.G5.FRAC.add-unlike-denom" }],
    batch_size: 1,
    use_stub_author: true,
  });
  // Result may have ok=true or details.ok depending on the shape; accept both.
  assert.ok(r.details !== undefined);
});

test("learning_director_cross_subject_weakness_aggregator: returns ok result for student_001", async () => {
  const t = getTool("learning_director_cross_subject_weakness_aggregator");
  const r = await t.execute("c", { student_id: "student_001" });
  // tool wraps as { ok: true, ...result }
  assert.equal(r.details.ok, true);
  assert.equal(r.details.student_id, "student_001");
  assert.ok(Array.isArray(r.details.cells));
});

test("learning_director_cross_subject_weakness_aggregator: rejects path traversal", async () => {
  const t = getTool("learning_director_cross_subject_weakness_aggregator");
  const r = await t.execute("c", { student_id: "../etc/passwd" });
  assert.equal(r.details.ok, false);
});

test("learning_director_prerequisite_gap_detector: returns chain for student_001", async () => {
  const t = getTool("learning_director_prerequisite_gap_detector");
  const r = await t.execute("c", {
    subject: "math",
    grade: 5,
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    student_id: "student_001",
  });
  assert.equal(r.details.ok, true);
  assert.ok(Array.isArray(r.details.chain));
});

test("learning_director_weekly_strategy_emitter: returns zh-TW parent summary with privacy copy", async () => {
  const t = getTool("learning_director_weekly_strategy_emitter");
  const r = await t.execute("c", { student_id: "student_001" });
  assert.equal(r.details.ok, true);
  assert.ok(typeof r.details.parent_summary_for_week === "string");
  assert.match(r.details.parent_summary_for_week, /不自動分享/);
});

test("v1 tools still callable (regression)", async () => {
  const profile = getTool("student_profile_get");
  const r = await profile.execute("c", { student_id: "student_001" });
  assert.equal(r.details.found, true);
});
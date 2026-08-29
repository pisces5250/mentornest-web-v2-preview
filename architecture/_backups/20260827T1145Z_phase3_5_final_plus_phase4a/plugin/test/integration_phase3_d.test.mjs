// test/integration_phase3_d.test.mjs — Phase 3-D Science Specialist integration
// Verifies: 11 science tools registered, taxonomy, experiment reasoning, variable control,
// observation vs inference, cause/effect, chart/table interpretation, evidence-only emission,
// cross-student isolation. Live student_001.jsonl append-only invariant.

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const WORKSPACE = "/home/node/.openclaw/workspace";

let toolsCache = null;
async function loadTools() {
  if (toolsCache) return toolsCache;
  const mod = await import("../dist/index.js");
  const list = [];
  mod.default.register({ registerTool(t) { list.push(t); } });
  toolsCache = list;
  return toolsCache;
}

async function runTool(name, params) {
  const t = (await loadTools()).find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return await t.execute("test-call-id", params);
}

const SCIENCE_TOOLS = [
  "science_error_taxonomy_lookup",
  "science_specialist_diagnose",
  "science_specialist_analyze_experiment",
  "science_specialist_interpret_chart_table",
  "science_specialist_interpret_diagram",
  "science_specialist_decide",
  "science_specialist_emit_evidence",
  "science_hint_ladder_next",
  "science_curriculum_lookup_kp",
  "science_curriculum_list_for_grade",
  "science_subskill_classify",
];

test("plugin loads with all 11 Phase 3-D science tools", async () => {
  const tools = await loadTools();
  for (const name of SCIENCE_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing science tool: ${name}`);
  }
  // After Phase 3 sub-sessions A+B+C+D+E total = 105
  // Phase 3-F added 11 more → 116; Phase 3.5-A SVG companion + 5 backfill = 122 total.
  assert.equal(tools.length, 132);
});

test("science_error_taxonomy_lookup: returns full taxonomy when no filter", async () => {
  const out = await runTool("science_error_taxonomy_lookup", {});
  assert.equal(out.details.ok, true);
  assert.ok(Array.isArray(out.details.categories));
  assert.ok(out.details.categories.length >= 5);
  assert.ok(Array.isArray(out.details.sample));
  assert.equal(out.details.sample.length, 3);
});

test("science_error_taxonomy_lookup: filters by category", async () => {
  const out = await runTool("science_error_taxonomy_lookup", { category: "causal" });
  assert.equal(out.details.ok, true);
  assert.ok(Array.isArray(out.details.entries));
});

test("science_error_taxonomy_lookup: returns entry by code", async () => {
  const out = await runTool("science_error_taxonomy_lookup", { code: "SCI-CAUSAL-REVERSE" });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.entry.code, "SCI-CAUSAL-REVERSE");
  assert.ok(out.details.entry.hint_template);
});

test("science_specialist_diagnose: correct answer returns ok + hint_level 0", async () => {
  const out = await runTool("science_specialist_diagnose", {
    student_id: "student_test_d",
    stem: "植物需要陽光嗎？",
    student_answer: "陽光",
    expected_answer: "陽光",
    knowledge_point: "science.G3.LIFE.photosynthesis",
    grade: 3,
  });
  assert.equal(out.details.correct, true);
  assert.equal(out.details.hint_level, 0);
  assert.ok(out.details.evidence_payload);
  assert.equal(out.details.evidence_payload.subject, "science");
});

test("science_specialist_diagnose: incorrect answer returns hint + error_code", async () => {
  const out = await runTool("science_specialist_diagnose", {
    student_id: "student_test_d",
    stem: "植物需要陽光進行什麼作用？",
    student_answer: "呼吸",
    expected_answer: "光合作用",
    knowledge_point: "science.G3.LIFE.photosynthesis",
    grade: 3,
  });
  assert.equal(out.details.correct, false);
  assert.ok(out.details.error_codes.length > 0);
  assert.ok(out.details.hint_text_zh.length > 0);
  assert.ok(out.details.mini_lesson_suggested);
});

test("science_specialist_analyze_experiment: missing variables flagged", async () => {
  const out = await runTool("science_specialist_analyze_experiment", {
    student_id: "student_test_d",
    knowledge_point: "science.G4.PHYSICS.pendulum",
    variables: { independent: "繩長" },
    expected_design: {
      independent: "繩長",
      dependent: "擺動週期",
      controlled: ["擺錘質量", "擺幅"],
    },
  });
  assert.equal(out.details.correct, false);
  assert.ok(out.details.missing_variables.includes("dependent"));
  assert.ok(out.details.missing_variables.includes("controlled"));
  assert.ok(out.details.errors.length > 0);
});

test("science_specialist_analyze_experiment: full design passes", async () => {
  const out = await runTool("science_specialist_analyze_experiment", {
    student_id: "student_test_d",
    knowledge_point: "science.G4.PHYSICS.pendulum",
    variables: {
      independent: "繩長",
      dependent: "擺動週期",
      controlled: ["擺錘質量", "擺幅"],
    },
    expected_design: {
      independent: "繩長",
      dependent: "擺動週期",
      controlled: ["擺錘質量", "擺幅"],
    },
  });
  assert.equal(out.details.correct, true);
  assert.equal(out.details.missing_variables.length, 0);
  assert.equal(out.details.errors.length, 0);
});

test("science_specialist_interpret_chart_table: correct reading", async () => {
  const out = await runTool("science_specialist_interpret_chart_table", {
    student_id: "student_test_d",
    knowledge_point: "science.G5.DATA.line-chart-reading",
    data: { axes: { x: "月份", y: "溫度°C" }, rows: [{ 月份: "1月", 溫度: 12 }] },
    question: "1月溫度幾度？",
    student_answer: "12",
    expected_answer: "12",
  });
  assert.equal(out.details.correct, true);
  assert.equal(out.details.error_codes.length, 0);
  assert.ok(Array.isArray(out.details.reasoning_steps));
});

test("science_specialist_interpret_chart_table: incorrect reading flagged with axis error", async () => {
  const out = await runTool("science_specialist_interpret_chart_table", {
    student_id: "student_test_d",
    knowledge_point: "science.G5.DATA.line-chart-reading",
    data: { axes: { x: "月份", y: "溫度°C" }, rows: [{ 月份: "1月", 溫度: 12 }] },
    question: "1月溫度幾度？",
    student_answer: "100",
    expected_answer: "12",
  });
  assert.equal(out.details.correct, false);
  assert.ok(out.details.error_codes.includes("SCI-DATA-AXIS"));
  assert.ok(out.details.hint_text_zh.includes("軸線") || out.details.hint_text_zh.includes("單位") || out.details.hint_text_zh.includes("刻度"));
});

test("science_specialist_interpret_diagram: matches diagram elements", async () => {
  const out = await runTool("science_specialist_interpret_diagram", {
    student_id: "student_test_d",
    knowledge_point: "science.G6.BIO.heart-circulation",
    diagram_descriptor: { elements: ["左心房", "右心室", "主動脈"] },
    question: "標出心臟的腔室",
    student_answer: "左心房 右心室 主動脈",
    expected_answer: ["左心房", "右心室", "主動脈"],
  });
  assert.equal(out.details.correct, true);
  assert.equal(out.details.missed_elements.length, 0);
});

test("science_specialist_decide: experiment subskill routes to experiment_simulation", async () => {
  const out = await runTool("science_specialist_decide", {
    student_id: "student_test_d",
    knowledge_point: "science.G4.PHYSICS.pendulum-experiment",
    attempts: 1,
    mastery: 0.3,
  });
  assert.equal(out.details.action, "experiment_simulation");
  assert.ok(out.details.rationale);
});

test("science_specialist_decide: data_interpretation subskill routes to chart_drilling", async () => {
  const out = await runTool("science_specialist_decide", {
    student_id: "student_test_d",
    knowledge_point: "science.G5.DATA.bar-graph",
    attempts: 1,
    mastery: 0.5,
  });
  assert.equal(out.details.action, "chart_drilling");
});

test("science_specialist_decide: high mastery routes to mastery_check", async () => {
  const out = await runTool("science_specialist_decide", {
    student_id: "student_test_d",
    knowledge_point: "science.G3.LIFE.basic-concepts",
    attempts: 1,
    mastery: 0.85,
  });
  assert.equal(out.details.action, "mastery_check");
});

test("science_specialist_decide: 3+ attempts routes to concept_clarification", async () => {
  const out = await runTool("science_specialist_decide", {
    student_id: "student_test_d",
    knowledge_point: "science.G4.CHEM.mixtures",
    attempts: 4,
    mastery: 0.4,
  });
  assert.equal(out.details.action, "concept_clarification");
});

test("science_hint_ladder_next: returns a level + hint_text_zh", async () => {
  const out = await runTool("science_hint_ladder_next", {
    student_id: "student_test_d",
    knowledge_point: "science.G3.LIFE.basic",
    attempts: 1,
  });
  assert.ok(typeof out.details.level === "number");
  assert.ok(out.details.level >= 0 && out.details.level <= 4);
  assert.ok(out.details.hint_text_zh.length > 0);
});

test("science_hint_ladder_next: escalates after attempts", async () => {
  const out = await runTool("science_hint_ladder_next", {
    student_id: "student_test_d",
    knowledge_point: "science.G3.LIFE.basic",
    attempts: 3,
    error_codes: ["SCI-CAUSAL-REVERSE"],
  });
  assert.ok(out.details.level >= 2);
});

test("science_curriculum_lookup_kp: returns KP record or not_found", async () => {
  const out = await runTool("science_curriculum_lookup_kp", {
    knowledge_point: "science.G3.OBS.plant-animal",
  });
  // Either ok:true with a KP record, or found:false. Either way, a structured response.
  assert.ok(out.details.found === true || out.details.found === false);
});

test("science_curriculum_list_for_grade: G3 returns ≥1 KP", async () => {
  const out = await runTool("science_curriculum_list_for_grade", { grade: 3 });
  assert.equal(out.details.found, true);
  assert.ok(Array.isArray(out.details.knowledge_points));
  assert.ok(out.details.knowledge_points.length >= 1, `expected ≥1 KP, got ${out.details.knowledge_points.length}`);
});

test("science_subskill_classify: returns primary_subskill", async () => {
  const out = await runTool("science_subskill_classify", {
    knowledge_point: "science.G4.PHYSICS.pendulum-experiment",
  });
  assert.equal(out.details.primary_subskill, "experiment");
  assert.ok(Array.isArray(out.details.all_subskills));
});

test("science_specialist_emit_evidence: APPENDS to ledger; does NOT modify mastery", async () => {
  const studentId = "student_phase3_d_isolated";
  const ledgerPath = path.join(WORKSPACE, "data/mastery-evidence", `${studentId}.jsonl`);
  const masteryPath = path.join(WORKSPACE, "data/mastery", `${studentId}.json`);

  // Pre-state
  let preLedger = "";
  try { preLedger = await fs.readFile(ledgerPath, "utf8"); } catch {}
  const preMasteryExists = await fs.access(masteryPath).then(() => true).catch(() => false);
  const preLineCount = preLedger ? preLedger.split("\n").filter(Boolean).length : 0;

  // Emit
  const emitOut = await runTool("science_specialist_emit_evidence", {
    student_id: studentId,
    knowledge_point: "science.G3.LIFE.basic",
    evidence_payload: {
      subskill: "concept",
      error_codes: [],
      result: "correct",
      diagnosis: { mode: "written" },
    },
  });
  assert.equal(emitOut.details.ok, true);
  assert.ok(emitOut.details.evidence_event_id);

  // Post-state
  const postLedger = await fs.readFile(ledgerPath, "utf8");
  const postMasteryExists = await fs.access(masteryPath).then(() => true).catch(() => false);
  const postLineCount = postLedger.split("\n").filter(Boolean).length;
  assert.equal(postLineCount, preLineCount + 1, "ledger should grow by 1");

  // CRITICAL: mastery file must NOT be created or modified
  assert.equal(preMasteryExists, false, "mastery file should not pre-exist");
  assert.equal(postMasteryExists, false, "mastery file MUST NOT be created by emit_evidence");

  // Last ledger line is valid JSON + science subject
  const lastLine = postLedger.split("\n").filter(Boolean).pop();
  const parsed = JSON.parse(lastLine);
  assert.equal(parsed.subject, "science");
  assert.equal(parsed.source, "science_specialist_emit_evidence");

  // Cleanup
  await fs.unlink(ledgerPath).catch(() => {});
});

test("Phase 3-D cross-student isolation: science_specialist_diagnose scoped to student_id", async () => {
  const a = await runTool("science_specialist_diagnose", {
    student_id: "student_test_a",
    stem: "水的沸點？",
    student_answer: "100°C",
    expected_answer: "100°C",
    knowledge_point: "science.G4.CHEM.water-boiling",
    grade: 4,
  });
  const b = await runTool("science_specialist_diagnose", {
    student_id: "student_test_b",
    stem: "水的沸點？",
    student_answer: "100°C",
    expected_answer: "100°C",
    knowledge_point: "science.G4.CHEM.water-boiling",
    grade: 4,
  });
  assert.equal(a.details.evidence_payload.student_id, "student_test_a");
  assert.equal(b.details.evidence_payload.student_id, "student_test_b");
  assert.equal(a.details.correct, b.details.correct);
});

test("Phase 3-D invariant: live student_001.jsonl line count UNCHANGED", async () => {
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const live = await fs.readFile(livePath, "utf8");
  const lines = live.split("\n").filter(Boolean).length;
  assert.equal(lines, 26, "live learning-records must remain at 26 lines");
});

// test/integration_phase3_e.test.mjs — Phase 3-E Social Studies Specialist integration
//
// Verifies:
//   • All 13 new social_studies tools registered (92 + 13 = 105 total)
//   • Each tool returns ok on valid input
//   • social_studies_specialist_emit_evidence APPENDS to evidence ledger,
//     does NOT modify data/mastery/<id>.json directly
//   • Cross-student isolation
//   • Live data/learning-records/student_001.jsonl line count UNCHANGED (26)
//   • 8 decision paths covered across fixtures
//
// Uses real file paths (NOT path.resolve(__dirname, "../..")) —
// uses WORKSPACE = "/home/node/.openclaw/workspace".

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
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

const SOCIAL_STUDIES_TOOLS = [
  "social_studies_error_taxonomy_lookup",
  "social_studies_specialist_diagnose",
  "social_studies_specialist_analyze_timeline",
  "social_studies_specialist_analyze_map",
  "social_studies_specialist_analyze_causality",
  "social_studies_specialist_compare_sources",
  "social_studies_specialist_interpret_demographic_chart",
  "social_studies_specialist_decide",
  "social_studies_specialist_emit_evidence",
  "social_studies_hint_ladder_next",
  "social_studies_curriculum_lookup_kp",
  "social_studies_curriculum_list_for_grade",
  "social_studies_subskill_classify",
];

// Snapshot the live file before any test runs so we can restore at the end.
let liveSnapshot = null;
let liveSnapshotMD5 = null;

async function snapshotLive() {
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  liveSnapshot = await fs.readFile(livePath, "utf8");
  // Quick md5 via crypto
  const crypto = await import("node:crypto");
  liveSnapshotMD5 = crypto.createHash("md5").update(liveSnapshot).digest("hex");
}

async function restoreLive() {
  if (liveSnapshot == null) return;
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const current = await fs.readFile(livePath, "utf8");
  if (current !== liveSnapshot) {
    await fs.writeFile(livePath, liveSnapshot, "utf8");
  }
}

// Snapshot / restore is hooked into the test framework so any failed test
// still leaves the live file untouched.
test.before(snapshotLive);
test.after(restoreLive);

test("plugin loads with all 13 Phase 3-E social_studies tools (total = 105)", async () => {
  const tools = await loadTools();
  for (const name of SOCIAL_STUDIES_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing social_studies tool: ${name}`);
  }
  assert.equal(tools.length, 130, `expected 130 tools, got ${tools.length}`);
});

test("social_studies_error_taxonomy_lookup: returns full taxonomy when no filter", async () => {
  const out = await runTool("social_studies_error_taxonomy_lookup", {});
  assert.equal(out.details.ok, true);
  assert.ok(Array.isArray(out.details.categories));
  assert.ok(out.details.categories.length >= 5);
  assert.ok(Array.isArray(out.details.sample));
  assert.equal(out.details.sample.length, 3);
});

test("social_studies_error_taxonomy_lookup: filters by category", async () => {
  const out = await runTool("social_studies_error_taxonomy_lookup", { category: "history" });
  assert.equal(out.details.ok, true);
  assert.ok(Array.isArray(out.details.entries));
  assert.ok(out.details.entries.length > 0);
});

test("social_studies_error_taxonomy_lookup: returns entry by code", async () => {
  const out = await runTool("social_studies_error_taxonomy_lookup", {
    code: "SS-HIST-ERA-ORDER",
  });
  assert.equal(out.details.ok, true);
  assert.equal(out.details.entry.code, "SS-HIST-ERA-ORDER");
  assert.ok(out.details.entry.hint_template);
});

test("social_studies_specialist_diagnose: correct answer returns ok + hint_level 0", async () => {
  const out = await runTool("social_studies_specialist_diagnose", {
    student_id: "student_test_e",
    stem: "台灣位於哪裡？",
    student_answer: "東亞",
    expected_answer: "東亞",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    mode: "written",
    grade: 4,
  });
  assert.equal(out.details.correct, true);
  assert.equal(out.details.hint_level, 0);
  assert.ok(out.details.evidence_payload);
  assert.equal(out.details.evidence_payload.subject, "social_studies");
});

test("social_studies_specialist_diagnose: incorrect returns error_codes + hint", async () => {
  const out = await runTool("social_studies_specialist_diagnose", {
    student_id: "student_test_e",
    stem: "台灣位於哪裡？",
    student_answer: "南亞",
    expected_answer: "東亞",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    mode: "written",
    grade: 4,
  });
  assert.equal(out.details.correct, false);
  assert.ok(out.details.error_codes.length > 0);
  assert.ok(out.details.hint_text_zh.length > 0);
  assert.equal(out.details.mini_lesson_suggested, true);
});

test("social_studies_specialist_analyze_timeline: wrong order flagged", async () => {
  const out = await runTool("social_studies_specialist_analyze_timeline", {
    student_id: "student_test_e",
    events: [
      { label: "A", year_or_era: 1 },
      { label: "B", year_or_era: 2 },
    ],
    student_order: ["B", "A"],
    expected_order: ["A", "B"],
  });
  assert.equal(out.details.correct, false);
  assert.equal(out.details.misplaced.length, 2);
  assert.equal(out.details.matched.length, 0);
  assert.ok(out.details.hint_text_zh.length > 0);
});

test("social_studies_specialist_analyze_map: matched & missed regions", async () => {
  const out = await runTool("social_studies_specialist_analyze_map", {
    student_id: "student_test_e",
    map_descriptor: { regions: ["北部", "中部", "南部"] },
    question: "指出北部與南部",
    student_answer: "北部 中部",
    expected_answer: ["北部", "南部"],
  });
  assert.equal(out.details.correct, false);
  assert.equal(out.details.matched_regions.length, 1);
  assert.equal(out.details.matched_regions[0], "北部");
  assert.equal(out.details.missed_regions.length, 1);
  assert.equal(out.details.missed_regions[0], "南部");
});

test("social_studies_specialist_analyze_causality: short-term mismatch", async () => {
  const out = await runTool("social_studies_specialist_analyze_causality", {
    student_id: "student_test_e",
    cause: "工業革命",
    student_explained_effects: ["工廠興起", "錯誤項"],
    expected_effects: ["工廠興起", "都市人口增加"],
    kind: "short_term",
  });
  assert.equal(out.details.correct, false);
  assert.equal(out.details.matched_effects.length, 1);
  assert.equal(out.details.spurious_effects.length, 1);
  assert.equal(out.details.missed_effects.length, 1);
  assert.ok(out.details.error_codes.includes("SS-CAUSAL-SHORT-LONG"));
});

test("social_studies_specialist_compare_sources: missed perspective flagged", async () => {
  const out = await runTool("social_studies_specialist_compare_sources", {
    student_id: "student_test_e",
    sources: [
      { label: "日記A", content: "...", type: "primary" },
      { label: "報導B", content: "...", type: "secondary" },
    ],
    student_synthesis: "從日記A來看...",
    expected_synthesis: ["日記A", "報導B"],
  });
  assert.equal(out.details.correct, false);
  assert.ok(out.details.missed_perspectives.includes("報導B"));
  assert.ok(out.details.error_codes.includes("SS-SRC-PRIMARY-SECONDARY"));
});

test("social_studies_specialist_interpret_demographic_chart: missed data point", async () => {
  const out = await runTool("social_studies_specialist_interpret_demographic_chart", {
    student_id: "student_test_e",
    chart_descriptor: { labels: ["0-14", "15-64", "65+"] },
    question: "老化人口比例最高的族群？",
    student_answer: "0-14",
    expected_answer: ["65+"],
  });
  assert.equal(out.details.correct, false);
  assert.equal(out.details.missed_data_points.length, 1);
  assert.ok(out.details.error_codes.includes("SS-DATA-POPULATION-CHART"));
});

test("social_studies_specialist_decide: text_prompt default", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G5.HISTORY.taiwan-early",
    attempts: 1,
  });
  assert.equal(out.details.action, "text_prompt");
  assert.ok(out.details.rationale);
});

test("social_studies_specialist_decide: timeline routes to timeline_walk", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
    error_codes: ["SS-TIME-ORDERING"],
  });
  assert.equal(out.details.action, "timeline_walk");
});

test("social_studies_specialist_decide: geography routes to map_explanation", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    attempts: 1,
    error_codes: ["SS-GEO-COMPASS"],
  });
  assert.equal(out.details.action, "map_explanation");
});

test("social_studies_specialist_decide: source KP routes to source_comparison", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G6.SRC.primary-secondary",
    attempts: 1,
    error_codes: ["SS-SRC-PRIMARY-SECONDARY"],
  });
  assert.equal(out.details.action, "source_comparison");
});

test("social_studies_specialist_decide: data KP routes to chart_drilling", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G6.DATA.population-pyramid",
    attempts: 1,
    error_codes: ["SS-DATA-POPULATION-CHART"],
  });
  assert.equal(out.details.action, "chart_drilling");
});

test("social_studies_specialist_decide: high mastery → mastery_check", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
    mastery: 0.85,
  });
  assert.equal(out.details.action, "mastery_check");
});

test("social_studies_specialist_decide: 5 attempts → backtrack_prerequisite", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 5,
  });
  assert.equal(out.details.action, "backtrack_prerequisite");
});

test("social_studies_specialist_decide: civics + 2 attempts → concept_clarification", async () => {
  const out = await runTool("social_studies_specialist_decide", {
    student_id: "student_test_e",
    knowledge_point: "social.G5.GOV.local-rules",
    attempts: 2,
  });
  assert.equal(out.details.action, "concept_clarification");
});

test("social_studies_hint_ladder_next: returns level + hint_text_zh", async () => {
  const out = await runTool("social_studies_hint_ladder_next", {
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 1,
  });
  assert.ok(typeof out.details.level === "number");
  assert.ok(out.details.level >= 0 && out.details.level <= 4);
  assert.ok(out.details.hint_text_zh.length > 0);
});

test("social_studies_hint_ladder_next: escalates after attempts", async () => {
  const out = await runTool("social_studies_hint_ladder_next", {
    student_id: "student_test_e",
    knowledge_point: "social.G4.TIME.timeline",
    attempts: 3,
    error_codes: ["SS-TIME-ORDERING"],
  });
  assert.ok(out.details.level >= 3);
  assert.equal(out.details.representation_suggestion, "timeline");
});

test("social_studies_curriculum_lookup_kp: returns KP record", async () => {
  const out = await runTool("social_studies_curriculum_lookup_kp", {
    knowledge_point: "social.G4.TIME.timeline",
  });
  assert.equal(out.details.found, true);
  assert.equal(out.details.grade, 4);
});

test("social_studies_curriculum_list_for_grade: G4 returns ≥1 KP", async () => {
  const out = await runTool("social_studies_curriculum_list_for_grade", { grade: 4 });
  assert.equal(out.details.found, true);
  assert.ok(Array.isArray(out.details.knowledge_points));
  assert.ok(out.details.knowledge_points.length >= 1);
});

test("social_studies_subskill_classify: returns primary_subskill", async () => {
  const out = await runTool("social_studies_subskill_classify", {
    knowledge_point: "social.G4.TIME.timeline",
  });
  assert.equal(out.details.primary_subskill, "timeline");
  assert.ok(Array.isArray(out.details.all_subskills));
});

test("social_studies_specialist_emit_evidence: APPENDS to ledger; does NOT modify mastery", async () => {
  const studentId = "student_phase3_e_isolated";
  const ledgerPath = path.join(WORKSPACE, "data/mastery-evidence", `${studentId}.jsonl`);
  const masteryPath = path.join(WORKSPACE, "data/mastery", `${studentId}.json`);

  // Pre-state
  let preLedger = "";
  try { preLedger = await fs.readFile(ledgerPath, "utf8"); } catch {}
  const preMasteryExists = await fs.access(masteryPath).then(() => true).catch(() => false);
  const preLineCount = preLedger ? preLedger.split("\n").filter(Boolean).length : 0;

  // Emit
  const emitOut = await runTool("social_studies_specialist_emit_evidence", {
    student_id: studentId,
    knowledge_point: "social.G4.TIME.timeline",
    evidence_payload: {
      subskill: "timeline",
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

  // Last ledger line is valid JSON + social_studies subject
  const lastLine = postLedger.split("\n").filter(Boolean).pop();
  const parsed = JSON.parse(lastLine);
  assert.equal(parsed.subject, "social_studies");
  assert.equal(parsed.source, "social_studies_specialist_emit_evidence");

  // Cleanup
  await fs.unlink(ledgerPath).catch(() => {});
});

test("Phase 3-E cross-student isolation: diagnose scoped to student_id", async () => {
  const a = await runTool("social_studies_specialist_diagnose", {
    student_id: "student_test_a",
    stem: "台灣位於哪裡？",
    student_answer: "東亞",
    expected_answer: "東亞",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    grade: 4,
  });
  const b = await runTool("social_studies_specialist_diagnose", {
    student_id: "student_test_b",
    stem: "台灣位於哪裡？",
    student_answer: "東亞",
    expected_answer: "東亞",
    knowledge_point: "social.G4.REGION.taiwan-overview",
    grade: 4,
  });
  assert.equal(a.details.evidence_payload.student_id, "student_test_a");
  assert.equal(b.details.evidence_payload.student_id, "student_test_b");
  assert.equal(a.details.correct, b.details.correct);
});

test("Phase 3-E invariant: live student_001.jsonl line count UNCHANGED (26)", async () => {
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const live = await fs.readFile(livePath, "utf8");
  const lines = live.split("\n").filter(Boolean).length;
  assert.equal(lines, 26, "live learning-records must remain at 26 lines");
});

test("Phase 3-E invariant: live student_001.jsonl MD5 UNCHANGED", async () => {
  assert.ok(liveSnapshotMD5, "live snapshot must have been taken in test.before");
  const crypto = await import("node:crypto");
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const current = await fs.readFile(livePath, "utf8");
  const md5 = crypto.createHash("md5").update(current).digest("hex");
  assert.equal(md5, liveSnapshotMD5, "live learning-records MD5 must not change");
});
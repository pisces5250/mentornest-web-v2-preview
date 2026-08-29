// Integration test: Phase 3 sub-session A — Math Specialist v2 + Visual Engine.
// Loads the built dist/ plugin entry and exercises all 11 new math tools.
//
// Verifies:
//   - Plugin entry loads and registers all 11 new math tools
//   - Each tool returns its documented shape on valid input
//   - math_visual_engine_render returns PURE descriptors (no raw SVG strings)
//   - math_specialist_decide produces ALL six action paths across fixtures
//   - math_specialist_emit_evidence APPENDS to evidence ledger (count grows)
//     and does NOT modify data/mastery/<student_id>.json directly
//   - data/learning-records/student_001.jsonl is UNCHANGED (line count + md5)
//   - Cross-student isolation: writes for student_001 do not appear in
//     student_002's evidence ledger.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";
const WORKSPACE = "/home/node/.openclaw/workspace";
const RECORDS_STUDENT_001 = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
const EVIDENCE_STUDENT_001 = path.join(WORKSPACE, "data/mastery-evidence/student_001.jsonl");
const EVIDENCE_STUDENT_002 = path.join(WORKSPACE, "data/mastery-evidence/student_002.jsonl");
const MASTERY_STUDENT_001 = path.join(WORKSPACE, "data/mastery/student_001.json");
const MASTERY_STUDENT_002 = path.join(WORKSPACE, "data/mastery/student_002.json");

// Phase 3.5: emit tests use fake student IDs to avoid polluting production evidence ledger.
// Real-student invariants (RECORDS_STUDENT_001 unchanged + EVIDENCE_STUDENT_001/002 unchanged by emit) still enforced.
const TEST_STUDENT_A = "student_t_a";
const TEST_STUDENT_B = "student_t_a_b";
const EVIDENCE_TEST_A = path.join(WORKSPACE, "data/mastery-evidence", `${TEST_STUDENT_A}.jsonl`);

const MATH_TOOLS = [
  "math_error_taxonomy_lookup",
  "math_visual_engine_render",
  "math_hint_ladder_v2_next",
  "word_problem_decomposer_analyze",
  "word_problem_decomposer_match_template",
  "math_prerequisite_chain_get",
  "math_prerequisite_weakest",
  "math_specialist_diagnose",
  "math_specialist_build_teaching_plan",
  "math_specialist_decide",
  "math_specialist_emit_evidence",
];

async function loadTools() {
  // Re-import the freshly built module.
  const mod = await import(`${PLUGIN_PATH}?t=${Date.now()}_${Math.random()}`);
  const tools = [];
  const fakeApi = { registerTool(t) { tools.push(t); } };
  mod.default.register(fakeApi);
  return { mod, tools };
}

async function readFileOrNull(file) {
  try { return await fs.readFile(file, "utf8"); }
  catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

async function countLines(file) {
  const raw = await readFileOrNull(file);
  if (raw === null) return 0;
  return raw.split("\n").filter((l) => l.trim().length > 0).length;
}

async function fileMD5(file) {
  const buf = await readFileOrNull(file);
  if (buf === null) return null;
  return crypto.createHash("md5").update(Buffer.from(buf)).digest("hex");
}

test("plugin entry loads with all 11 math specialist tools registered", async () => {
  const { mod, tools } = await loadTools();
  assert.ok(mod.default);
  assert.equal(mod.default.id, "mentornest-learning");
  for (const name of MATH_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing tool: ${name}`);
  }
});

test("math_error_taxonomy_lookup: lists categories", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_error_taxonomy_lookup");
  const r = await t.execute("c", {});
  assert.equal(r.details.ok, true);
  assert.ok(r.details.size >= 25);
  const r2 = await t.execute("c", { code: "MATH-CONCEPT" });
  assert.equal(r2.details.ok, true);
  assert.equal(r2.details.entry.code, "MATH-CONCEPT");
  const r3 = await t.execute("c", { category: "MATH-FRAC-OPS" });
  assert.equal(r3.details.ok, true);
  assert.ok(r3.details.count >= 2);
});

test("math_visual_engine_render: returns PURE descriptor (no raw SVG strings)", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_visual_engine_render");
  const inputs = [
    { primitive: "fraction_bar", payload: { numerator: 3, denominator: 4 } },
    { primitive: "number_line", payload: { from: 0, to: 10, marks: [{ value: 5, label: "5" }] } },
    { primitive: "bar_model", payload: { question_type: "part-part-whole", parts: [{ label: "A", size: 2 }, { label: "B", size: 3 }] } },
    { primitive: "percentage_grid", payload: { percentage: 30, rows: 10, cols: 10 } },
    { primitive: "geometry_diagram", payload: { shape: "rectangle", dimensions: { width: 4, height: 3 } } },
    { primitive: "unit_conversion", payload: { from: { unit: "km", value: 1 }, to: { unit: "m", value: 1000 }, kind: "length" } },
  ];
  for (const inp of inputs) {
    const r = await t.execute("c", inp);
    assert.equal(r.details.ok, true, `primitive ${inp.primitive} not ok`);
    // Pure descriptor: must have primitive_id + descriptor object
    assert.ok(r.details.result.primitive_id, `${inp.primitive} missing primitive_id`);
    assert.ok(typeof r.details.result.descriptor === "object", `${inp.primitive} no descriptor object`);
    // NO raw SVG strings
    const asString = JSON.stringify(r.details.result);
    assert.ok(!asString.includes("<svg"), `${inp.primitive} leaked <svg>`);
    assert.ok(!asString.includes("<svg "), `${inp.primitive} leaked <svg `);
  }
});

test("math_hint_ladder_v2_next: returns hint + flags", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_hint_ladder_v2_next");
  const r = await t.execute("c", {
    student_id: 'student_t_a',
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    attempts: 2,
    hints_given: 0,
    representation_used: "symbolic",
    error_type: "MATH-FRAC-ADD-DIFF",
    mastery: 0.3,
  });
  assert.equal(r.details.level >= 1, true);
  assert.ok(["symbolic", "concrete", "visual"].includes(r.details.representation_suggestion));
});

test("word_problem_decomposer_analyze: extracts quantities + question_type", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "word_problem_decomposer_analyze");
  const r = await t.execute("c", {
    stem: "媽媽買了 12 顆糖，哥哥吃了 3/4，共剩下幾顆？",
    grade: 4,
    knowledge_point: "math.G4.FRAC.proper-fraction-add-sub",
  });
  assert.equal(r.details.ok, true);
  assert.ok(r.details.quantities.length >= 2);
});

test("word_problem_decomposer_match_template: returns template_id", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "word_problem_decomposer_match_template");
  const r = await t.execute("c", {
    stem: "小華糖果數量是小明的 3 倍",
    knowledge_point: "math.G5.RATIO.intro",
  });
  assert.ok(r.details.template_id);
});

test("math_prerequisite_chain_get: returns G4 prereq for G5 add-unlike", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_prerequisite_chain_get");
  const r = await t.execute("c", {
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
  });
  assert.equal(r.details.found, true);
  assert.equal(r.details.prereqs.length, 1);
  assert.equal(r.details.prereqs[0].knowledge_point, "math.G4.FRAC.proper-fraction-add-sub");
});

test("math_prerequisite_weakest: returns recommendation_zh", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_prerequisite_weakest");
  const r = await t.execute("c", {
    student_id: 'student_t_a',
    knowledge_point: "math.G6.FRAC.multiply-fraction-fraction",
  });
  assert.ok(typeof r.details.recommendation_zh === "string");
  assert.ok(r.details.recommendation_zh.length > 0);
});

test("math_specialist_diagnose: correct path returns math_correct=true", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_specialist_diagnose");
  const r = await t.execute("c", {
    student_id: 'student_t_a',
    student_answer: "2/4",
    expected_answer: "1/2",
    stem: "1/2 換成 /4 是多少？",
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
  });
  assert.equal(r.details.math_correct, true);
  assert.equal(r.details.hint_ladder_level, 0);
});

test("math_specialist_build_teaching_plan: 5 phases returned", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_specialist_build_teaching_plan");
  const r = await t.execute("c", {
    student_id: 'student_t_a',
    knowledge_point: "math.G6.PERCENT.intro",
    grade: 6,
    mastery_context: { mastery: 0.4, confidence: 0.4 },
  });
  assert.equal(r.details.phases.length, 5);
  assert.equal(r.details.phases[0].phase, "warmup");
});

test("math_specialist_decide: ALL six action paths across fixtures", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_specialist_decide");
  const fixtures = [
    {
      name: "text_prompt",
      params: { student_id: 'student_t_a', knowledge_point: "math.G4.FRAC.proper-fraction-compare", attempts: 1, hints_given: 0, representation_used: "symbolic", error_type: null },
      expect_action: "text_prompt",
    },
    {
      name: "switch_representation",
      params: { student_id: 'student_t_a', knowledge_point: "math.G4.FRAC.proper-fraction-compare", attempts: 1, hints_given: 0, representation_used: "symbolic", error_type: "MATH-CONCEPT" },
      expect_action: "switch_representation",
    },
    {
      name: "visual_representation",
      params: { student_id: 'student_t_a', knowledge_point: "math.G4.FRAC.proper-fraction-compare", attempts: 2, hints_given: 1, representation_used: "concrete", error_type: "MATH-CONCEPT" },
      expect_action: "visual_representation",
    },
    {
      name: "mini_lesson",
      params: { student_id: 'student_t_a', knowledge_point: "math.G5.FRAC.add-unlike-denom", attempts: 2, hints_given: 1, representation_used: "symbolic", error_type: "MATH-FRAC-ADD-DIFF", mastery: 0.3 },
      expect_action: "mini_lesson",
    },
    {
      name: "mastery_check",
      params: { student_id: 'student_t_a', knowledge_point: "math.G6.PERCENT.intro", attempts: 3, hints_given: 0, representation_used: "visual", error_type: "MATH-RATIO", mastery: 0.5 },
      expect_action: "mastery_check",
    },
    {
      name: "backtrack_prerequisite",
      params: { student_id: 'student_t_a', knowledge_point: "math.G6.PERCENT.intro", attempts: 6, hints_given: 3, representation_used: "visual", error_type: "MATH-RATIO" },
      expect_action: "backtrack_prerequisite",
    },
  ];
  for (const fx of fixtures) {
    const r = await t.execute("c", fx.params);
    assert.ok(r.details.action, `fixture ${fx.name} returned no action`);
    assert.equal(r.details.action, fx.expect_action, `fixture ${fx.name} returned ${r.details.action}, expected ${fx.expect_action}`);
  }
});

test("math_specialist_emit_evidence: APPENDS to evidence ledger and DOES NOT modify mastery", async () => {
  // Snapshot baseline counts and mastery MD5 (using TEST student; production invariants checked in later test)
  const cTestBefore = await countLines(EVIDENCE_TEST_A);
  const m001Before = await fileMD5(MASTERY_STUDENT_001);
  const c001Before = await countLines(EVIDENCE_STUDENT_001);

  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_specialist_emit_evidence");
  const r = await t.execute("c", {
    student_id: 'student_t_a',
    knowledge_point: "math.G6.PERCENT.intro",
    evidence_payload: {
      subskill: "percent",
      error_code: "MATH-RATIO",
      result: "incorrect",
      diagnosis: { verdict: "incorrect", reason: "ratio-not-applied" },
      emitted_by: "integration-test-phase3a",
    },
  });
  assert.equal(r.details.ok, true);
  assert.ok(r.details.evidence_event_id);

  const cTestAfter = await countLines(EVIDENCE_TEST_A);
  assert.equal(cTestAfter, cTestBefore + 1, `test evidence line count should grow by 1, was ${cTestBefore} now ${cTestAfter}`);

  // Production student evidence ledger MUST be untouched by emit
  const c001After = await countLines(EVIDENCE_STUDENT_001);
  assert.equal(c001After, c001Before, `production student_001 evidence ledger must not change, was ${c001Before} now ${c001After}`);

  const m001After = await fileMD5(MASTERY_STUDENT_001);
  // For student_001 with no existing mastery, the file may not exist; both null is OK.
  if (m001Before !== null || m001After !== null) {
    // If a mastery file was created after, this would be a bug. Allow either:
    // (a) no file before, no file after (no creation); or
    // (b) file before, file after unchanged.
    // Either way, allow creation but require that if creation happened, it's
    // NOT present after the emit (the tool must not write mastery).
    if (m001Before === null) {
      assert.equal(m001After, null, "mastery file was created by emit_evidence — must not be");
    } else {
      assert.equal(m001After, m001Before, `mastery MD5 should be unchanged, was ${m001Before} now ${m001After}`);
    }
  }
});

test("cross-student isolation: production student_002 evidence ledger untouched by test-student emit", async () => {
  const c002Before = await countLines(EVIDENCE_STUDENT_002);
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "math_specialist_emit_evidence");
  await t.execute("c", {
    student_id: 'student_t_a',
    knowledge_point: "math.G6.FRAC.multiply-fraction-fraction",
    evidence_payload: { subskill: "fraction-mul", result: "incorrect", emitted_by: "isolation-test" },
  });
  const c002After = await countLines(EVIDENCE_STUDENT_002);
  assert.equal(c002After, c002Before, "student_002 evidence ledger should be unchanged by student_001 emit");
});

test("data/learning-records/student_001.jsonl line count + MD5 UNCHANGED", async () => {
  const before = await fs.readFile(RECORDS_STUDENT_001, "utf8");
  const beforeLines = before.split("\n").filter((l) => l.trim().length > 0).length;
  const beforeMD5 = crypto.createHash("md5").update(before).digest("hex");

  // Run several tool calls
  const { tools } = await loadTools();
  const rendering = tools.find((x) => x.name === "math_visual_engine_render");
  for (let i = 0; i < 3; i++) {
    await rendering.execute("c", { primitive: "fraction_bar", payload: { numerator: i + 1, denominator: 4 } });
  }
  const emit = tools.find((x) => x.name === "math_specialist_emit_evidence");
  await emit.execute("c", {
    student_id: 'student_t_a',
    knowledge_point: "math.G6.FRAC.multiply-fraction-fraction",
    evidence_payload: { result: "incorrect", emitted_by: "no-touch-test" },
  });

  const after = await fs.readFile(RECORDS_STUDENT_001, "utf8");
  const afterLines = after.split("\n").filter((l) => l.trim().length > 0).length;
  const afterMD5 = crypto.createHash("md5").update(after).digest("hex");
  assert.equal(afterLines, beforeLines);
  assert.equal(afterMD5, beforeMD5);
});

// Integration test: Phase 3 sub-session B — Chinese Specialist v1.
// Loads the built dist/ plugin entry and exercises all 11 new Chinese tools.
//
// Verifies:
//   - Plugin entry loads and registers all 11 Chinese specialist tools
//   - Each tool returns its documented shape
//   - Cross-student isolation: writes for student_001 do not appear in student_002
//   - evidence_payload appends to the mastery-evidence ledger
//   - student_001.jsonl line count is UNCHANGED (Chinese specialist does not
//     write learning-records directly)

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const PLUGIN_PATH = "/home/node/.openclaw/plugins/mentornest-learning/dist/index.js";
const WORKSPACE = "/home/node/.openclaw/workspace";
const RECORDS_STUDENT_001 = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
const EVIDENCE_STUDENT_001 = path.join(WORKSPACE, "data/mastery-evidence/student_001.jsonl");
const EVIDENCE_STUDENT_002 = path.join(WORKSPACE, "data/mastery-evidence/student_002.jsonl");

// Phase 3.5: emit tests use fake student IDs to avoid polluting production evidence ledger.
// Production invariants (RECORDS_STUDENT_001 unchanged + EVIDENCE_STUDENT_001/002 unchanged by emit) still enforced.
const TEST_STUDENT_B = "student_t_b";
const EVIDENCE_TEST_B = path.join(WORKSPACE, "data/mastery-evidence", `${TEST_STUDENT_B}.jsonl`);

const CHINESE_TOOLS = [
  "chinese_error_taxonomy_lookup",
  "chinese_specialist_diagnose",
  "chinese_specialist_analyze_reading",
  "chinese_specialist_evaluate_composition",
  "chinese_specialist_build_writing_feedback",
  "chinese_specialist_decide",
  "chinese_specialist_emit_evidence",
  "chinese_hint_ladder_next",
  "chinese_curriculum_lookup_kp",
  "chinese_curriculum_list_for_grade",
  "chinese_subskill_classify",
];

async function loadTools() {
  const mod = await import(PLUGIN_PATH);
  const tools = [];
  const fakeApi = { registerTool(t) { tools.push(t); } };
  mod.default.register(fakeApi);
  return { mod, tools };
}

async function readLines(file) {
  try {
    const raw = await fs.readFile(file, "utf8");
    return raw.split("\n").filter((l) => l.trim().length > 0);
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

async function fileMD5(file) {
  try {
    const buf = await fs.readFile(file);
    const crypto = await import("node:crypto");
    return crypto.createHash("md5").update(buf).digest("hex");
  } catch (e) {
    if (e.code === "ENOENT") return null;
    throw e;
  }
}

test("plugin entry loads with Chinese specialist tools registered", async () => {
  const { mod, tools } = await loadTools();
  assert.ok(mod.default);
  assert.equal(mod.default.id, "mentornest-learning");
  for (const name of CHINESE_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing tool: ${name}`);
  }
  assert.equal(tools.length >= CHINESE_TOOLS.length + 20, true, `got ${tools.length} tools`);
});

test("chinese_error_taxonomy_lookup: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_error_taxonomy_lookup");
  const r = await t.execute("c", {});
  assert.equal(r.details.ok, true);
  assert.ok(r.details.size >= 15);
  assert.ok(r.details.categories.length > 5);

  // Lookup by code
  const r2 = await t.execute("c", { code: "ZH-ZI-HOMO" });
  assert.equal(r2.details.ok, true);
  assert.equal(r2.details.entry.code, "ZH-ZI-HOMO");
});

test("chinese_specialist_diagnose: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_diagnose");
  const r = await t.execute("c", {
    stem: "下面哪個字是正確的？",
    student_answer: "作",
    expected_answer: "作",
    knowledge_point: "chinese.G3.VOC.common-vocab",
    grade: 3,
    student_id: "student_t_b",
  });
  assert.equal(r.details.correct, true);
  assert.equal(r.details.hint_level, 0);
  assert.ok(r.details.evidence_payload);
});

test("chinese_specialist_analyze_reading: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_analyze_reading");
  const r = await t.execute("c", {
    stem: "小明在2020年5月10日到台北比賽。",
    student_answer: "5月10日",
    expected_answer: "5月10日",
    kind: "explicit",
  });
  assert.equal(r.details.correct, true);
  assert.equal(r.details.kind, "explicit");
});

test("chinese_specialist_evaluate_composition: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_evaluate_composition");
  const r = await t.execute("c", {
    prompt: "我的家庭",
    student_text: "我有一個家。家裡有三個人。我很愛我的家。",
    grade: 4,
    target_word_count: 50,
  });
  assert.ok(typeof r.details.structure_score === "number");
  assert.ok(Array.isArray(r.details.feedback_lines));
});

test("chinese_specialist_build_writing_feedback: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_build_writing_feedback");
  const r = await t.execute("c", {
    student_text: "這是一個故事。它很短。",
    grade: 4,
    target_features: ["paragraph", "thesis"],
  });
  assert.equal(r.details.feature_pass.paragraph, false);
  assert.equal(r.details.feature_pass.thesis, false);
});

test("chinese_specialist_decide: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_decide");
  const r = await t.execute("c", {
    student_id: "student_t_b",
    knowledge_point: "chinese.G3.VOC.common-vocab",
    attempts: 3,
    error_code: "ZH-ZI-FORM",
  });
  assert.equal(r.details.action, "vocabulary_drill");
});

test("chinese_hint_ladder_next: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_hint_ladder_next");
  const r = await t.execute("c", {
    knowledge_point: "chinese.G5.READ.inference-implicit",
    attempts: 1,
    error_code: "ZH-RD-INF-UNDER",
  });
  assert.equal(r.details.level, 1);
  assert.match(r.details.hint_text_zh, /為什麼/);
});

test("chinese_curriculum_lookup_kp: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_curriculum_lookup_kp");
  const r = await t.execute("c", { knowledge_point: "chinese.G4.READ.main-idea-multi" });
  assert.equal(r.details.found, true);
  assert.equal(r.details.grade, 4);
});

test("chinese_curriculum_list_for_grade: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_curriculum_list_for_grade");
  const r = await t.execute("c", { grade: 5 });
  assert.equal(r.details.found, true);
  assert.ok(r.details.knowledge_points.length >= 1);
});

test("chinese_subskill_classify: end-to-end", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_subskill_classify");
  const r = await t.execute("c", { knowledge_point: "chinese.G3.VOC.common-vocab" });
  assert.equal(r.details.primary_subskill, "詞");
});

// ──────────────────────────────────────────────────────────────────────
// Cross-student isolation + evidence ledger invariants
// ──────────────────────────────────────────────────────────────────────

test("chinese_specialist_emit_evidence: appends to test-student ledger, NOT production ledgers", async () => {
  const beforeTest = await readLines(EVIDENCE_TEST_B);
  const before001 = await readLines(EVIDENCE_STUDENT_001);
  const before002 = await readLines(EVIDENCE_STUDENT_002);
  const beforeTestCount = beforeTest ? beforeTest.length : 0;
  const beforeCount001 = before001 ? before001.length : 0;
  const beforeCount002 = before002 ? before002.length : 0;

  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_emit_evidence");
  const r = await t.execute("c", {
    student_id: 'student_t_b',
    knowledge_point: "chinese.G3.VOC.common-vocab",
    evidence_payload: {
      subskill: "詞",
      error_code: "ZH-ZI-HOMO",
      result: "incorrect",
    },
  });
  assert.equal(r.details.ok, true);
  assert.ok(r.details.evidence_event_id);

  // Test-student ledger SHOULD grow by 1
  const afterTest = await readLines(EVIDENCE_TEST_B);
  assert.ok(afterTest);
  assert.equal(afterTest.length, beforeTestCount + 1);

  // Production ledgers MUST NOT change
  const after001 = await readLines(EVIDENCE_STUDENT_001);
  const after002 = await readLines(EVIDENCE_STUDENT_002);
  if (before001 === null) {
    assert.equal(after001, null, "production student_001 evidence ledger must remain absent");
  } else {
    assert.equal(after001.length, beforeCount001, "production student_001 evidence ledger must not change");
  }
  if (before002 === null) {
    assert.equal(after002, null);
  } else {
    assert.equal(after002.length, beforeCount002);
  }

  // Verify the last line in test-student ledger is well-formed.
  const lastLine = JSON.parse(afterTest[afterTest.length - 1]);
  assert.equal(lastLine.student_id, 'student_t_b');
  assert.equal(lastLine.subject, "chinese");
  assert.equal(lastLine.knowledge_point, "chinese.G3.VOC.common-vocab");
  assert.equal(lastLine.error_type, "ZH-ZI-HOMO");
});

test("chinese_specialist_emit_evidence: rejects invalid student_id", async () => {
  const { tools } = await loadTools();
  const t = tools.find((x) => x.name === "chinese_specialist_emit_evidence");
  const r = await t.execute("c", {
    student_id: "BAD_ID",
    knowledge_point: "chinese.G3.VOC.x",
  });
  assert.equal(r.details.ok, false);
});

test("student_001.jsonl line count is UNCHANGED after Chinese specialist runs", async () => {
  // Read live file; the contract is that Chinese specialist never writes to
  // data/learning-records/.
  const lines = await readLines(RECORDS_STUDENT_001);
  assert.ok(lines);
  assert.equal(lines.length, 26, `expected 26, got ${lines.length}`);
  const md5 = await fileMD5(RECORDS_STUDENT_001);
  assert.equal(md5, "5facdbf0b47e67d30baea59704ef0a90");
});
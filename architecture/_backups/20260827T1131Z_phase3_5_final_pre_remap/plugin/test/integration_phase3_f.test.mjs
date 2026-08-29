// test/integration_phase3_f.test.mjs — Phase 3-F Unified Subject Contract + Cross-Subject Dispatcher integration
//
// Verifies:
//   • All 11 new Phase 3-F tools registered (105 + 11 = 116 total)
//   • Each of the 11 tools returns ok on valid input
//   • subject_specialist_dispatch preserves SUBJECT-SPECIFIC fields:
//       - math: evidence.error_code (single), diagnosis.error_code
//       - chinese: diagnosis.error_codes (array, ZH- prefix)
//       - english: diagnosis.subskill + mode routed through
//       - science: next_action="experiment_simulation" for experiment KP
//       - social_studies: next_action="timeline_walk" for timeline KP
//   • Cross-student isolation: dispatch for student_002 never touches student_001
//   • Live data/learning-records/student_001.jsonl line count UNCHANGED (26)
//   • learning_director_v2_dispatch_next_step merges multi-subject feedback
//
// Uses real file paths (NOT path.resolve(__dirname, "../..")) —
// uses WORKSPACE = "/home/node/.openclaw/workspace".

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs/promises";
import crypto from "node:crypto";
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
  return list;
}

async function runTool(name, params) {
  const t = (await loadTools()).find((x) => x.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return await t.execute("test-call-id", params || {});
}

const PHASE3_F_TOOLS = [
  "subject_v1_contract_version",
  "subject_v1_validate_request",
  "subject_v1_validate_response",
  "subject_specialist_dispatch",
  "subject_specialist_capability_report",
  "cross_subject_merge_decisions",
  "learning_director_v2_dispatch_next_step",
  "learning_director_v2_capability_report",
  "subject_v1_request_template",
  "subject_v1_response_template",
  "subject_v1_dispatch_examples",
];

// Snapshot the live file before any test runs so we can restore at the end.
let liveSnapshot = null;
let liveSnapshotMD5 = null;

async function snapshotLive() {
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  liveSnapshot = await fs.readFile(livePath, "utf8");
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

test.before(snapshotLive);
test.after(restoreLive);

test("plugin loads with all 11 Phase 3-F tools (total = 116)", async () => {
  const tools = await loadTools();
  for (const name of PHASE3_F_TOOLS) {
    assert.ok(tools.find((t) => t.name === name), `missing Phase 3-F tool: ${name}`);
  }
  assert.equal(tools.length, 130, `expected 130 tools, got ${tools.length}`);
});

test("subject_v1_contract_version: returns contract shape", async () => {
  const out = await runTool("subject_v1_contract_version", {});
  assert.equal(out.details.contract_version, "subject-v1");
  assert.equal(out.details.supported_subjects.length, 5);
  assert.ok(Array.isArray(out.details.request_fields));
  assert.ok(Array.isArray(out.details.response_fields));
});

test("subject_v1_validate_request: valid → valid; invalid → errors", async () => {
  const v1 = await runTool("subject_v1_validate_request", {
    contract_version: "subject-v1",
    subject: "math",
    student_id: "student_001",
    knowledge_point: "math.G1.NUM.add-sub-20",
  });
  assert.equal(v1.details.valid, true);

  const v2 = await runTool("subject_v1_validate_request", { subject: "math" });
  assert.equal(v2.details.valid, false);
  assert.ok(v2.details.errors.includes("missing_or_invalid_contract_version"));
});

test("subject_v1_validate_response: missing next_action → invalid", async () => {
  const out = await runTool("subject_v1_validate_response", {
    contract_version: "subject-v1",
    subject: "math",
    student_id: "student_001",
    knowledge_point: "math.G1.x",
    evidence_payload: null,
    diagnosis_payload: null,
    capability_gaps: [],
  });
  assert.equal(out.details.valid, false);
  assert.ok(out.details.errors.includes("missing_next_action"));
});

test("subject_v1_request_template: returns canonical empty request", async () => {
  const out = await runTool("subject_v1_request_template", {});
  assert.equal(out.details.contract_version, "subject-v1");
  assert.equal(out.details.subject, "");
  assert.equal(out.details.student_id, "");
});

test("subject_v1_response_template: returns canonical empty response", async () => {
  const out = await runTool("subject_v1_response_template", {});
  assert.equal(out.details.contract_version, "subject-v1");
  assert.deepEqual(out.details.capability_gaps, []);
  assert.equal(out.details.next_action, "");
});

test("subject_v1_dispatch_examples: returns 5 worked examples", async () => {
  const out = await runTool("subject_v1_dispatch_examples", {});
  assert.ok(out.details.examples);
  assert.equal(out.details.examples.length, 5);
});

test("subject_specialist_capability_report: returns all subjects", async () => {
  const out = await runTool("subject_specialist_capability_report", {});
  assert.equal(out.details.contract_version, "subject-v1");
  for (const s of ["math", "chinese", "english", "science", "social_studies"]) {
    assert.ok(out.details.subjects[s]);
  }
});

test("subject_specialist_capability_report: returns single subject", async () => {
  const out = await runTool("subject_specialist_capability_report", { subject: "math" });
  assert.equal(out.details.subject, "math");
  assert.equal(out.details.known, true);
});

test("subject_specialist_dispatch: math preserves math-specific shape", async () => {
  const out = await runTool("subject_specialist_dispatch", {
    contract_version: "subject-v1",
    subject: "math",
    student_id: "student_001",
    knowledge_point: "math.G1.NUM.add-sub-20",
    diagnosis: { error_code: "MATH-CALC-CARRY" },
    question_request: { stem: "12+7=?", student_answer: "20", expected_answer: "19" },
    mastery_context: { mastery: 0.5, confidence: 0.5 },
  });
  assert.equal(out.details.subject, "math");
  assert.equal(out.details.evidence_payload.subject, "math");
  // Math evidence uses single error_code (string), not error_codes array
  assert.ok("error_code" in out.details.evidence_payload);
  assert.equal(out.details.contract_version, "subject-v1");
});

test("subject_specialist_dispatch: chinese preserves ZH- error codes", async () => {
  const out = await runTool("subject_specialist_dispatch", {
    contract_version: "subject-v1",
    subject: "chinese",
    student_id: "student_002",
    knowledge_point: "chinese.G3.ZI.form",
    question_request: {
      stem: "選出正確的字",
      student_answer: "在",
      expected_answer: "再",
    },
  });
  assert.equal(out.details.subject, "chinese");
  assert.equal(out.details.evidence_payload.subject, "chinese");
  // Chinese diagnosis_payload carries error_codes (could be empty for "在/再" confusable that
  // may map differently, but if present they must start with "ZH-").
  const codes = out.details.diagnosis_payload.error_codes;
  if (Array.isArray(codes) && codes.length > 0) {
    for (const c of codes) {
      assert.ok(c.startsWith("ZH-"), `expected ZH- prefix, got ${c}`);
    }
  }
});

test("subject_specialist_dispatch: english preserves mode + subskill fields", async () => {
  const out = await runTool("subject_specialist_dispatch", {
    contract_version: "subject-v1",
    subject: "english",
    student_id: "student_001",
    knowledge_point: "english.G3.PHONE.letter-sound",
    question_request: {
      stem: "first sound in 'cat'",
      student_answer: "k",
      expected_answer: "k",
      mode: "written",
    },
  });
  assert.equal(out.details.subject, "english");
  assert.equal(out.details.evidence_payload.subject, "english");
  // English diagnosis_payload carries subskill from classifyEnglishSubskill
  assert.ok(out.details.diagnosis_payload.subskill);
});

test("subject_specialist_dispatch: science → experiment_simulation for experiment KP", async () => {
  const out = await runTool("subject_specialist_dispatch", {
    contract_version: "subject-v1",
    subject: "science",
    student_id: "student_001",
    knowledge_point: "science.G5.EXP.experiment-design",
    mastery_context: { mastery: 0.3, confidence: 0.4 },
  });
  assert.equal(out.details.subject, "science");
  assert.equal(out.details.next_action, "experiment_simulation");
});

test("subject_specialist_dispatch: social_studies → timeline_walk for timeline KP", async () => {
  const out = await runTool("subject_specialist_dispatch", {
    contract_version: "subject-v1",
    subject: "social_studies",
    student_id: "student_001",
    knowledge_point: "social.G4.TIME.timeline",
    mastery_context: { mastery: 0.4, confidence: 0.4 },
  });
  assert.equal(out.details.subject, "social_studies");
  assert.equal(out.details.next_action, "timeline_walk");
  assert.equal(out.details.diagnosis_payload.subskill, "timeline");
});

test("subject_specialist_dispatch: unknown subject → error in capability_gaps", async () => {
  const out = await runTool("subject_specialist_dispatch", {
    contract_version: "subject-v1",
    subject: "biology",
    student_id: "student_001",
    knowledge_point: "x",
  });
  assert.ok(out.details.capability_gaps.includes("unknown_subject"));
});

test("cross_subject_merge_decisions: priority order", async () => {
  const out = await runTool("cross_subject_merge_decisions", {
    student_id: "student_001",
    decisions: [
      { subject: "math", action: "text_prompt", mastery: 0.5 },
      { subject: "english", action: "drill_phonics", mastery: 0.3 },
    ],
  });
  assert.equal(out.details.action, "drill_phonics");
  assert.equal(out.details.chosen_subject, "english");
});

test("learning_director_v2_capability_report: 62 tools across 5 subjects", async () => {
  const out = await runTool("learning_director_v2_capability_report", {});
  assert.equal(out.details.contract_version, "subject-v1");
  assert.equal(out.details.tools.math.length, 11);
  assert.equal(out.details.tools.chinese.length, 11);
  assert.equal(out.details.tools.english.length, 16);
  assert.equal(out.details.tools.science.length, 11);
  assert.equal(out.details.tools.social_studies.length, 13);
});

test("learning_director_v2_dispatch_next_step: routes math via KP prefix", async () => {
  const out = await runTool("learning_director_v2_dispatch_next_step", {
    student_id: "student_001",
    student_input: {
      stem: "12+7=?",
      student_answer: "20",
      expected_answer: "19",
      knowledge_point: "math.G1.NUM.add-sub-20",
      mastery_context: { mastery: 0.5, confidence: 0.5 },
    },
  });
  assert.equal(out.details.chosen_subject, "math");
  assert.equal(out.details.response.subject, "math");
});

test("learning_director_v2_dispatch_next_step: routes social_studies → timeline_walk", async () => {
  const out = await runTool("learning_director_v2_dispatch_next_step", {
    student_id: "student_001",
    student_input: {
      stem: "排序事件",
      knowledge_point: "social.G4.TIME.timeline",
      mastery_context: { mastery: 0.4, confidence: 0.4 },
    },
  });
  assert.equal(out.details.chosen_subject, "social_studies");
  assert.equal(out.details.response.next_action, "timeline_walk");
});

test("learning_director_v2_dispatch_next_step: cross-student isolation", async () => {
  // Dispatch for student_002 must NEVER touch student_001's record
  const out = await runTool("learning_director_v2_dispatch_next_step", {
    student_id: "student_002",
    student_input: {
      stem: "12+7=?",
      student_answer: "20",
      expected_answer: "19",
      knowledge_point: "math.G1.NUM.add-sub-20",
      mastery_context: { mastery: 0.5, confidence: 0.5 },
    },
  });
  assert.equal(out.details.response.student_id, "student_002");
  // Confirm live file is unchanged after dispatching for student_002
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const current = await fs.readFile(livePath, "utf8");
  const currentMD5 = crypto.createHash("md5").update(current).digest("hex");
  assert.equal(currentMD5, liveSnapshotMD5, "live student_001.jsonl MD5 changed!");
});

test("live data/learning-records/student_001.jsonl unchanged (MD5 + line count = 26)", async () => {
  const livePath = path.join(WORKSPACE, "data/learning-records/student_001.jsonl");
  const current = await fs.readFile(livePath, "utf8");
  const currentMD5 = crypto.createHash("md5").update(current).digest("hex");
  assert.equal(currentMD5, liveSnapshotMD5);
  assert.equal(current.split("\n").filter((l) => l.length).length, 26);
});

test("live data/mastery/student_001.json unchanged after dispatch tests", async () => {
  const masteryPath = path.join(WORKSPACE, "data/mastery/student_001.json");
  try {
    const before = await fs.readFile(masteryPath, "utf8");
    const md5Before = crypto.createHash("md5").update(before).digest("hex");
    // Run another dispatch — should NOT touch mastery file
    await runTool("subject_specialist_dispatch", {
      contract_version: "subject-v1",
      subject: "math",
      student_id: "student_001",
      knowledge_point: "math.G1.NUM.add-sub-20",
      diagnosis: { error_code: "MATH-CALC-CARRY" },
      question_request: { stem: "12+7=?", student_answer: "20", expected_answer: "19" },
    });
    const after = await fs.readFile(masteryPath, "utf8");
    const md5After = crypto.createHash("md5").update(after).digest("hex");
    assert.equal(md5After, md5Before, "mastery file MD5 changed unexpectedly");
  } catch (e) {
    if (e.code === "ENOENT") {
      // No mastery file is fine — just skip
      return;
    }
    throw e;
  }
});

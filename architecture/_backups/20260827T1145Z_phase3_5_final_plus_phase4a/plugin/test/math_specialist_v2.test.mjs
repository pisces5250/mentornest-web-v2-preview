// Tests: math_specialist_v2.mjs
// Run with: node --test test/math_specialist_v2.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import {
  diagnoseMathResponse,
  buildMathTeachingPlan,
  evidencePayload,
  diagnosisPayload,
  mathSpecialistDecide,
} from "../lib/math_specialist_v2.mjs";

const WORKSPACE = "/home/node/.openclaw/workspace";
const TEST_STUDENT = "student_t_math";
const EVIDENCE_FILE = path.join(WORKSPACE, "data/mastery-evidence", `${TEST_STUDENT}.jsonl`);
const MASTERY_FILE = path.join(WORKSPACE, "data/mastery", `${TEST_STUDENT}.json`);

test("evidencePayload: builds a structured payload", () => {
  const p = evidencePayload({
    student_id: 'student_t_math',
    subject: "math",
    knowledge_point: "math.G4.FRAC.proper-fraction-add-sub",
    error_code: "MATH-FRAC-ADD-DIFF",
    result: "incorrect",
    emitted_by: "test",
  });
  assert.equal(p.schema_version, "math-specialist-evidence-v1");
  assert.equal(p.subject, "math");
  assert.equal(p.error_code, "MATH-FRAC-ADD-DIFF");
});

test("diagnosisPayload: builds a structured payload", () => {
  const p = diagnosisPayload({
    student_id: 'student_t_math',
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
    error_code: "MATH-FRAC-ADD-DIFF",
    error_subtype: "異分母加法錯",
    recommendation_zh: "先想想分母的意義",
  });
  assert.equal(p.schema_version, "math-specialist-diagnosis-v1");
  assert.equal(p.error_code, "MATH-FRAC-ADD-DIFF");
});

test("diagnoseMathResponse: correct answer", () => {
  const r = diagnoseMathResponse({
    student_id: 'student_t_math',
    student_answer: "2/4",
    expected_answer: "1/2",
    stem: "1/2 等於多少/4？",
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
  });
  assert.equal(r.valid, true);
  assert.equal(r.math_correct, true);
  assert.ok(r.evidence_payload);
  assert.ok(r.diagnosis_payload);
  assert.equal(r.hint_ladder_level, 0);
});

test("diagnoseMathResponse: incorrect w/ error code", () => {
  const r = diagnoseMathResponse({
    student_id: 'student_t_math',
    student_answer: "5/4",
    expected_answer: "3/4",
    stem: "計算 1/2 + 1/4 = ?",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    error_type: "fraction_arithmetic",
    hint_history: [{ level: 1, text: "想想分母" }, { level: 2, text: "通分" }],
  });
  assert.equal(r.math_correct, false);
  assert.equal(r.error_type, "MATH-FRAC-OPS");
  assert.ok(r.hint_ladder_level >= 2);
});

test("buildMathTeachingPlan: low mastery → concrete warmup", () => {
  const r = buildMathTeachingPlan({
    student_id: 'student_t_math',
    knowledge_point: "math.G4.FRAC.proper-fraction-add-sub",
    grade: 4,
    mastery_context: { mastery: 0.3, confidence: 0.2 },
    error_history: [{ error_code: "MATH-FRAC-ADD-DIFF", count: 3 }],
  });
  assert.equal(r.phases.length, 5);
  assert.equal(r.phases[0].phase, "warmup");
  assert.ok(r.rationale_zh.includes("從具體表徵"));
});

test("buildMathTeachingPlan: teacher_confirmed defers mastery_check", () => {
  const r = buildMathTeachingPlan({
    student_id: 'student_t_math',
    knowledge_point: "math.G6.PERCENT.intro",
    grade: 6,
    mastery_context: { mastery: 0.85, confidence: 0.95 },
    school_progress: { teacher_confirmed: true },
  });
  assert.ok(r.rationale_zh.includes("課堂上完成"));
});

test("mathSpecialistDecide: text_prompt on first attempt", () => {
  const r = mathSpecialistDecide({
    student_id: 'student_t_math',
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
    attempts: 1,
    hints_given: 0,
    representation_used: "symbolic",
    error_type: null,
  });
  assert.equal(r.action, "text_prompt");
});

test("mathSpecialistDecide: switch_representation on attempts=1 symbolic", () => {
  const r = mathSpecialistDecide({
    student_id: 'student_t_math',
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
    attempts: 1,
    hints_given: 0,
    representation_used: "symbolic",
    error_type: "MATH-CONCEPT",
  });
  assert.equal(r.action, "switch_representation");
});

test("mathSpecialistDecide: visual_representation when concrete failed twice", () => {
  const r = mathSpecialistDecide({
    student_id: 'student_t_math',
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
    attempts: 2,
    hints_given: 1,
    representation_used: "concrete",
    error_type: "MATH-CONCEPT",
  });
  assert.equal(r.action, "visual_representation");
});

test("mathSpecialistDecide: mini_lesson when mastery <0.4 + attempts>=2", () => {
  const r = mathSpecialistDecide({
    student_id: 'student_t_math',
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    attempts: 2,
    hints_given: 1,
    representation_used: "symbolic",
    error_type: "MATH-FRAC-ADD-DIFF",
    mastery: 0.3,
  });
  assert.equal(r.action, "mini_lesson");
});

test("mathSpecialistDecide: mastery_check when attempts>=3", () => {
  const r = mathSpecialistDecide({
    student_id: 'student_t_math',
    knowledge_point: "math.G6.PERCENT.intro",
    attempts: 3,
    hints_given: 0,
    representation_used: "visual",
    error_type: "MATH-RATIO",
    mastery: 0.5,
  });
  assert.equal(r.action, "mastery_check");
});

test("mathSpecialistDecide: backtrack_prerequisite when attempts>=5", () => {
  const r = mathSpecialistDecide({
    student_id: 'student_t_math',
    knowledge_point: "math.G6.PERCENT.intro",
    attempts: 6,
    hints_given: 3,
    representation_used: "visual",
    error_type: "MATH-RATIO",
  });
  assert.equal(r.action, "backtrack_prerequisite");
});

test.after(async () => {
  await fs.unlink(EVIDENCE_FILE).catch(() => {});
  await fs.unlink(MASTERY_FILE).catch(() => {});
  await fs.rm(path.join(WORKSPACE, "data/curriculum-progress", `${TEST_STUDENT}.jsonl`), { recursive: true, force: true }).catch(() => {});
  await fs.rm(path.join(WORKSPACE, "data/mastery-backfill", TEST_STUDENT), { recursive: true, force: true }).catch(() => {});
});

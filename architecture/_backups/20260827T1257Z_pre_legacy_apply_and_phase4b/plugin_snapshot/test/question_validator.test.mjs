import test from "node:test";
import assert from "node:assert/strict";
import {
  validateQuestionStructure,
  isValidDifficulty,
} from "../lib/question_validator.mjs";
import { buildMergedIndex } from "../lib/curriculum_map.mjs";

let idx;
test.before(async () => {
  idx = await buildMergedIndex();
});

const PROV = {
  source_class: "ai_authored",
  source_id: "b",
  license: "AI_ORIGINAL",
  generated_at: "2026-08-27T00:00:00.000Z",
  generated_by: "mentornest_ai",
  prompt_hash: "abcdef0123456789",
};

const baseQ = {
  type: "short_answer",
  subject: "math",
  grade: 5,
  knowledge_point: "math.G5.FRAC.add-unlike-denom",
  difficulty: "easy",
  stem: "計算 1/2 + 1/3 的結果",
  answer: "5/6",
  provenance: PROV,
};

test("isValidDifficulty accepts easy/medium/hard only", () => {
  assert.equal(isValidDifficulty("easy"), true);
  assert.equal(isValidDifficulty("medium"), true);
  assert.equal(isValidDifficulty("hard"), true);
  assert.equal(isValidDifficulty("super-easy"), false);
});

test("validates a clean short_answer question", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.deepEqual(r, { ok: true, type_validated: "short_answer" });
});

test("rejects grade >= 7 (V1 only G1–G6)", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G7.NUM.whatever.x", grade: 7, knowledge_point: "math.G7.NUM.whatever" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /not in curriculum-v1/);
});

test("rejects subject not in curriculum", () => {
  const q = { ...baseQ, id: "q.ai_authored.something.G5.whatever.x", subject: "something", knowledge_point: "something.G5.whatever" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /subject/);
});

test("rejects knowledge_point grade mismatch", () => {
  // math.G6.FRAC.multiply-fraction-fraction exists in curriculum; pair with grade 5 → mismatch
  const q = { ...baseQ, id: "q.ai_authored.math.G6.FRAC.multiply-fraction-fraction.x", grade: 5, knowledge_point: "math.G6.FRAC.multiply-fraction-fraction" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /grade .* != question grade/);
});

test("rejects unsupported type", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", type: "essay" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /unsupported type/);
});

test("rejects invalid difficulty", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", difficulty: "super-hard" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /difficulty/);
});

test("rejects stem too short", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", stem: "hi" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /stem too short/);
});

test("multiple_choice: validates distinct choices + valid answer index", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", type: "multiple_choice", answer: 1, choices: ["1/5", "5/6", "2/3", "1/6"] };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, true);
});

test("multiple_choice: rejects duplicate choices", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", type: "multiple_choice", answer: 1, choices: ["1/5", "1/5", "2/3"] };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /distinct/);
});

test("multiple_choice: rejects out-of-range answer index", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", type: "multiple_choice", answer: 7, choices: ["a", "b"] };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /answer must be valid choice index/);
});

test("true_false: validates boolean answer", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", type: "true_false", answer: true };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, true);
});

test("true_false: rejects non-boolean", () => {
  const q = { ...baseQ, id: "q.ai_authored.math.G5.FRAC.add-unlike-denom.x", type: "true_false", answer: "true" };
  const r = validateQuestionStructure(q, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /boolean/);
});

test("rejects missing required field (id)", () => {
  const { id, ...rest } = baseQ;
  const r = validateQuestionStructure(rest, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /field id missing/);
});

test("rejects missing provenance", () => {
  const { provenance, ...rest } = baseQ;
  const r = validateQuestionStructure({ ...rest, id: "q.x" }, { curriculum_index: idx });
  assert.equal(r.ok, false);
  assert.match(r.reason, /field provenance missing/);
});

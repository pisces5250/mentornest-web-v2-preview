// Structural validator for question objects.
//
// Validates type, fields, and that the question's (subject, kp, grade) tuple
// is consistent with architecture/curriculum/.
//
// Pure function — no IO. Caller passes in `curriculum_index` (already loaded).

export const QUESTION_TYPES = Object.freeze([
  "short_answer",      // a free-text or numeric answer; deterministic
  "multiple_choice",   // exactly one correct answer
  "true_false",        // a true/false
]);

const REQUIRED_BASE = ["id", "type", "subject", "grade", "knowledge_point", "stem", "answer", "provenance"];

const DIFFICULTY = Object.freeze(["easy", "medium", "hard"]);
const VALID_DIFFICULTY = new Set(DIFFICULTY);

export function isValidDifficulty(d) {
  return VALID_DIFFICULTY.has(d);
}

/**
 * Validate a question structure and curriculum alignment.
 *
 * @param {object} q
 * @param {object} ctx
 * @param {object} ctx.curriculum_index - parsed curriculum/index.yaml contents
 * @returns {{ ok: true, type_validated: string } | { ok: false, reason: string }}
 */
export function validateQuestionStructure(q, ctx) {
  if (!q || typeof q !== "object") return { ok: false, reason: "question missing" };
  for (const k of REQUIRED_BASE) {
    if (q[k] === undefined || q[k] === null || q[k] === "") {
      return { ok: false, reason: `field ${k} missing` };
    }
  }
  if (!QUESTION_TYPES.includes(q.type)) {
    return { ok: false, reason: `unsupported type ${q.type}` };
  }
  if (typeof q.subject !== "string" || !/^[a-z_]+$/.test(q.subject)) {
    return { ok: false, reason: `subject ${q.subject} invalid` };
  }
  if (!Number.isInteger(q.grade) || q.grade < 1 || q.grade > 12) {
    return { ok: false, reason: `grade ${q.grade} out of range` };
  }
  if (q.grade >= 7) {
    // Phase 2 V1 only covers G1–G6
    return { ok: false, reason: `grade ${q.grade} not in curriculum-v1 (G1–G6 only)` };
  }
  if (typeof q.knowledge_point !== "string") {
    return { ok: false, reason: "knowledge_point invalid" };
  }
  if (!isValidDifficulty(q.difficulty)) {
    return { ok: false, reason: `difficulty ${q.difficulty} invalid (must be easy/medium/hard)` };
  }
  if (typeof q.stem !== "string" || q.stem.trim().length < 5) {
    return { ok: false, reason: "stem too short" };
  }
  if (q.stem.length > 4000) {
    return { ok: false, reason: "stem too long (>4000 chars)" };
  }

  // Curriculum alignment
  const ci = ctx && ctx.curriculum_index;
  if (!ci || !ci.subjects) {
    return { ok: false, reason: "curriculum_index missing" };
  }
  const subj = ci.subjects[q.subject];
  if (!subj) return { ok: false, reason: `subject ${q.subject} not in curriculum` };
  // G7+ is already rejected; V1 only has G1–G6 subjects
  const kp = subj.knowledge_points && subj.knowledge_points.find((x) => x.id === q.knowledge_point);
  if (!kp) {
    return { ok: false, reason: `knowledge_point ${q.knowledge_point} not in subject ${q.subject}` };
  }
  if (kp.grade !== q.grade) {
    return { ok: false, reason: `knowledge_point grade ${kp.grade} != question grade ${q.grade}` };
  }

  // Type-specific checks
  if (q.type === "short_answer") {
    if (typeof q.answer !== "string" || !q.answer.trim()) {
      return { ok: false, reason: "short_answer: answer missing" };
    }
  } else if (q.type === "multiple_choice") {
    if (!Array.isArray(q.choices) || q.choices.length < 2) {
      return { ok: false, reason: "multiple_choice: choices must be array (>=2)" };
    }
    if (q.choices.length > 8) {
      return { ok: false, reason: "multiple_choice: choices > 8" };
    }
    if (typeof q.answer !== "number" || q.answer < 0 || q.answer >= q.choices.length) {
      return { ok: false, reason: "multiple_choice: answer must be valid choice index" };
    }
    // Choices must be distinct
    const set = new Set(q.choices.map((c) => String(c)));
    if (set.size !== q.choices.length) {
      return { ok: false, reason: "multiple_choice: choices must be distinct" };
    }
  } else if (q.type === "true_false") {
    if (typeof q.answer !== "boolean") {
      return { ok: false, reason: "true_false: answer must be boolean" };
    }
  }

  // Optional: explanation
  if (q.explanation !== undefined && typeof q.explanation !== "string") {
    return { ok: false, reason: "explanation must be string" };
  }

  return { ok: true, type_validated: q.type };
}

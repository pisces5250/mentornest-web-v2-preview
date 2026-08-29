// math_specialist_v2.mjs
//
// Phase 3 sub-session A — Math Specialist v2 orchestrator surface.
//
// Six functions:
//   1) diagnoseMathResponse
//   2) buildMathTeachingPlan
//   3) evidencePayload          (factory)
//   4) diagnosisPayload         (factory)
//   5) mathSpecialistDecide
//
// Pure functions; no I/O. The Math Specialist NEVER directly modifies the
// mastery file — it produces structured evidence_payload / diagnosis_payload
// that the Mastery Engine consumes.

import { validateMathAnswer } from "./math_validator.mjs";
import { nextMathHint, representationEffectiveness } from "./math_hint_ladder_v2.mjs";
import {
  lookupMathErrorCode,
  listMathErrorsByCategory,
  listMathErrorCategories,
  mathErrorTaxonomySize,
  validateMathErrorTaxonomy,
} from "./math_error_taxonomy.mjs";
import { getMathPrerequisites } from "./prerequisite_chain.mjs";

const STUDENT_ID_RE = /^student_[A-Za-z0-9_-]+$/;

// ---------- error_subtype from a MATH-* taxonomy code ----------

function codeFromErrorSubtype(error_type, knowledge_point) {
  // Map plain-string error_type (from Phase 1 / learning_record_append) to a
  // MATH-* family code from the new taxonomy. This keeps backward compat.
  if (!error_type) return null;
  if (error_type.startsWith("MATH-")) return error_type;
  const lc = String(error_type).toLowerCase();
  // Phase-1 vocabulary (kept here for back-compat).
  const PHASE1_TO_MATH = {
    "concept_misunderstanding": "MATH-CONCEPT",
    "computation": "MATH-CALCULATION",
    "calculation": "MATH-CALCULATION",
    "unit_conversion": "MATH-UNIT",
    "careless_error": "MATH-CALC-CARRY",
    "reading_comprehension": "MATH-STEM",
    "missed_condition": "MATH-STEM-MISSED-COND",
    "fraction_arithmetic": "MATH-FRAC-OPS",
    "decimal_arithmetic": "MATH-DEC-OPS",
    "geometry": "MATH-GEOM",
    "vocabulary_gap": "MATH-STEM-KEYWORD",
  };
  return PHASE1_TO_MATH[lc] || error_type;
}

// ---------- factories ----------

/**
 * Build an evidence payload object (NOT yet written to a ledger).
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.subject              — always "math"
 * @param {string} input.knowledge_point
 * @param {string} [input.subskill]
 * @param {string} [input.error_code]
 * @param {string} [input.result]             — correct/incorrect/partially_correct/improved
 * @param {object} [input.diagnosis]
 * @param {string} input.emitted_by           — e.g. "math-specialist-v2"
 * @returns {object}
 */
export function evidencePayload(input) {
  if (!input || typeof input !== "object") throw new Error("evidencePayload: input required");
  if (!input.student_id) throw new Error("evidencePayload: student_id required");
  if (!input.subject) throw new Error("evidencePayload: subject required");
  return {
    schema_version: "math-specialist-evidence-v1",
    emitted_at: new Date().toISOString(),
    emitted_by: input.emitted_by || "math-specialist-v2",
    student_id: input.student_id,
    subject: input.subject,
    knowledge_point: input.knowledge_point || "",
    subskill: input.subskill || "",
    error_code: input.error_code || null,
    result: input.result || null,
    diagnosis: input.diagnosis || null,
  };
}

/**
 * Build a diagnosis payload object.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {string} [input.error_code]
 * @param {string} [input.error_subtype]
 * @param {string} [input.recommendation_zh]
 * @param {object} [input.validator_verdict]
 */
export function diagnosisPayload(input) {
  if (!input || typeof input !== "object") throw new Error("diagnosisPayload: input required");
  return {
    schema_version: "math-specialist-diagnosis-v1",
    student_id: input.student_id || null,
    knowledge_point: input.knowledge_point || null,
    error_code: input.error_code || null,
    error_subtype: input.error_subtype || null,
    recommendation_zh: input.recommendation_zh || null,
    validator_verdict: input.validator_verdict || null,
    decided_at: new Date().toISOString(),
  };
}

// ---------- diagnose ----------

/**
 * Diagnose a math response.
 *
 * Steps:
 *   1) Run deterministic validator (math_validator.mjs).
 *   2) Resolve error_code (MATH-*) from the supplied error_type, or infer a
 *      default from the knowledge_point family.
 *   3) Build hint ladder recommendation.
 *   4) Emit evidence_payload + diagnosis_payload.
 *
 * Pure; no I/O.
 *
 * @param {object} input
 * @param {string} input.student_answer
 * @param {string|number} input.expected_answer
 * @param {string} input.stem
 * @param {string} input.knowledge_point
 * @param {Array<{level:number,text:string}>} [input.hint_history]
 * @param {Array<{representation:string,attempts:number}>} [input.representation_history]
 * @param {object} [input.school_progress]
 */
export function diagnoseMathResponse(input) {
  if (!input || typeof input !== "object") throw new Error("diagnoseMathResponse: input required");
  const { student_answer, expected_answer, stem, knowledge_point } = input;

  if (expected_answer === undefined || expected_answer === null) {
    throw new Error("diagnoseMathResponse: expected_answer required");
  }
  if (typeof knowledge_point !== "string" || knowledge_point.length < 3) {
    throw new Error("diagnoseMathResponse: knowledge_point required");
  }

  // 1) deterministic verdict
  const validator = validateMathAnswer({
    expected_answer,
    student_answer,
    opts: { numeric_tolerance: 0, allow_string_match: true },
  });
  const math_correct = validator.verdict === "correct";

  // 2) error_code
  const error_code = math_correct ? null : codeFromErrorSubtype(input.error_type || null, knowledge_point);
  const error_subtype = error_code ? (lookupMathErrorCode(error_code)?.label_zh || null) : null;

  // 3) compute attempts and hints_from_history
  const hint_history = Array.isArray(input.hint_history) ? input.hint_history : [];
  const representation_history = Array.isArray(input.representation_history) ? input.representation_history : [];
  const rawAttempts = hint_history.length + (math_correct ? 1 : 1);
  // For correct answers with no hints history, treat as level 0.
  const attempts = math_correct && hint_history.length === 0 ? 0 : Math.max(1, rawAttempts);
  const hints_given = hint_history.length;

  // 4) representation suggestion
  const last_rep = representation_history.length
    ? representation_history[representation_history.length - 1].representation
    : "symbolic";
  const eff = representationEffectiveness({ representation: last_rep, attempts, hints: hints_given });

  // 5) next hint. If the answer is correct AND no hints history, force level 0.
  const ladder = nextMathHint({
    student_id: input.student_id || "student_anon",
    subject: "math",
    knowledge_point,
    attempts: math_correct && hint_history.length === 0 ? 1 : attempts,
    hints_given,
    representation_used: last_rep,
    error_type: error_code,
    mastery_context: input.mastery_context || null,
    school_progress_context: input.school_progress || null,
  });
  if (math_correct && hint_history.length === 0) {
    ladder.level = 0;
    ladder.hint_text_zh = "";
    ladder.mini_lesson_suggested = false;
    ladder.mastery_check_suggested = false;
  }

  // 6) diagnosis payload
  const diagnosis = diagnosisPayload({
    student_id: input.student_id || null,
    knowledge_point,
    error_code,
    error_subtype,
    recommendation_zh: ladder.hint_text_zh || null,
    validator_verdict: validator,
  });

  // 7) evidence payload
  const evidence = evidencePayload({
    student_id: input.student_id || "student_anon",
    subject: "math",
    knowledge_point,
    result: math_correct ? "correct" : "incorrect",
    error_code: math_correct ? null : error_code,
    diagnosis: { verdict: validator.verdict, reason: validator.reason },
    emitted_by: "math-specialist-v2",
  });

  return {
    valid: true,
    math_correct,
    error_type: error_code || input.error_type || null,
    error_subtype,
    hint_ladder_level: ladder.level,
    representation_suggestion: eff.switch_to || ladder.representation_suggestion,
    mini_lesson_suggested: ladder.mini_lesson_suggested,
    mastery_check_suggested: ladder.mastery_check_suggested,
    hint_zh: ladder.hint_text_zh,
    evidence_payload: evidence,
    diagnosis_payload: diagnosis,
    validator_summary: {
      verdict: validator.verdict,
      reason: validator.reason,
    },
  };
}

// ---------- teaching plan ----------

/**
 * Build a structured 5-phase teaching plan for a single knowledge point.
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {number} input.grade
 * @param {{mastery?:number, confidence?:number}} [input.mastery_context]
 * @param {{teacher_confirmed?:boolean}} [input.school_progress]
 * @param {Array<{error_code:string, count:number}>} [input.error_history]
 * @returns {{phases:Array, rationale_zh:string}}
 */
export function buildMathTeachingPlan(input) {
  if (!input || !input.student_id) throw new Error("buildMathTeachingPlan: student_id required");
  if (!input.knowledge_point) throw new Error("buildMathTeachingPlan: knowledge_point required");

  const kp = input.knowledge_point;
  const mastery = input.mastery_context && typeof input.mastery_context.mastery === "number"
    ? input.mastery_context.mastery : 0.5;
  const confidence = input.mastery_context && typeof input.mastery_context.confidence === "number"
    ? input.mastery_context.confidence : 0.5;
  const teacher_confirmed = !!(input.school_progress && input.school_progress.teacher_confirmed);
  const topError = Array.isArray(input.error_history) && input.error_history.length
    ? input.error_history[0] : null;

  const target_difficulty = mastery < 0.4 ? "easy" : mastery < 0.7 ? "medium" : "mixed";
  const representation = mastery < 0.4 ? "concrete" : mastery < 0.7 ? "visual" : "symbolic";

  const phases = [
    {
      phase: "warmup",
      focus_kps: topError ? [codeFromErrorSubtype(topError.error_code, kp) || kp] : [kp],
      representation: "concrete",
      target_difficulty: "easy",
      count: mastery < 0.4 ? 4 : 2,
    },
    {
      phase: "instruction",
      focus_kps: [kp],
      representation,
      target_difficulty,
      count: 1,
    },
    {
      phase: "guided_practice",
      focus_kps: [kp],
      representation,
      target_difficulty,
      count: mastery < 0.7 ? 3 : 2,
    },
    {
      phase: "mastery_check",
      focus_kps: [kp],
      representation: "symbolic",
      target_difficulty: mastery < 0.7 ? "medium" : "hard",
      count: teacher_confirmed ? 5 : 3,
    },
    {
      phase: "review",
      focus_kps: getMathPrerequisites({ knowledge_point: kp }).prereqs.map((p) => p.knowledge_point).slice(0, 2),
      representation: "visual",
      target_difficulty: "easy",
      count: 2,
    },
  ];

  let rationale_zh;
  if (teacher_confirmed) {
    rationale_zh = "此知識點已在課堂上完成，建議以鞏固與精熟檢查為主。";
  } else if (mastery < 0.4) {
    rationale_zh = `目前精熟度僅 ${(mastery * 100).toFixed(0)}%，建議從具體表徵 + 基礎練習重新建立。${topError ? `最常見錯誤為 ${topError.error_code}。` : ""}`;
  } else if (mastery < 0.7) {
    rationale_zh = `精熟度 ${(mastery * 100).toFixed(0)}% 屬於中等，建議視覺表徵 + 引導練習鞏固。`;
  } else {
    rationale_zh = `精熟度 ${(mastery * 100).toFixed(0)}%，信心 ${(confidence * 100).toFixed(0)}%，可進入精熟檢查。`;
  }

  return { phases, rationale_zh };
}

// ---------- decide ----------

/**
 * Decides ONE of:
 *   - text_prompt               — verbal hint
 *   - visual_representation     — switch to visual/concrete descriptor
 *   - mini_lesson               — short re-teach segment
 *   - mastery_check             — mini-assessment
 *   - switch_representation     — change representation
 *   - backtrack_prerequisite    — go to prereq
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {string} input.knowledge_point
 * @param {number} input.attempts
 * @param {number} input.hints_given
 * @param {"symbolic"|"concrete"|"visual"} input.representation_used
 * @param {string} [input.error_type]
 * @param {number} [input.mastery]
 * @param {object} [input.school_progress]
 * @returns {{
 *   action: "text_prompt"|"visual_representation"|"mini_lesson"|
 *           "mastery_check"|"switch_representation"|"backtrack_prerequisite",
 *   rationale: string,
 *   hint_payload: object
 * }}
 */
export function mathSpecialistDecide(input) {
  if (!input || !input.student_id) throw new Error("mathSpecialistDecide: student_id required");
  const { student_id, knowledge_point, attempts, hints_given, representation_used, error_type } = input;
  const mastery = typeof input.mastery === "number" ? input.mastery : null;
  const school = input.school_progress || null;

  // Build hint ladder result
  const ladder = nextMathHint({
    student_id,
    subject: "math",
    knowledge_point,
    attempts,
    hints_given,
    representation_used,
    error_type,
    mastery_context: mastery !== null ? { mastery, confidence: 0.5 } : null,
    school_progress_context: school,
  });

  // Routing:
  // Rule 1. correctness confirmed → mastery_check (the student nailed it)
  // Rule 2. attempts >= 4 AND mastery null/school-implied → backtrack
  // Rule 3. attempts >= 3 → mastery_check OR mini_lesson
  // Rule 4. attempts >= 2 + mastery < 0.4 → mini_lesson + switch_representation
  // Rule 5. attempts == 1 + symbolic → switch_representation (concrete)
  // Rule 6. concrete already used 2 times → visual_representation
  // Rule 7. fall-through → text_prompt

  let action;
  let rationale;

  if (error_type === null && attempts <= 1) {
    action = "text_prompt";
    rationale = "first correct-looking attempt; provide one short prompt";
  } else if (attempts >= 5) {
    action = "backtrack_prerequisite";
    rationale = `attempts=${attempts} beyond normal range; suggest prereq review for ${knowledge_point}`;
  } else if (attempts >= 3 && ladder.mastery_check_suggested) {
    action = "mastery_check";
    rationale = `attempts=${attempts} ≥ 3 with mastery context; provide mini-mastery-check`;
  } else if (attempts >= 2 && (mastery === null || mastery < 0.4) && ladder.mini_lesson_suggested) {
    action = "mini_lesson";
    rationale = `attempts=${attempts}, mastery=${mastery}, mini-lesson recommended`;
  } else if (attempts === 1 && representation_used === "symbolic") {
    action = "switch_representation";
    rationale = "first attempt symbolic; switch to concrete";
  } else if (representation_used === "concrete" && attempts >= 2) {
    action = "visual_representation";
    rationale = "concrete failed twice; force visual";
  } else if (representation_used === "visual" && attempts >= 3) {
    action = "backtrack_prerequisite";
    rationale = "visual failed three times; backtrack";
  } else if (ladder.level >= 3) {
    action = "mini_lesson";
    rationale = `hint ladder level=${ladder.level}; escalate to mini-lesson`;
  } else {
    action = "text_prompt";
    rationale = `text prompt level=${ladder.level}`;
  }

  const hint_payload = {
    level: ladder.level,
    hint_text_zh: ladder.hint_text_zh,
    representation_suggestion: ladder.representation_suggestion,
  };

  return {
    action,
    rationale,
    hint_payload,
  };
}

// Re-export helper for tests / others
export {
  validateMathAnswer,
  lookupMathErrorCode,
  listMathErrorsByCategory,
  listMathErrorCategories,
  mathErrorTaxonomySize,
  validateMathErrorTaxonomy,
  STUDENT_ID_RE,
};

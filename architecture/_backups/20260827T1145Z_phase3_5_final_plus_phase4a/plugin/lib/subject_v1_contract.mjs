// subject_v1_contract.mjs — Unified Subject Contract (interface only)
//
// Phase 3 sub-session F.
//
// PURPOSE
//   Provide ONE stable request/response shape that the Learning Director
//   can use to dispatch ANY subject (math, chinese, english, science,
//   social_studies) without leaking per-subject error taxonomies,
//   hint ladders, or evaluation rules into the orchestrator.
//
// CONTRACT GUARANTEES
//   1) Pure validators — no I/O, no specialist invocation.
//   2) Subject expertise is preserved: each subject keeps its OWN
//      diagnose+decide functions. The contract is INTERFACE ONLY.
//   3) Responses preserve subject-specific fields (math_correct for math,
//      mode for english, error_codes starting with ZH-/EN-/SCI-/SS- for
//      their subjects, subskill-routed actions for science/social_studies).
//
// This module must NEVER import per-subject specialist libraries. It only
// knows about shapes, version strings, and validation rules.

/**
 * Version of the unified contract.
 *
 * Bump whenever:
 *   - request or response shape gains/loses a top-level field
 *   - new subject is added
 *   - merge priority order changes
 */
export const SUBJECT_SPECIALIST_CONTRACT_VERSION = "subject-v1";

/**
 * Subjects supported by this contract version.
 *
 * Adding a subject here is a CONTRACT CHANGE (bump version after).
 */
export const SUPPORTED_SUBJECTS = Object.freeze([
  "math",
  "chinese",
  "english",
  "science",
  "social_studies",
]);

/**
 * Canonical request shape (documentation; not enforced structurally).
 *
 * @typedef {Object} SubjectSpecialistRequest
 * @property {string} subject                    — one of SUPPORTED_SUBJECTS
 * @property {string} student_id                 — student_* identifier
 * @property {string} [learning_goal]            — high-level goal text
 * @property {string} knowledge_point            — KP id or free-text KP label
 * @property {object} [school_progress]          — teacher-confirmed progress
 * @property {{mastery?:number, confidence?:number}} [mastery_context]
 * @property {{phases?:Array, rationale_zh?:string}} [teaching_plan]
 * @property {{stem?:string, expected_answer?:string, hints_used?:number}} [question_request]
 * @property {{error_code?:string, error_codes?:string[], validator_verdict?:object}} [diagnosis]
 * @property {string} [next_action]              — desired action override
 * @property {string} contract_version           — must equal SUBJECT_SPECIALIST_CONTRACT_VERSION
 */

/**
 * Canonical response shape (documentation).
 *
 * @typedef {Object} SubjectSpecialistResponse
 * @property {string} subject
 * @property {string} student_id
 * @property {string} knowledge_point
 * @property {object} evidence_payload            — subject-specific evidence schema
 * @property {object} diagnosis_payload           — subject-specific diagnosis schema
 * @property {string} next_action                 — subject-specific action verb
 * @property {{phases?:Array, rationale_zh?:string}} [teaching_plan]
 * @property {string[]} capability_gaps           — documented gaps
 * @property {string} contract_version            — always SUBJECT_SPECIALIST_CONTRACT_VERSION
 */

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function isNonEmptyString(v) {
  return typeof v === "string" && v.length > 0;
}

function isObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Canonical empty request shape. Clients can copy this and fill in.
 */
export function emptySubjectSpecialistRequest() {
  return {
    subject: "",
    student_id: "",
    learning_goal: "",
    knowledge_point: "",
    school_progress: null,
    mastery_context: null,
    teaching_plan: null,
    question_request: null,
    diagnosis: null,
    next_action: null,
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
  };
}

/**
 * Canonical empty response shape.
 */
export function emptySubjectSpecialistResponse() {
  return {
    subject: "",
    student_id: "",
    knowledge_point: "",
    evidence_payload: null,
    diagnosis_payload: null,
    next_action: "",
    teaching_plan: null,
    capability_gaps: [],
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Validators (pure)
// ─────────────────────────────────────────────────────────────────────

/**
 * Validate a unified SubjectSpecialistRequest.
 *
 * Pure; no I/O.
 *
 * @param {unknown} req
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateRequest(req) {
  const errors = [];

  if (!isObject(req)) {
    return { valid: false, errors: ["request_not_object"] };
  }

  // contract_version is mandatory.
  if (req.contract_version !== SUBJECT_SPECIALIST_CONTRACT_VERSION) {
    errors.push("missing_or_invalid_contract_version");
  }

  // subject must be one of supported.
  if (!isNonEmptyString(req.subject)) {
    errors.push("missing_subject");
  } else if (!SUPPORTED_SUBJECTS.includes(req.subject)) {
    errors.push("unknown_subject");
  }

  // student_id must look like student_*.
  if (!isNonEmptyString(req.student_id)) {
    errors.push("missing_student_id");
  } else if (!/^student_[A-Za-z0-9_-]+$/.test(req.student_id)) {
    errors.push("invalid_student_id_format");
  }

  // knowledge_point must be present (specialists require it).
  if (!isNonEmptyString(req.knowledge_point)) {
    errors.push("missing_knowledge_point");
  }

  // Optional nested objects, when present, must be objects.
  if (req.school_progress !== undefined && req.school_progress !== null && !isObject(req.school_progress)) {
    errors.push("invalid_school_progress");
  }
  if (req.mastery_context !== undefined && req.mastery_context !== null && !isObject(req.mastery_context)) {
    errors.push("invalid_mastery_context");
  }
  if (req.teaching_plan !== undefined && req.teaching_plan !== null && !isObject(req.teaching_plan)) {
    errors.push("invalid_teaching_plan");
  }
  if (req.question_request !== undefined && req.question_request !== null && !isObject(req.question_request)) {
    errors.push("invalid_question_request");
  }
  if (req.diagnosis !== undefined && req.diagnosis !== null && !isObject(req.diagnosis)) {
    errors.push("invalid_diagnosis");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a unified SubjectSpecialistResponse.
 *
 * Pure; no I/O.
 *
 * @param {unknown} res
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateResponse(res) {
  const errors = [];

  if (!isObject(res)) {
    return { valid: false, errors: ["response_not_object"] };
  }

  if (res.contract_version !== SUBJECT_SPECIALIST_CONTRACT_VERSION) {
    errors.push("missing_or_invalid_contract_version");
  }

  if (!isNonEmptyString(res.subject)) {
    errors.push("missing_subject");
  } else if (!SUPPORTED_SUBJECTS.includes(res.subject)) {
    errors.push("unknown_subject");
  }

  if (!isNonEmptyString(res.student_id)) {
    errors.push("missing_student_id");
  } else if (!/^student_[A-Za-z0-9_-]+$/.test(res.student_id)) {
    errors.push("invalid_student_id_format");
  }

  if (!isNonEmptyString(res.knowledge_point)) {
    errors.push("missing_knowledge_point");
  }

  if (!isNonEmptyString(res.next_action)) {
    errors.push("missing_next_action");
  }

  // evidence_payload and diagnosis_payload must be objects (or null/undefined allowed).
  if (res.evidence_payload !== undefined && res.evidence_payload !== null && !isObject(res.evidence_payload)) {
    errors.push("invalid_evidence_payload");
  }
  if (res.diagnosis_payload !== undefined && res.diagnosis_payload !== null && !isObject(res.diagnosis_payload)) {
    errors.push("invalid_diagnosis_payload");
  }

  // capability_gaps, when present, must be string array.
  if (res.capability_gaps !== undefined && res.capability_gaps !== null) {
    if (!Array.isArray(res.capability_gaps) || !res.capability_gaps.every((x) => typeof x === "string")) {
      errors.push("invalid_capability_gaps");
    }
  }

  // teaching_plan, when present, must be object.
  if (res.teaching_plan !== undefined && res.teaching_plan !== null && !isObject(res.teaching_plan)) {
    errors.push("invalid_teaching_plan");
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Convenience: describe the contract shape (for capability report).
 */
export function describeContractShape() {
  return {
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    supported_subjects: [...SUPPORTED_SUBJECTS],
    request_fields: [
      "subject",
      "student_id",
      "learning_goal",
      "knowledge_point",
      "school_progress",
      "mastery_context",
      "teaching_plan",
      "question_request",
      "diagnosis",
      "next_action",
      "contract_version",
    ],
    response_fields: [
      "subject",
      "student_id",
      "knowledge_point",
      "evidence_payload",
      "diagnosis_payload",
      "next_action",
      "teaching_plan",
      "capability_gaps",
      "contract_version",
    ],
  };
}

/**
 * Worked examples (one per supported subject) used for client demos
 * and for the `subject_v1_dispatch_examples` tool.
 *
 * Each example is a fully-formed REQUEST; callers should treat the
 * examples as illustrative, not as authoritative fixtures.
 */
export function dispatchExamples() {
  const v = SUBJECT_SPECIALIST_CONTRACT_VERSION;
  return [
    {
      label: "math: simple arithmetic",
      subject: "math",
      request: {
        subject: "math",
        student_id: "student_demo",
        knowledge_point: "F3-add-sub-20",
        learning_goal: "兩位數加減",
        school_progress: null,
        mastery_context: { mastery: 0.55, confidence: 0.6 },
        teaching_plan: null,
        question_request: {
          stem: "12 + 7 = ?",
          expected_answer: "19",
          hints_used: 0,
        },
        diagnosis: null,
        next_action: null,
        contract_version: v,
      },
    },
    {
      label: "chinese: 字形 error",
      subject: "chinese",
      request: {
        subject: "chinese",
        student_id: "student_demo",
        knowledge_point: "G3-zi-xie-cuo",
        learning_goal: "字形辨識",
        school_progress: null,
        mastery_context: { mastery: 0.4, confidence: 0.5 },
        teaching_plan: null,
        question_request: {
          stem: "「」的正確寫法是？",
          expected_answer: "的",
          hints_used: 1,
        },
        diagnosis: null,
        next_action: null,
        contract_version: v,
      },
    },
    {
      label: "english: phonics",
      subject: "english",
      request: {
        subject: "english",
        student_id: "student_demo",
        knowledge_point: "G2-phonics-short-a",
        learning_goal: "short vowel a",
        school_progress: null,
        mastery_context: { mastery: 0.5, confidence: 0.5 },
        teaching_plan: null,
        question_request: {
          stem: "What is the first sound in 'cat'?",
          expected_answer: "k",
          hints_used: 0,
        },
        diagnosis: null,
        next_action: null,
        contract_version: v,
      },
    },
    {
      label: "science: experiment design",
      subject: "science",
      request: {
        subject: "science",
        student_id: "student_demo",
        knowledge_point: "G5-sci-experiment-design",
        learning_goal: "實驗設計",
        school_progress: null,
        mastery_context: { mastery: 0.45, confidence: 0.5 },
        teaching_plan: null,
        question_request: {
          stem: "設計一個比較水溫對溶解速度影響的實驗。",
          expected_answer: "controlled variables: 水量, 糖量; independent: 水溫; dependent: 溶解時間",
          hints_used: 0,
        },
        diagnosis: null,
        next_action: null,
        contract_version: v,
      },
    },
    {
      label: "social_studies: timeline ordering",
      subject: "social_studies",
      request: {
        subject: "social_studies",
        student_id: "student_demo",
        knowledge_point: "G5-ss-timeline",
        learning_goal: "時序排序",
        school_progress: null,
        mastery_context: { mastery: 0.5, confidence: 0.5 },
        teaching_plan: null,
        question_request: {
          stem: "將下列事件依時序排列。",
          expected_answer: "A,B,C,D",
          hints_used: 0,
        },
        diagnosis: null,
        next_action: null,
        contract_version: v,
      },
    },
  ];
}

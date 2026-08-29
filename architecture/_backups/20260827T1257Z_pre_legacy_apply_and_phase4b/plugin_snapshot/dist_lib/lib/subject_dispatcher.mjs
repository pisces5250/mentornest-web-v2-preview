// subject_dispatcher.mjs — Unified subject dispatcher (interface only)
//
// Phase 3 sub-session F.
//
// PURPOSE
//   Given a validated SubjectSpecialistRequest, route it to the
//   matching per-subject specialist (math_specialist_v2,
//   chinese_specialist, english_specialist, science_specialist,
//   social_studies_specialist) and stitch the result back into the
//   unified response shape.
//
// GUARANTEES
//   - Pure function; no I/O.
//   - Each subject's diagnose + decide functions are called with their
//     OWN signatures (no generic normalisation).
//   - Response preserves subject-specific fields verbatim
//     (math_correct, error_codes with subject prefix, mode, subskill-
//     routed actions, etc.).
//   - Unknown subject yields a structured error response (still shaped
//     like SubjectSpecialistResponse with contract_version set).

import {
  SUBJECT_SPECIALIST_CONTRACT_VERSION,
  SUPPORTED_SUBJECTS,
  validateRequest,
} from "./subject_v1_contract.mjs";

import {
  diagnoseMathResponse,
  mathSpecialistDecide,
} from "./math_specialist_v2.mjs";
import {
  diagnoseChineseResponse,
  chineseSpecialistDecide,
} from "./chinese_specialist.mjs";
import {
  diagnoseEnglishResponse,
  englishSpecialistDecide,
} from "./english_specialist.mjs";
import {
  diagnoseScienceResponse,
  scienceSpecialistDecide,
} from "./science_specialist.mjs";
import {
  diagnoseSocialStudiesResponse,
  socialStudiesSpecialistDecide,
} from "./social_studies_specialist.mjs";

// ─────────────────────────────────────────────────────────────────────
// Capability gaps per subject (declarative, exposed via capability tool)
// ─────────────────────────────────────────────────────────────────────

/**
 * Per-subject capability gaps. These describe what each specialist
 * does NOT do today. Surfaced by capability_report and copied into
 * SubjectSpecialistResponse.capability_gaps when relevant.
 */
export const SUBJECT_CAPABILITY_GAPS = Object.freeze({
  math: [
    "no_proof_verification",
    "no_symbolic_algebra_solver",
    "uses_deterministic_validator_only",
  ],
  chinese: [
    "no_handwriting_ocr",
    "no_speech_to_text",
    "composition_eval_is_scaffold_only",
  ],
  english: [
    "speech_scoring_is_gated_to_local_stt",
    "no_tts_production",
    "no_pronunciation_scoring",
  ],
  science: [
    "no_image_recognition",
    "no_virtual_lab_execution",
    "experiment_simulation_is_text_only",
  ],
  social_studies: [
    "no_historical_ocr",
    "no_map_image_recognition",
    "timeline_walk_is_text_only",
  ],
});

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function errResponse(subject, errors) {
  return {
    subject: subject || "",
    student_id: "",
    knowledge_point: "",
    evidence_payload: null,
    diagnosis_payload: null,
    next_action: "",
    teaching_plan: null,
    capability_gaps: errors,
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
  };
}

function okResponse(subject, student_id, knowledge_point, diagnosis, decision, capabilityGaps) {
  return {
    subject,
    student_id,
    knowledge_point,
    evidence_payload: diagnosis.evidence_payload,
    diagnosis_payload: diagnosis.diagnosis_payload,
    next_action: decision.action,
    teaching_plan: null,
    capability_gaps: capabilityGaps ? [...capabilityGaps] : [],
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Per-subject adapters
//
// Each adapter takes a validated request and returns
// { diagnosis, decision }. They preserve subject-specific fields verbatim.
// ─────────────────────────────────────────────────────────────────────

function runMath(req) {
  const kp = req.knowledge_point;
  const qr = req.question_request || {};
  const diagInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    student_answer: qr.student_answer,
    expected_answer: qr.expected_answer,
    stem: qr.stem,
    hint_history: qr.hint_history,
    representation_history: qr.representation_history,
    error_type: req.diagnosis && req.diagnosis.error_code ? req.diagnosis.error_code : null,
    mastery_context: req.mastery_context || null,
    school_progress: req.school_progress || null,
  };
  const diagnosis = diagnoseMathResponse(diagInput);

  const decInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    attempts: qr.attempts || 1,
    hints_given: qr.hints_used || 0,
    representation_used: qr.representation_used || "symbolic",
    error_type: diagnosis.error_type,
    mastery:
      req.mastery_context && typeof req.mastery_context.mastery === "number"
        ? req.mastery_context.mastery
        : null,
    school_progress: req.school_progress || null,
  };
  const decision = mathSpecialistDecide(decInput);

  return { diagnosis, decision };
}

function runChinese(req) {
  const kp = req.knowledge_point;
  const qr = req.question_request || {};
  const diagInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    stem: qr.stem,
    student_answer: qr.student_answer,
    expected_answer: qr.expected_answer,
    grade: req.grade,
    error_taxonomy_code: req.diagnosis && req.diagnosis.error_code ? req.diagnosis.error_code : "",
  };
  const diagnosis = diagnoseChineseResponse(diagInput);

  // Map evidence error_code → single code for decide.
  let error_code = "";
  const diagErrs = diagnosis.diagnosis_payload && diagnosis.diagnosis_payload.error_codes;
  if (Array.isArray(diagErrs) && diagErrs.length) error_code = diagErrs[0];
  if (!error_code && diagnosis.error_codes && diagnosis.error_codes.length) {
    error_code = diagnosis.error_codes[0];
  }

  const decInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    attempts: qr.attempts || 1,
    mastery:
      req.mastery_context && typeof req.mastery_context.mastery === "number"
        ? req.mastery_context.mastery
        : null,
    error_code,
    representation_history: qr.representation_history || [],
  };
  const decision = chineseSpecialistDecide(decInput);

  return { diagnosis, decision };
}

function runEnglish(req) {
  const kp = req.knowledge_point;
  const qr = req.question_request || {};
  const mode = qr.mode || "written";
  const error_codes =
    (req.diagnosis && Array.isArray(req.diagnosis.error_codes) && req.diagnosis.error_codes) || [];

  const diagInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    stem: qr.stem,
    student_answer: qr.student_answer,
    expected_answer: qr.expected_answer,
    grade: req.grade,
    mode,
    error_code: error_codes[0] || "",
    transcript_metadata: qr.transcript_metadata,
  };
  const diagnosis = diagnoseEnglishResponse(diagInput);

  const decInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    attempts: qr.attempts || 1,
    mastery:
      req.mastery_context && typeof req.mastery_context.mastery === "number"
        ? req.mastery_context.mastery
        : null,
    error_codes,
    representation_history: qr.representation_history || [],
    mode,
  };
  const decision = englishSpecialistDecide(decInput);

  return { diagnosis, decision };
}

function runScience(req) {
  const kp = req.knowledge_point;
  const qr = req.question_request || {};
  const diagInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    stem: qr.stem,
    student_answer: qr.student_answer,
    expected_answer: qr.expected_answer,
    grade: req.grade,
    mode: qr.mode || "written",
  };
  const diagnosis = diagnoseScienceResponse(diagInput);

  const decInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    attempts: qr.attempts || 1,
    mastery:
      req.mastery_context && typeof req.mastery_context.mastery === "number"
        ? req.mastery_context.mastery
        : null,
    error_codes: diagnosis.error_codes,
  };
  const decision = scienceSpecialistDecide(decInput);

  return { diagnosis, decision };
}

function runSocialStudies(req) {
  const kp = req.knowledge_point;
  const qr = req.question_request || {};
  const diagInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    stem: qr.stem,
    student_answer: qr.student_answer,
    expected_answer: qr.expected_answer,
    grade: req.grade,
    mode: qr.mode || "written",
  };
  const diagnosis = diagnoseSocialStudiesResponse(diagInput);

  const decInput = {
    student_id: req.student_id,
    knowledge_point: kp,
    attempts: qr.attempts || 1,
    mastery:
      req.mastery_context && typeof req.mastery_context.mastery === "number"
        ? req.mastery_context.mastery
        : null,
    error_codes: diagnosis.error_codes,
  };
  const decision = socialStudiesSpecialistDecide(decInput);

  return { diagnosis, decision };
}

const ADAPTERS = Object.freeze({
  math: runMath,
  chinese: runChinese,
  english: runEnglish,
  science: runScience,
  social_studies: runSocialStudies,
});

// ─────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────

/**
 * Dispatch a unified SubjectSpecialistRequest to the matching specialist
 * and return a unified SubjectSpecialistResponse.
 *
 * Pure; no I/O.
 *
 * Behaviour:
 *   - If `req.contract_version` ≠ SUBJECT_SPECIALIST_CONTRACT_VERSION →
 *     returns a structured error response.
 *   - If subject is unknown → returns a structured error response.
 *   - If subject is known → calls the subject's diagnose+decide and
 *     stitches into the unified response.
 *
 * @param {object} req
 * @returns {object} SubjectSpecialistResponse (or error variant)
 */
export function dispatchSubjectSpecialist(req) {
  const v = validateRequest(req);
  if (!v.valid) {
    return errResponse(req && req.subject, v.errors);
  }

  const adapter = ADAPTERS[req.subject];
  if (typeof adapter !== "function") {
    return errResponse(req.subject, ["unknown_subject"]);
  }

  let result;
  try {
    result = adapter(req);
  } catch (err) {
    return errResponse(req.subject, [
      "specialist_threw",
      String(err && err.message ? err.message : "unknown"),
    ]);
  }

  const gaps = SUBJECT_CAPABILITY_GAPS[req.subject] || [];
  return okResponse(
    req.subject,
    req.student_id,
    req.knowledge_point,
    result.diagnosis,
    result.decision,
    gaps
  );
}

/**
 * Return the per-subject (or all) capability summary.
 *
 * @param {string} [subject] optional; if omitted, returns all subjects
 * @returns {object} capability report
 */
export function subjectCapabilityReport(subject) {
  if (subject) {
    if (!SUPPORTED_SUBJECTS.includes(subject)) {
      return {
        contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
        subject,
        known: false,
        error: "unknown_subject",
      };
    }
    return {
      contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
      subject,
      known: true,
      capability_gaps: [...(SUBJECT_CAPABILITY_GAPS[subject] || [])],
      contract_supported: true,
    };
  }
  const all = {};
  for (const s of SUPPORTED_SUBJECTS) {
    all[s] = {
      capability_gaps: [...(SUBJECT_CAPABILITY_GAPS[s] || [])],
      contract_supported: true,
    };
  }
  return {
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    subjects: all,
  };
}

export { SUPPORTED_SUBJECTS, SUBJECT_SPECIALIST_CONTRACT_VERSION };

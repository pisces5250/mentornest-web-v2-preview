// learning_director_v2.mjs — Extension of learning_director.mjs.
//
// Phase 3 sub-session F.
//
// IMPORTANT
//   - This module does NOT modify the original learning_director.mjs.
//   - It builds on top of it: subject-specialist dispatch +
//     cross-subject merge.
//
// PURPOSE
//   Provide ONE orchestrator entry point that:
//     1) chooses the right subject if the caller did not specify one
//        (heuristic via KP prefix),
//     2) dispatches the request through the unified contract
//        (subject_dispatcher), and
//     3) merges any multi-subject feedback (cross_subject_merge).
//
// SCOPE
//   - Pure functions only (no I/O, no fs).
//   - Subject expertise stays in per-subject specialists.
//
// SUBJECT HEURISTIC
//   KP id prefixes recognised:
//     math.*        → math
//     chinese.*     → chinese
//     english.*     → english
//     science.*     → science
//     social.*      → social_studies   (curriculum uses "social")
//     ss.*          → social_studies   (alias)
//
//   If current_subject is provided AND it is supported, it wins.
//   If KP prefix matches, that wins.
//   Otherwise we fall back to current_subject if provided, else "math".

import {
  SUBJECT_SPECIALIST_CONTRACT_VERSION,
  SUPPORTED_SUBJECTS,
} from "./subject_v1_contract.mjs";
import {
  dispatchSubjectSpecialist,
  subjectCapabilityReport,
  SUBJECT_CAPABILITY_GAPS,
} from "./subject_dispatcher.mjs";
import {
  mergeCrossSubjectDecisions,
  ACTION_PRIORITY,
} from "./cross_subject_merge.mjs";

// KP prefix → canonical subject id. Lower-cased.
const KP_PREFIX_TO_SUBJECT = Object.freeze({
  "math.": "math",
  "chinese.": "chinese",
  "english.": "english",
  "science.": "science",
  "social.": "social_studies",
  "ss.": "social_studies",
});

/**
 * Heuristically choose a subject from a KP id.
 *
 * @param {string} knowledge_point
 * @returns {string|null} one of SUPPORTED_SUBJECTS or null if no prefix matched
 */
export function chooseSubjectFromKnowledgePoint(knowledge_point) {
  if (typeof knowledge_point !== "string" || knowledge_point.length === 0) return null;
  const kp = knowledge_point.toLowerCase();
  for (const [prefix, subj] of Object.entries(KP_PREFIX_TO_SUBJECT)) {
    if (kp.startsWith(prefix)) return subj;
  }
  return null;
}

/**
 * Choose a subject given optional explicit current_subject + knowledge_point.
 *
 * @param {{current_subject?: string, knowledge_point?: string}} input
 * @returns {string} one of SUPPORTED_SUBJECTS (defaults to "math")
 */
export function chooseSubject(input) {
  const current = input && typeof input.current_subject === "string"
    ? input.current_subject.toLowerCase()
    : "";
  if (current && SUPPORTED_SUBJECTS.includes(current)) return current;

  const byKp = chooseSubjectFromKnowledgePoint(input && input.knowledge_point);
  if (byKp) return byKp;

  // Last resort: respect current if it looks valid; else math.
  if (current) return current;
  return "math";
}

/**
 * Inspect student_input to extract a knowledge_point hint.
 * Recognises:
 *   - input.knowledge_point (explicit)
 *   - a KP-shaped substring in input.text / input.stem
 *
 * @param {object} input
 * @returns {string}
 */
export function extractKnowledgePointFromInput(input) {
  if (!input || typeof input !== "object") return "";
  if (typeof input.knowledge_point === "string" && input.knowledge_point.length > 0) {
    return input.knowledge_point;
  }
  const hay = `${input.text || ""} ${input.stem || ""}`;
  const m = hay.match(/\b(?:math|chinese|english|science|social|ss)\.[A-Za-z0-9_.\-]+/i);
  return m ? m[0] : "";
}

// ─────────────────────────────────────────────────────────────────────
// dispatchNextStep
// ─────────────────────────────────────────────────────────────────────

/**
 * Choose subject (if not provided), dispatch via unified contract,
 * then merge if multi-subject feedback exists.
 *
 * Pure; no I/O.
 *
 * @param {{student_id: string, student_input: object, current_subject?: string}} input
 * @returns {{
 *   chosen_subject: string,
 *   knowledge_point: string,
 *   response: object,
 *   merge?: object,
 *   contract_version: string
 * }}
 */
export function dispatchNextStep(input) {
  if (!input || typeof input !== "object") {
    throw new Error("dispatchNextStep: input required");
  }
  if (typeof input.student_id !== "string" || !/^student_[A-Za-z0-9_-]+$/.test(input.student_id)) {
    throw new Error("dispatchNextStep: student_id invalid");
  }

  const student_input = input.student_input || {};
  const knowledge_point = extractKnowledgePointFromInput(student_input) ||
    (typeof input.knowledge_point === "string" ? input.knowledge_point : "");

  const subject = chooseSubject({
    current_subject: input.current_subject,
    knowledge_point,
  });

  const request = {
    subject,
    student_id: input.student_id,
    learning_goal: typeof student_input.learning_goal === "string" ? student_input.learning_goal : "",
    knowledge_point,
    school_progress: student_input.school_progress || null,
    mastery_context: student_input.mastery_context || null,
    teaching_plan: student_input.teaching_plan || null,
    question_request: {
      stem: student_input.stem || student_input.text || "",
      expected_answer: student_input.expected_answer,
      student_answer: student_input.student_answer,
      hints_used: student_input.hints_used || 0,
      attempts: student_input.attempts || 1,
      representation_history: student_input.representation_history || [],
      representation_used: student_input.representation_used || "symbolic",
      mode: student_input.mode || "written",
      transcript_metadata: student_input.transcript_metadata,
    },
    diagnosis: student_input.diagnosis || null,
    next_action: student_input.next_action || null,
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
  };

  const response = dispatchSubjectSpecialist(request);

  // Multi-subject merge: if the caller supplied a `multi_subjects` array,
  // dispatch each one and merge using cross_subject_merge.
  let merge = null;
  if (Array.isArray(student_input.multi_subjects) && student_input.multi_subjects.length > 0) {
    const responses = [response];
    for (const ms of student_input.multi_subjects) {
      if (!ms || typeof ms !== "object") continue;
      const ms_request = {
        ...request,
        subject: typeof ms.subject === "string" ? ms.subject : subject,
        knowledge_point: typeof ms.knowledge_point === "string" ? ms.knowledge_point : knowledge_point,
        mastery_context: ms.mastery_context || request.mastery_context,
        question_request: {
          ...request.question_request,
          ...(ms.question_request || {}),
        },
      };
      responses.push(dispatchSubjectSpecialist(ms_request));
    }
    merge = mergeCrossSubjectDecisions({
      decisions: responses.map((r) => ({
        subject: r.subject,
        action: r.next_action,
        mastery:
          r.diagnosis_payload && typeof r.diagnosis_payload.mastery === "number"
            ? r.diagnosis_payload.mastery
            : Number.POSITIVE_INFINITY,
        knowledge_point: r.knowledge_point || "",
      })),
      student_id: input.student_id,
    });
  }

  return {
    chosen_subject: subject,
    knowledge_point,
    response,
    merge,
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
  };
}

// ─────────────────────────────────────────────────────────────────────
// Capability report
// ─────────────────────────────────────────────────────────────────────

/**
 * Return the unified contract version + per-subject capability summary.
 *
 * Pure; delegates to subject_dispatcher.subjectCapabilityReport and
 * lists the tool names available per subject (read from a static map,
 * not by introspection, so it remains pure).
 *
 * @returns {object}
 */
export function learningDirectorV2CapabilityReport() {
  const report = subjectCapabilityReport();
  return {
    contract_version: SUBJECT_SPECIALIST_CONTRACT_VERSION,
    supported_subjects: [...SUPPORTED_SUBJECTS],
    action_priority: [...ACTION_PRIORITY],
    subject_capabilities: report.subjects,
    capability_gaps_by_subject: Object.fromEntries(
      Object.entries(SUBJECT_CAPABILITY_GAPS).map(([k, v]) => [k, [...v]])
    ),
    tools: PER_SUBJECT_TOOL_NAMES,
  };
}

/**
 * Static list of tools associated with each subject (Phase 3-F only
 * needs a readable summary; the actual tool registry lives in
 * index.ts).
 */
export const PER_SUBJECT_TOOL_NAMES = Object.freeze({
  math: [
    "math_specialist_diagnose",
    "math_specialist_build_teaching_plan",
    "math_specialist_decide",
    "math_specialist_emit_evidence",
    "math_error_taxonomy_lookup",
    "math_hint_ladder_v2_next",
    "math_visual_engine_render",
    "word_problem_decomposer_analyze",
    "word_problem_decomposer_match_template",
    "math_prerequisite_chain_get",
    "math_prerequisite_weakest",
  ],
  chinese: [
    "chinese_specialist_diagnose",
    "chinese_specialist_analyze_reading",
    "chinese_specialist_evaluate_composition",
    "chinese_specialist_build_writing_feedback",
    "chinese_specialist_decide",
    "chinese_specialist_emit_evidence",
    "chinese_error_taxonomy_lookup",
    "chinese_hint_ladder_next",
    "chinese_curriculum_lookup_kp",
    "chinese_curriculum_list_for_grade",
    "chinese_subskill_classify",
  ],
  english: [
    "english_specialist_diagnose",
    "english_specialist_analyze_reading",
    "english_specialist_transcribe_and_grade",
    "english_specialist_evaluate_conversation",
    "english_specialist_decide",
    "english_specialist_emit_evidence",
    "english_error_taxonomy_lookup",
    "english_hint_ladder_next",
    "english_curriculum_lookup_kp",
    "english_curriculum_list_for_grade",
    "english_subskill_classify",
    "english_stt_validate_audio_path",
    "english_stt_validate_transcript",
    "english_stt_transcription_gate",
    "english_stt_capability_report",
    "english_stt_request",
  ],
  science: [
    "science_specialist_diagnose",
    "science_specialist_analyze_experiment",
    "science_specialist_interpret_chart_table",
    "science_specialist_interpret_diagram",
    "science_specialist_decide",
    "science_specialist_emit_evidence",
    "science_error_taxonomy_lookup",
    "science_hint_ladder_next",
    "science_curriculum_lookup_kp",
    "science_curriculum_list_for_grade",
    "science_subskill_classify",
  ],
  social_studies: [
    "social_studies_specialist_diagnose",
    "social_studies_specialist_analyze_timeline",
    "social_studies_specialist_analyze_map",
    "social_studies_specialist_analyze_causality",
    "social_studies_specialist_compare_sources",
    "social_studies_specialist_interpret_demographic_chart",
    "social_studies_specialist_decide",
    "social_studies_specialist_emit_evidence",
    "social_studies_error_taxonomy_lookup",
    "social_studies_hint_ladder_next",
    "social_studies_curriculum_lookup_kp",
    "social_studies_curriculum_list_for_grade",
    "social_studies_subskill_classify",
  ],
});

export { KP_PREFIX_TO_SUBJECT };

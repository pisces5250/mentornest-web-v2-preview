// cross_subject_merge.mjs — Multi-subject merge priority logic.
//
// Phase 3 sub-session F.
//
// PURPOSE
//   When multiple subjects surface decisions in one session (e.g.
//   reading a math word problem whose instructions are in English),
//   pick the right action. Priority is fixed and explicit so that the
//   orchestrator's behaviour is deterministic and testable.
//
// PRIORITY (highest → lowest)
//   1) mastery_check
//   2) backtrack_prerequisite
//   3) drill          (phonics_drill, vocab_drill, drill_phonics, vocabulary_drill, ...)
//   4) text_prompt
//
// TIE-BREAK
//   - For mastery_check collisions: prefer the subject with LOWER
//     mastery (the one that needs verification most).
//   - For other collisions: prefer the subject whose mastery is LOWER;
//     if still tied, prefer the subject appearing earlier in
//     SUPPORTED_SUBJECTS order.
//
// All inputs are validated; unknown actions fall through to text_prompt
// priority (lowest).

import { SUPPORTED_SUBJECTS } from "./subject_v1_contract.mjs";

/**
 * Canonical action priority, highest → lowest.
 *
 * Drill is detected by prefix `drill_` or by being one of the explicit
 * variants below.
 */
export const ACTION_PRIORITY = Object.freeze([
  "mastery_check",
  "backtrack_prerequisite",
  "drill",
  "text_prompt",
]);

function isDrillAction(action) {
  if (typeof action !== "string") return false;
  if (action.startsWith("drill_")) return true;
  const DRILL_ACTIONS = new Set([
    "vocabulary_drill",
    "drill_phonics",
    "vocab_drill",
    "phonics_drill",
  ]);
  return DRILL_ACTIONS.has(action);
}

/**
 * Reduce a concrete action verb to one of the priority buckets.
 *
 * @param {string} action
 * @returns {string} one of ACTION_PRIORITY values
 */
export function bucketizeAction(action) {
  if (action === "mastery_check") return "mastery_check";
  if (action === "backtrack_prerequisite") return "backtrack_prerequisite";
  if (isDrillAction(action)) return "drill";
  return "text_prompt";
}

function priorityRank(action) {
  const bucket = bucketizeAction(action);
  return ACTION_PRIORITY.indexOf(bucket);
}

function subjectRank(subject) {
  const i = SUPPORTED_SUBJECTS.indexOf(subject);
  return i === -1 ? Number.POSITIVE_INFINITY : i;
}

function safeMastery(d) {
  if (d && typeof d.mastery === "number" && Number.isFinite(d.mastery)) return d.mastery;
  if (d && d.mastery_context && typeof d.mastery_context.mastery === "number") {
    return d.mastery_context.mastery;
  }
  return Number.POSITIVE_INFINITY; // unknown → lowest urgency
}

function safeKnowledgePoint(d) {
  if (d && typeof d.knowledge_point === "string" && d.knowledge_point.length) {
    return d.knowledge_point;
  }
  if (d && typeof d.kp === "string" && d.kp.length) {
    return d.kp;
  }
  return "";
}

/**
 * Validate a decisions array.
 *
 * @param {unknown} decisions
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateDecisions(decisions) {
  const errors = [];
  if (!Array.isArray(decisions)) {
    return { valid: false, errors: ["decisions_not_array"] };
  }
  if (decisions.length === 0) {
    errors.push("decisions_empty");
  }
  decisions.forEach((d, i) => {
    if (!d || typeof d !== "object") {
      errors.push(`decisions[${i}]_not_object`);
      return;
    }
    if (typeof d.subject !== "string" || d.subject.length === 0) {
      errors.push(`decisions[${i}].subject_missing`);
    }
    if (typeof d.action !== "string" || d.action.length === 0) {
      errors.push(`decisions[${i}].action_missing`);
    }
  });
  return { valid: errors.length === 0, errors };
}

/**
 * Merge multiple subject decisions into one chosen action.
 *
 * Pure; no I/O.
 *
 * @param {{decisions: Array, student_id: string}} input
 * @returns {{action: string, chosen_subject: string, rationale: string, ranked: Array, student_id: string}}
 */
export function mergeCrossSubjectDecisions(input) {
  if (!input || typeof input !== "object") throw new Error("mergeCrossSubjectDecisions: input required");
  const student_id = typeof input.student_id === "string" ? input.student_id : "";

  const validation = validateDecisions(input.decisions);
  if (!validation.valid) {
    return {
      action: "text_prompt",
      chosen_subject: "",
      rationale: `invalid_decisions: ${validation.errors.join(",")}`,
      ranked: [],
      student_id,
      errors: validation.errors,
    };
  }

  const ranked = [...input.decisions].map((d) => ({
    subject: d.subject,
    action: d.action,
    mastery: safeMastery(d),
    knowledge_point: safeKnowledgePoint(d),
    bucket: bucketizeAction(d.action),
    rank: priorityRank(d.action),
  }));

  // Sort by:
  //   1) priority rank ascending (highest priority first)
  //   2) mastery ascending (lower mastery first)
  //   3) SUPPORTED_SUBJECTS order (earlier first)
  ranked.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.mastery !== b.mastery) return a.mastery - b.mastery;
    return subjectRank(a.subject) - subjectRank(b.subject);
  });

  const winner = ranked[0];

  let rationale;
  if (ranked.length === 1) {
    rationale = `only one subject decision: ${winner.subject}/${winner.action} (bucket=${winner.bucket})`;
  } else {
    rationale = `priority=${ACTION_PRIORITY[winner.rank]} picks ${winner.subject}/${winner.action}; ` +
      `considered ${ranked.length} subject decisions, mastery=${winner.mastery}`;
  }

  return {
    action: winner.action,
    chosen_subject: winner.subject,
    rationale,
    ranked,
    student_id,
  };
}

/**
 * Convenience: merge after dispatching two (or more) subjects.
 * Each item is the output of dispatchSubjectSpecialist. Returns the
 * same shape as mergeCrossSubjectDecisions but pulls action+subject
 * from the SubjectSpecialistResponse.
 *
 * @param {{responses: Array<SubjectSpecialistResponse>, student_id: string}} input
 * @returns {object}
 */
export function mergeFromResponses(input) {
  if (!input || !Array.isArray(input.responses)) {
    throw new Error("mergeFromResponses: responses[] required");
  }
  const decisions = input.responses
    .filter((r) => r && r.subject && r.next_action)
    .map((r) => ({
      subject: r.subject,
      action: r.next_action,
      mastery:
        r.diagnosis_payload && typeof r.diagnosis_payload.mastery === "number"
          ? r.diagnosis_payload.mastery
          : Number.POSITIVE_INFINITY,
      knowledge_point: r.knowledge_point || "",
    }));
  return mergeCrossSubjectDecisions({
    decisions,
    student_id: input.student_id || "",
  });
}

// src/session/session-state.mjs
//
// Phase 5C-1 — Pure state machine for a child learning session.
//
// Owns:
//   - current step (one question at a time)
//   - per-step attempts (verdict + hint_level)
//   - adaptive policy selection
//   - session-level summary (KP coverage, hint usage, first-attempt correctness)
//
// This file is intentionally pure / framework-free so it can be exercised
// by node:test directly (mirror pattern, same as keypad-state.mjs).
//
// MUST stay in lock-step with src/session/SessionView.tsx.
//
// All learning/mastery/question/voice authority lives in
// plugins/mentornest-learning/.  This file ONLY describes the UI state
// transition; the writes happen via the plugin (recordAttempt /
// updateMasteryFromEvidence / appendEvidence / school_progress write).
//
// Action kinds:
//   start({ student_id, age_band, steps })           -> session
//   advance({ verdict, hint_level, error_type })     -> next step OR completion
//   hint_used({ level })                              -> record hint use on current step
//   representation_switch({ to })                    -> record representation switch
//   retry()                                           -> reset current step's attempts
//   resume({ session_state })                         -> reload from saved snapshot
//   finish()                                          -> mark session done, emit summary
//   error({ reason })                                 -> error/retry state

export const STEP_VERDICT = Object.freeze({
  CORRECT: "correct",
  INCORRECT: "incorrect",
  UNVERIFIABLE: "unverifiable",
});

export const STEP_PHASE = Object.freeze({
  PRESENTING: "presenting",        // question shown, awaiting answer
  EVALUATING: "evaluating",        // 等候 Tutor 的權威判斷
  HINT_LEVEL_1: "hint_level_1",    // conceptual nudge
  HINT_LEVEL_2: "hint_level_2",    // visual representation
  HINT_LEVEL_3: "hint_level_3",    // intermediate structure
  FEEDBACK: "feedback",            // verdict shown, awaiting "next" / "retry"
  COMPLETED: "completed",          // step finished
});

export const SESSION_STATUS = Object.freeze({
  ACTIVE: "active",
  COMPLETED: "completed",
  ERROR: "error",
});

/**
 * Adaptive policy.
 *
 * Inputs:
 *   - attempts_so_far (number of submissions this step, excluding the
 *     current one if not yet submitted)
 *   - last_verdict ("correct" | "incorrect" | "unverifiable")
 *   - hints_used (number of hints requested this step)
 *   - kp_history (array of {kp, verdict} from earlier steps in this session)
 *
 * Returns a Phase.
 *
 * Rule order (locked in Phase 5C plan):
 *   1. correct → FEEDBACK (advance available)
 *   2. unverifiable → FEEDBACK (advance available; counted as a partial attempt)
 *   3. incorrect + 0 hints → HINT_LEVEL_1 (conceptual nudge)
 *   4. incorrect + 1 hint → HINT_LEVEL_2 (visual representation)
 *   5. incorrect + 2+ hints → HINT_LEVEL_3 (intermediate structure)
 *   6. incorrect + 3 attempts → FEEDBACK (give up; advance; flag as weak KP)
 *
 * Caps at HINT_LEVEL_3.  Never reveals the final answer immediately.
 */
export function nextPhase({ last_verdict, hints_used = 0, attempts_so_far = 0 } = {}) {
  if (last_verdict === STEP_VERDICT.CORRECT) return STEP_PHASE.FEEDBACK;
  if (last_verdict === STEP_VERDICT.UNVERIFIABLE) return STEP_PHASE.FEEDBACK;
  if (last_verdict !== STEP_VERDICT.INCORRECT) return STEP_PHASE.PRESENTING;
  // incorrect path:
  if (hints_used >= 2) return STEP_PHASE.HINT_LEVEL_3;
  if (hints_used === 1) return STEP_PHASE.HINT_LEVEL_2;
  return STEP_PHASE.HINT_LEVEL_1;
}

/**
 * Whether the current step should advance to the next question, given
 * the user's "next" gesture while in FEEDBACK phase.
 */
export function shouldAdvance({ phase, verdict }) {
  return phase === STEP_PHASE.FEEDBACK &&
    (verdict === STEP_VERDICT.CORRECT || verdict === STEP_VERDICT.UNVERIFIABLE);
}

/**
 * Build a fresh session.  Steps arrive pre-shaped from Learning Director /
 * verified_bank_lookup.
 *
 * Each step has:
 *   {
 *     step_id: string,
 *     knowledge_point: string,
 *     subject: string,
 *     question_type: "multiple_choice" | "short_answer" | "true_false" | "fraction_input" | "integer_input" | "decimal_input",
 *     representation_type: "text" | "fraction_bar" | "number_line" | "area_model",
 *     stem: string,
 *     choices?: string[],
 *     difficulty: "easy" | "medium" | "hard",
 *     source: "verified" | "generated",
 *     license: string,            // for parent/admin view ONLY; never surface to child
 *   }
 */
export function sessionInitial({ student_id, age_band, steps, session_id = null } = {}) {
  if (!student_id || typeof student_id !== "string") {
    throw new Error("sessionInitial: student_id required");
  }
  // Test/automation student IDs MUST be prefixed student_t_ so production
  // student IDs (student_001, student_002, ...) cannot leak in by accident.
  if (!/^student_[A-Za-z0-9_-]+$/.test(student_id)) {
    throw new Error(`sessionInitial: invalid student_id format "${student_id}"`);
  }
  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error("sessionInitial: at least one step required");
  }
  return {
    session_id: session_id || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    student_id,
    age_band,
    status: SESSION_STATUS.ACTIVE,
    current_index: 0,
    steps: steps.map((s) => ({ ...s, attempts: [], hints_used: 0, representation_switches: 0, last_verdict: null, phase: STEP_PHASE.PRESENTING })),
    summary: null,
    started_at: new Date().toISOString(),
    finished_at: null,
    error: null,
  };
}

function updateCurrentStep(state, mutator) {
  const idx = state.current_index;
  const next = state.steps.slice();
  next[idx] = mutator(next[idx]);
  return { ...state, steps: next };
}

export function sessionReduce(state, action) {
  if (!state) return state;
  switch (action.type) {
    case "evaluating": {
      return updateCurrentStep(state, (s) => ({ ...s, phase: STEP_PHASE.EVALUATING }));
    }
    case "submit": {
      // Record an attempt; advance phase via adaptive policy.
      const idx = state.current_index;
      const step = state.steps[idx];
      const nextPhase = (function () {
        if (action.verdict === STEP_VERDICT.CORRECT) return STEP_PHASE.FEEDBACK;
        if (action.verdict === STEP_VERDICT.UNVERIFIABLE) return STEP_PHASE.FEEDBACK;
        if (step.hints_used >= 2) return STEP_PHASE.HINT_LEVEL_3;
        if (step.hints_used === 1) return STEP_PHASE.HINT_LEVEL_2;
        return STEP_PHASE.HINT_LEVEL_1;
      })();
      const recorded = updateCurrentStep(state, (s) => ({
        ...s,
        attempts: [...s.attempts, {
          verdict: action.verdict,
          error_type: action.error_type ?? null,
          assessment_evidence_id: action.assessment_evidence_id ?? null,
          learning_memory_receipt_id: action.learning_memory_receipt_id ?? null,
          submitted_at: new Date().toISOString(),
        }],
        last_verdict: action.verdict,
        phase: nextPhase,
      }));
      if (!action.next_step || typeof action.next_step !== "object") return recorded;
      const raw = action.next_step;
      const nextStep = {
        ...raw,
        step_id: raw.step_id || raw.id,
        question_type: raw.question_type || raw.type,
        attempts: [], hints_used: 0, representation_switches: 0,
        last_verdict: null, phase: STEP_PHASE.PRESENTING,
      };
      if (!nextStep.step_id || !nextStep.question_type) return recorded;
      const steps = recorded.steps.slice(0, idx + 1);
      // English Specialist 的朗讀 → 即時對話是同一個教學橋接，不是一般
      // 預排練習題。Director 的下一題接在對話後，不能把對話入口覆蓋掉。
      const scheduledConversation = recorded.steps[idx + 1];
      if (step.question_type === "voice_response"
        && scheduledConversation?.subject === "english"
        && scheduledConversation?.question_type === "english_conversation"
        && scheduledConversation.step_id !== nextStep.step_id) {
        steps.push(scheduledConversation);
      }
      steps.push(nextStep);
      return { ...recorded, steps };
    }
    case "hint": {
      return updateCurrentStep(state, (s) => ({
        ...s,
        hints_used: s.hints_used + 1,
        // Recompute phase given new hint count + last verdict.
        phase: nextPhase({ last_verdict: s.last_verdict, hints_used: s.hints_used + 1, attempts_so_far: s.attempts.length }),
      }));
    }
    case "representation_switch": {
      return updateCurrentStep(state, (s) => ({
        ...s,
        representation_switches: s.representation_switches + 1,
        representation_type: action.to,
      }));
    }
    case "retry": {
      // 再答只重設輸入狀態；既有嘗試是 Assessment evidence，不可刪除。
      return updateCurrentStep(state, (s) => ({
        ...s,
        last_verdict: null,
        phase: STEP_PHASE.PRESENTING,
      }));
    }
    case "advance": {
      // Move to next step OR finish session.
      const nextIdx = state.current_index + 1;
      if (nextIdx >= state.steps.length) {
        return {
          ...state,
          status: SESSION_STATUS.COMPLETED,
          finished_at: new Date().toISOString(),
          summary: buildSummary(state),
        };
      }
      return { ...state, current_index: nextIdx };
    }
    case "resume": {
      // Replace state with a saved snapshot (validated by caller).
      if (!action.snapshot || typeof action.snapshot !== "object") return state;
      return action.snapshot;
    }
    case "error": {
      return {
        ...state,
        status: SESSION_STATUS.ERROR,
        error: { reason: action.reason, at: new Date().toISOString() },
      };
    }
  }
  return state;
}

/**
 * Build the session summary that goes to learning record + parent view.
 *
 * Returns:
 *   {
 *     total_steps,
 *     completed_steps,
 *     first_attempt_correct,
 *     hints_used_total,
 *     representation_switches_total,
 *     kp_attempted: [{ kp, attempts, hints_used, first_verdict, final_verdict, source }],
 *     weak_kps: [<kp ids where final_verdict was incorrect OR 3+ attempts>],
 *     mastery_candidate_kps: [<kp ids where first_attempt_correct>],
 *     mastered_kps: deprecated non-authoritative alias,
 *     duration_seconds,
 *   }
 */
export function buildSummary(state) {
  const started = new Date(state.started_at).getTime();
  const finished = new Date(state.finished_at ?? new Date().toISOString()).getTime();
  const kpMap = new Map();
  let firstAttemptCorrect = 0;
  let hintsTotal = 0;
  let switchesTotal = 0;
  let completed = 0;
  for (const s of state.steps) {
    hintsTotal += s.hints_used;
    switchesTotal += s.representation_switches;
    if (s.attempts.length > 0) completed += 1;
    const first = s.attempts[0] ?? null;
    if (first?.verdict === STEP_VERDICT.CORRECT) firstAttemptCorrect += 1;
    const finalVerdict = s.last_verdict;
    const entry = kpMap.get(s.knowledge_point) ?? {
      kp: s.knowledge_point,
      subject: s.subject,
      attempts: 0,
      hints_used: 0,
      first_verdict: null,
      final_verdict: null,
      source: s.source,
    };
    entry.attempts += s.attempts.length;
    entry.hints_used += s.hints_used;
    if (!entry.first_verdict && first) entry.first_verdict = first.verdict;
    entry.final_verdict = finalVerdict;
    entry.source = s.source;
    kpMap.set(s.knowledge_point, entry);
  }
  const kps = Array.from(kpMap.values());
  const masteryCandidateKps = kps
    .filter((k) => k.first_verdict === STEP_VERDICT.CORRECT)
    .map((k) => k.kp);
  return {
    total_steps: state.steps.length,
    completed_steps: completed,
    first_attempt_correct: firstAttemptCorrect,
    hints_used_total: hintsTotal,
    representation_switches_total: switchesTotal,
    kp_attempted: kps,
    weak_kps: kps.filter((k) => k.final_verdict === STEP_VERDICT.INCORRECT || k.attempts >= 3).map((k) => k.kp),
    mastery_candidate_kps: masteryCandidateKps,
    // 相容欄位：不得視為正式 mastery；正式判定只能來自 Assessment/Mastery authority。
    mastered_kps: masteryCandidateKps,
    duration_seconds: Math.max(0, Math.round((finished - started) / 1000)),
  };
}

/**
 * Determine the recommended next learning action from a finished session.
 *
 * Inputs: session summary.
 * Returns: { recommended_next_action, recommended_kps, reason }
 *
 * Rule (locked in Phase 5C plan):
 *   - if any weak_kps → "targeted_practice" with those KPs
 *   - else if mastery candidates and no remaining weak → "advance" (next KP in curriculum)
 *   - else → "continue" (mix of new + reinforcement)
 *
 * NOTE: this is a *recommendation only*.  The Learning Director decides the
 * actual next action; this helper gives the parent view a useful sentence.
 */
export function recommendNext(summary) {
  if (!summary) return { recommended_next_action: "none", recommended_kps: [], reason: "no-summary" };
  if (summary.weak_kps.length > 0) {
    return {
      recommended_next_action: "targeted_practice",
      recommended_kps: summary.weak_kps,
      reason: `${summary.weak_kps.length} 個知識點這次沒有掌握，下一輪可以多做一點相關練習。`,
    };
  }
  const masteryCandidates = summary.mastery_candidate_kps ?? summary.mastered_kps ?? [];
  if (masteryCandidates.length > 0 && summary.total_steps > 0) {
    return {
      recommended_next_action: "advance",
      recommended_kps: [],
      reason: `這次 ${masteryCandidates.length} 個知識點一次就答對，可以往下一個新主題前進。`,
    };
  }
  return {
    recommended_next_action: "continue",
    recommended_kps: [],
    reason: "維持目前節奏，繼續練習相似的題目。",
  };
}

export const __TEST__ = Object.freeze({
  nextPhase, shouldAdvance, sessionInitial, sessionReduce, buildSummary, recommendNext,
  STEP_VERDICT, STEP_PHASE, SESSION_STATUS,
});

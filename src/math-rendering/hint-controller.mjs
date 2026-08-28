// src/math-rendering/hint-controller.mjs
//
// Phase 5B — Hint escalation controller for the G5 FRAC add-unlike-denom flow.
//
// Wraps plugins/mentornest-learning/lib/math_hint_ladder_v2.mjs to produce
// a `hint_state` that the vertical slice can render.
//
// Rules (per user constraint):
//   - first wrong answer → short conceptual hint (level 1, text only, NO SVG)
//   - repeated wrong answer → show fraction-bar SVG (level 2)
//   - later hint may show intermediate structure (level 3)
//   - Hint must NOT reveal final answer immediately (level 4 is reserved for
//     a tutor/parent escalation, not for in-flow auto-display).

import { nextMathHint } from "../../../../plugins/mentornest-learning/lib/math_hint_ladder_v2.mjs";

export const HINT_STAGES = Object.freeze({
  TEXT_ONLY: "text_only",
  FRACTION_BAR: "fraction_bar",
  INTERMEDIATE_STRUCTURE: "intermediate_structure",
  RESERVED: "reserved",   // not auto-shown; reserved for tutor / parent
});

const STAGE_BY_LEVEL = {
  1: HINT_STAGES.TEXT_ONLY,
  2: HINT_STAGES.FRACTION_BAR,
  3: HINT_STAGES.INTERMEDIATE_STRUCTURE,
  4: HINT_STAGES.RESERVED,
};

/**
 * Decide the next hint given the current attempt history.
 *
 * @param {object} input
 * @param {string} input.knowledge_point
 * @param {number} input.wrong_attempts
 * @param {number} input.hints_already_shown
 * @param {"symbolic"|"concrete"|"visual"} [input.representation_used]
 * @param {string} [input.error_type]
 * @returns {{
 *   stage: string,
 *   level: number,
 *   hint_text_zh: string,
 *   show_fraction_bar: boolean,
 *   show_intermediate_structure: boolean,
 *   reveal_final_answer: false,
 *   reason: string,
 * }}
 */
export function nextHintStage(input) {
  const wrongAttempts = input.wrong_attempts ?? 0;
  const hintsShown = input.hints_already_shown ?? 0;

  // Level selection (independent of LLM).
  // First wrong → level 1.
  // Second wrong → level 2 (introduce SVG).
  // Third+ wrong → level 3 (intermediate structure).
  // Level 4 reserved.
  let level;
  if (wrongAttempts === 0) level = 0;
  else if (wrongAttempts === 1) level = 1;
  else if (wrongAttempts === 2) level = 2;
  else if (wrongAttempts === 3) level = 3;
  else level = 3; // capped

  // Delegate to math_hint_ladder_v2 for hint text + reasoning.
  // The ladder's `attempts` is the attempt count (1-indexed for the
  // current attempt).  We pass wrongAttempts directly: 1 wrong attempt →
  // level 1 nudge.
  const ladder = nextMathHint({
    student_id: "t_phase5b_student",  // fake id; never real PII
    subject: "math",
    knowledge_point: input.knowledge_point,
    attempts: wrongAttempts,
    hints_given: hintsShown,
    representation_used: input.representation_used ?? "symbolic",
    error_type: input.error_type ?? null,
  });

  // Defensive: never show level 4 in-flow.
  const finalLevel = Math.min(level, 3);

  return {
    stage: STAGE_BY_LEVEL[finalLevel] ?? HINT_STAGES.TEXT_ONLY,
    level: finalLevel,
    hint_text_zh: ladder.hint_text_zh,
    show_fraction_bar: finalLevel >= 2,
    show_intermediate_structure: finalLevel >= 3,
    reveal_final_answer: false,
    reason: ladder.reason,
  };
}

export const __TEST__ = { HINT_STAGES, STAGE_BY_LEVEL, nextHintStage };

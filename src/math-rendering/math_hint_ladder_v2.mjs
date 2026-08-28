// src/math-rendering/math_hint_ladder_v2.mjs
//
// ════════════════════════════════════════════════════════════════════════════
// PREVIEW COMPATIBILITY IMPLEMENTATION
// ════════════════════════════════════════════════════════════════════════════
//
// Standalone re-implementation of the deterministic math hint-ladder hint
// text generator used by the production mentornest-learning plugin.
//
// SCOPE:
//   - nextMathHint({ student_id, subject, knowledge_point, attempts,
//                    hints_given, representation_used, error_type })
//     → { hint_text_zh, level, reason }
//
// DESIGN INVARIANT:
//   - Level 0: no hint.
//   - Level 1 (after first wrong): conceptual nudge (zh-TW).
//   - Level 2 (after second wrong): visual representation suggestion.
//   - Level 3 (after third+ wrong): intermediate structure suggestion.
//   - Level 4 RESERVED — never auto-shown in-flow (tutor/parent only).
//
//   Hint text is keyed by knowledge_point so different KPs can produce
//   subject-appropriate nudges. The KP → hint map below covers the Phase 5
//   KPs used by the vertical slice + QuestionRenderer. Unknown KPs fall
//   back to a generic zh-TW nudge.
//
// Production math_hint_ladder_v2 remains AUTHORITATIVE for production.
// This file is preview-only and must be kept in sync when KP material
// expands.

const KP_HINTS = {
  "math.G5.FRAC.add-unlike-denom": {
    1: "先把兩個分母找最小公倍數。",
    2: "試著畫成分數長條,再看看哪幾格會重疊。",
    3: "通分之後,把兩個分子的數字直接相加。",
  },
  "math.G3.MULT.two-digit": {
    1: "想想兩位數乘一位數可以怎麼拆解。",
    2: "把十位和個位分開算,最後再加起來。",
    3: "20 × 4 等於 80,3 × 4 等於 12,合起來是多少?",
  },
  "math.G4.DIV.estimate": {
    1: "估算除法的時候,可以先想大概的範圍。",
    2: "12 的倍數有哪些?從裡面找最接近 144 的。",
    3: "12 × 10 = 120,還差 24;12 × 2 = 24,所以答案是 12。",
  },
  "math.G5.DEC.add": {
    1: "小數相加時,記得對齊小數點。",
    2: "把 0.5 想成 0.50,再加 0.25 就好算了。",
    3: "50 + 25 = 75,所以答案是 0.75。",
  },
};

const GENERIC_HINTS = {
  1: "再想想看,題目給的條件你都用了嗎?",
  2: "試著把題目用圖示畫出來,說不定會更清楚。",
  3: "把每一步拆開算,一步一步檢查。",
};

const LEVEL_REASON = {
  0: "no-hint-needed",
  1: "first-wrong-conceptual-nudge",
  2: "second-wrong-visual-representation",
  3: "third-wrong-intermediate-structure",
  4: "reserved-tutor-parent",
};

/**
 * Compute next math hint level + zh-TW hint text.
 *
 * @param {object} input
 * @returns {{ hint_text_zh: string, level: number, reason: string }}
 */
export function nextMathHint(input = {}) {
  const kp = input.knowledge_point ?? "";
  const wrongAttempts = Math.max(0, Number(input.attempts ?? 0));
  const hintsAlreadyShown = Math.max(0, Number(input.hints_given ?? 0));

  // First-attempt-correct path: no hint.
  if (wrongAttempts === 0 && hintsAlreadyShown === 0) {
    return { hint_text_zh: "", level: 0, reason: "no-attempt-yet" };
  }

  // Level selection — independent of LLM.
  let level;
  if (hintsAlreadyShown === 0 && wrongAttempts <= 1) level = 1;
  else if (hintsAlreadyShown === 1 || wrongAttempts === 2) level = 2;
  else if (hintsAlreadyShown >= 2 || wrongAttempts >= 3) level = 3;
  else level = 1;

  // Clamp at 3 — level 4 is reserved for tutor/parent escalation.
  if (level > 3) level = 3;

  const map = KP_HINTS[kp] ?? GENERIC_HINTS;
  const hint_text_zh = map[level] ?? GENERIC_HINTS[level] ?? "";

  return {
    hint_text_zh,
    level,
    reason: LEVEL_REASON[level] ?? "fallback",
  };
}

export const __TEST__ = { nextMathHint, KP_HINTS, GENERIC_HINTS, LEVEL_REASON };

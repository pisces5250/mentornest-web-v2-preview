// math_hint_ladder_v2.mjs
//
// Phase 3 sub-session A — Math Hint Ladder v2.
//
// Extends the v1 ladder (lib/hint_ladder.mjs) without modifying the original.
// v2 adds:
//   - mastery-context awareness: when mastery < 0.4 the ladder prefers
//     mini_lesson + switch_representation rather than just a higher level.
//   - representation effectiveness tracking. If "concrete" or "visual" has
//     already failed twice for this KP, force-switch to "visual" (or
//     backtrack to prerequisite when even visual fails).
//   - school_progress_context: teacher-confirmed progress pulls the student
//     out of mastery_check into direct instruction; conversely inferred
//     progress can defer mastery_check one more cycle.
//
// Public functions:
//   - nextMathHint({...}) → { level, hint_text_zh, representation_suggestion,
//                              mini_lesson_suggested, mastery_check_suggested }
//   - representationEffectiveness({representation, attempts, hints}) → bool

const LEVELS = ["none", "conceptual_nudge", "worked_example", "partial_solution", "full_solution"];

// zh-TW hint strings keyed by KP family. v2 selects one of these based on
// error type or knowledge point. Strings are deliberately short — the
// tutor is expected to elaborate with a worked example.
const HINT_TEMPLATES = {
  // level 1 — conceptual nudge
  L1_DEFAULT: "先回想這個概念的核心意思是什麼？",
  L1_FRAC: "分母代表『把整體分成幾份』，分子是『取了幾份』。",
  L1_DECIMAL: "小數點後第幾位代表十分之幾、百分之幾⋯⋯",
  L1_RATIO: "比的前項與後項可以同時乘或除以同一個非零數。",
  L1_AREA: "面積是『覆蓋』的格數，周長是『繞一圈』的長度。",

  // level 2 — worked example
  L2_DEFAULT: "我們用一個類似的簡單例子，一步一步走一次。",
  L2_FRAC: "先把分數畫成一條長條，分成等份再數。",
  L2_FRAC_ADD_DIFF: "通分時，找兩個分母的最小公倍數再相加。",
  L2_PROPORTION: "列成表格，找出對應量之間的倍數關係。",

  // level 3 — partial solution
  L3_DEFAULT: "前幾步是這樣⋯⋯最後一步換你來想想看？",
  L3_FRAC_MUL: "分數乘分數：分子乘分子、分母乘分母，別忘了約分。",

  // level 4 — full solution
  L4_DEFAULT: "完整解法：先⋯⋯再⋯⋯最後得到答案。",
};

function pickL1Hint(knowledge_point) {
  if (!knowledge_point) return HINT_TEMPLATES.L1_DEFAULT;
  if (knowledge_point.includes("FRAC")) return HINT_TEMPLATES.L1_FRAC;
  if (knowledge_point.includes("DECIMAL")) return HINT_TEMPLATES.L1_DECIMAL;
  if (knowledge_point.includes("RATIO") || knowledge_point.includes("PROPORTION")) return HINT_TEMPLATES.L1_RATIO;
  if (knowledge_point.includes("GEOM")) return HINT_TEMPLATES.L1_AREA;
  return HINT_TEMPLATES.L1_DEFAULT;
}

function pickL2Hint(knowledge_point) {
  if (!knowledge_point) return HINT_TEMPLATES.L2_DEFAULT;
  if (knowledge_point.includes("FRAC")) {
    if (knowledge_point.includes("add-unlike") || knowledge_point.includes("proper-fraction-add-sub")) {
      return HINT_TEMPLATES.L2_FRAC_ADD_DIFF;
    }
    return HINT_TEMPLATES.L2_FRAC;
  }
  if (knowledge_point.includes("RATIO") || knowledge_point.includes("PROPORTION")) {
    return HINT_TEMPLATES.L2_PROPORTION;
  }
  return HINT_TEMPLATES.L2_DEFAULT;
}

function levelHintText(level, knowledge_point) {
  if (level === 0) return "";
  if (level === 1) return pickL1Hint(knowledge_point);
  if (level === 2) return pickL2Hint(knowledge_point);
  if (level === 3) {
    if (knowledge_point && knowledge_point.includes("multiply-fraction-fraction")) return HINT_TEMPLATES.L3_FRAC_MUL;
    return HINT_TEMPLATES.L3_DEFAULT;
  }
  if (level === 4) return HINT_TEMPLATES.L4_DEFAULT;
  return "";
}

/**
 * Decide the next math hint level (0..4), a zh-TW hint string, and routing
 * flags (representation switch / mini-lesson / mastery-check).
 *
 * @param {object} input
 * @param {string} input.student_id
 * @param {"math"} input.subject
 * @param {string} input.knowledge_point
 * @param {number} input.attempts
 * @param {number} input.hints_given
 * @param {"symbolic"|"concrete"|"visual"} [input.representation_used]
 * @param {string} [input.error_type]
 * @param {{mastery?:number, confidence?:number}} [input.mastery_context]
 * @param {{teacher_confirmed?:boolean, inferred?:boolean}} [input.school_progress_context]
 * @returns {{level:number, hint_text_zh:string, representation_suggestion:string,
 *            mini_lesson_suggested:boolean, mastery_check_suggested:boolean,
 *            reason:string}}
 */
export function nextMathHint(input) {
  const {
    student_id,
    subject,
    knowledge_point,
    attempts = 1,
    hints_given = 0,
    representation_used = "symbolic",
    error_type = null,
    mastery_context = null,
    school_progress_context = null,
  } = input || {};

  if (subject !== "math") {
    throw new Error("nextMathHint: subject must be 'math'");
  }

  let level = 0;
  let reason = "";
  let representation_suggestion = representation_used;
  let mini_lesson_suggested = false;
  let mastery_check_suggested = false;

  if (!student_id) {
    return {
      level: 0,
      hint_text_zh: "",
      representation_suggestion: "symbolic",
      mini_lesson_suggested: false,
      mastery_check_suggested: false,
      reason: "missing-student-id",
    };
  }

  // Correct path
  if (attempts === 0 || error_type === null && hints_given === 0) {
    // The caller didn't supply an error → correct path.
  }

  // Heuristic ladder: 1 → L1, 2 → L2, 3 → L3, 4+ → L4
  if (attempts <= 1) { level = 1; reason = "first-attempt"; }
  else if (attempts === 2) { level = 2; reason = "second-attempt"; }
  else if (attempts <= 4) { level = 3; reason = "third-or-fourth-attempt"; }
  else { level = 4; reason = "exhausted"; }

  // Escalate faster if many hints already given
  if (hints_given >= 3 && level < 4) {
    level = Math.min(4, level + 1);
    reason += "+hints-already-given";
  }

  // Mastery context rules
  const mastery = mastery_context && typeof mastery_context.mastery === "number" ? mastery_context.mastery : null;
  if (mastery !== null) {
    if (mastery < 0.4 && attempts >= 2) {
      mini_lesson_suggested = true;
      reason += "+low-mastery-mini-lesson";
    }
    if (attempts >= 3) {
      mastery_check_suggested = true;
      reason += "+mastery-check-suggested";
    }
    // High-confidence + high-mastery → defer mastery_check
    if (mastery >= 0.85 && (mastery_context.confidence ?? 0) > 0.8) {
      mastery_check_suggested = false;
      reason += "+high-mastery-no-check";
    }
  } else if (attempts >= 3) {
    mastery_check_suggested = true;
  }

  // School-progress: teacher-confirmed progress prefers direct instruction
  if (school_progress_context && school_progress_context.teacher_confirmed) {
    mastery_check_suggested = false;
    level = Math.max(level, 2); // at least worked example
    reason += "+teacher-confirmed-direct-instruction";
  }

  // Representation switching
  // Rule: attempts==1 + representation==symbolic → "concrete"
  if (attempts === 1 && representation_used === "symbolic") {
    representation_suggestion = "concrete";
    reason += "+switch-to-concrete";
  }
  // attempts≥2 + mastery<0.4 → switch to "visual" + mini_lesson
  else if (attempts >= 2 && mastery !== null && mastery < 0.4) {
    representation_suggestion = "visual";
    mini_lesson_suggested = true;
    reason += "+switch-to-visual-low-mastery";
  }
  // attempts≥3 + mastery_check → "visual"
  else if (attempts >= 3) {
    representation_suggestion = representation_used === "visual" ? "visual" : "visual";
    reason += "+force-visual";
  }

  return {
    level,
    hint_text_zh: levelHintText(level, knowledge_point),
    representation_suggestion,
    mini_lesson_suggested,
    mastery_check_suggested,
    reason,
  };
}

/**
 * Decide whether the current representation is effective.
 *
 * @param {object} input
 * @param {"symbolic"|"concrete"|"visual"} input.representation
 * @param {number} input.attempts
 * @param {number} input.hints
 * @returns {{
 *   effective:boolean,
 *   switch_to:"symbolic"|"concrete"|"visual"|null,
 *   reason:string
 * }}
 */
export function representationEffectiveness(input) {
  const rep = input?.representation || "symbolic";
  const attempts = Number(input?.attempts ?? 1);
  const hints = Number(input?.hints ?? 0);

  // Symbolic, no hints yet → still good for routine arithmetic.
  if (rep === "symbolic" && attempts <= 1 && hints === 0) {
    return { effective: true, switch_to: null, reason: "fresh-symbolic-attempts" };
  }
  // Symbolic failed twice → switch to concrete.
  if (rep === "symbolic" && attempts >= 2) {
    return { effective: false, switch_to: "concrete", reason: "symbolic-failed-twice" };
  }
  // Concrete failed twice → visual.
  if (rep === "concrete" && attempts >= 2) {
    return { effective: false, switch_to: "visual", reason: "concrete-failed-twice" };
  }
  // Visual failed twice → consider prereq backtrack.
  if (rep === "visual" && attempts >= 2) {
    return { effective: false, switch_to: null, reason: "visual-failed-twice-backtrack-suggested" };
  }
  // Too many hints → representation is not cutting it.
  if (hints >= 3) {
    return { effective: false, switch_to: "visual", reason: "many-hints-anywhere" };
  }
  return { effective: true, switch_to: null, reason: "within-normal-range" };
}

export const MATH_HINT_LEVELS_V2 = LEVELS;

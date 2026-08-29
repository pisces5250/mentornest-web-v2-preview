// Verified Question Bank coverage targets.
//
// Per 2026-08-27 product decision: AI authoring is coverage-driven, not
// cadence-driven. Every active knowledge point carries a minimum target
// matrix of (type × difficulty). coverage_report scans the verified bank,
// returns the gap set, and ai_question_authoring_orchestrator uses that
// gap set to schedule next authoring requests.
//
// V1 scope:
//   - subject ∈ {math, chinese, english, science, social_studies}
//   - grade 1..6 (curriculum map V1)
//   - type ∈ {short_answer, multiple_choice, true_false}
//   - difficulty ∈ {easy, medium, hard}
//
// Targets are NOT one-size-fits-all: each (subject, KP, difficulty) carries
// its own minimum count. Defaults:
//   - short_answer × {easy, medium, hard} → 3 each (9 per KP)
//   - multiple_choice × {easy, medium}    → 2 each (4 per KP)
//   - true_false × {easy}                 → 1 (1 per KP)
//   - math-only: short_answer × hard requires 1 (where word-problems live)
//
// Math KPs also require a `subskill_level` row to be exercised at least
// twice across the bank — but the V1 curriculum YAML doesn't expose
// subskills, so the per-KP target substitutes.

export const DIFFICULTIES = ["easy", "medium", "hard"];
export const QUESTION_TYPES = ["short_answer", "multiple_choice", "true_false"];

/**
 * The default minimum verified count per (kp, type, difficulty) cell.
 *
 * Override-able via the override argument to computeCoverageTargets().
 */
export function defaultTargetFor(subject, type, difficulty) {
  if (!DIFFICULTIES.includes(difficulty)) throw new Error(`unknown difficulty ${difficulty}`);
  if (!QUESTION_TYPES.includes(type)) throw new Error(`unknown question type ${type}`);
  if (subject === "math") {
    if (type === "short_answer") {
      return difficulty === "easy" ? 3 : difficulty === "medium" ? 3 : 2; // 8 total short_answer
    }
    if (type === "multiple_choice") {
      return difficulty === "hard" ? 1 : 2; // 2 easy, 2 medium, 1 hard
    }
    return 1; // true_false easy only
  }
  // Non-math subjects: lower target
  if (type === "short_answer") return difficulty === "easy" ? 2 : 1; // 4
  if (type === "multiple_choice") return 1;
  return 1;
}

/**
 * Expand a (subject, kp, type, difficulty) target into a flat list.
 *
 * Returns: Array<{ subject, kp, type, difficulty, target }>
 */
export function computeCoverageTargets({ subject, grade, knowledgePoint, override } = {}) {
  const typesForSubject = subject === "math"
    ? QUESTION_TYPES
    : ["multiple_choice", "short_answer"]; // non-math V1: omit true_false-heavy
  const result = [];
  for (const type of typesForSubject) {
    for (const difficulty of DIFFICULTIES) {
      const cell = { subject, kp: knowledgePoint, type, difficulty };
      let target;
      if (override && typeof override[subject]?.[knowledgePoint]?.[type]?.[difficulty] === "number") {
        target = override[subject][knowledgePoint][type][difficulty];
      } else {
        target = defaultTargetFor(subject, type, difficulty);
      }
      // Skip cells with target=0 (organizational choice)
      if (target <= 0) continue;
      result.push({ ...cell, target });
    }
  }
  return result;
}
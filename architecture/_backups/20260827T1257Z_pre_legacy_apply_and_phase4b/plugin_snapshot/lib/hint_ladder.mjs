// Math Hint Ladder v1
//
// Pure function: given an error_type, attempt count, and the representation
// already used, return the NEXT hint level. The actual hint TEXT is generated
// elsewhere (LLM) but the LEVEL is deterministic — this is the guarantee that
// two children with identical error states get identical scaffolding.
//
// Levels:
//   0  none             — no hint needed (correct or off-topic)
//   1  conceptual_nudge — "think about what '分母' means" style
//   2  worked_example   — partial worked example
//   3  partial_solution — most of the steps, missing last 1
//   4  full_solution    — full worked solution
//
// Escalation rules (math v1):
//   correct              → 0 (regardless of attempts)
//   incorrect, attempts 1 → 1 conceptual_nudge
//   incorrect, attempts 2 → 2 worked_example (different representation)
//   incorrect, attempts 3+ → 3 partial_solution
//   incorrect, attempts >=5 OR hints_already >=3 → 4 full_solution
//   representation_used "symbolic-first" and still failing → at next attempt
//                                          promote to "visual-first" representation

const LEVELS = ["none", "conceptual_nudge", "worked_example", "partial_solution", "full_solution"];

export function nextHintLevel(input) {
  const { result, error_type, attempts = 1, hints_already = 0, representation_used } = input || {};

  // Correct answer → no hint
  if (result === "correct" || result === "mastered" || result === "improved") {
    return {
      level: 0,
      level_name: "none",
      reason: "correct-answer",
      representation_recommendation: representation_used || null,
      representation_change: false,
    };
  }

  // Invalid / partial cases still get help, but not as much.
  const is_partial = result === "partially_correct";
  let level;
  let reason;

  if (attempts <= 1) {
    level = 1;
    reason = "first-attempt-conceptual-nudge";
  } else if (attempts === 2) {
    level = 2;
    reason = "second-attempt-worked-example";
  } else if (attempts <= 4) {
    level = 3;
    reason = "third-or-fourth-attempt-partial-solution";
  } else {
    level = 4;
    reason = "exhausted-attempts-full-solution";
  }

  // If a lot of hints were already given, escalate faster.
  if (hints_already >= 3 && level < 4) {
    level = Math.min(4, level + 1);
    reason += "-and-already-given-many-hints";
  }

  // If still symbolic-first and failing, recommend switching representation.
  let representation_recommendation = representation_used || null;
  let representation_change = false;
  if (representation_used === "symbolic-first" && attempts >= 2) {
    representation_recommendation = "visual-first";
    representation_change = true;
  } else if (representation_used === "concrete-first" && attempts >= 3) {
    representation_recommendation = "visual-first";
    representation_change = true;
  }

  return {
    level,
    level_name: LEVELS[level],
    reason,
    error_type: error_type || "unspecified",
    representation_recommendation,
    representation_change,
    is_partial,
  };
}

export const HINT_LEVELS = LEVELS;

// src/session/fixtures.mjs
//
// Phase 5C-1 — Test/acceptance-only fixture steps.
//
// IMPORTANT: this file is ONLY used by:
//   - browser_acceptance_phase5c1.mjs (acceptance run)
//   - any future tests that drive the session UI end-to-end
//   - the demo "Preview today" path when the verified bank is empty AND the
//     operator opts in via env var (set VITE_USE_FIXTURES=1)
//
// Production deployments MUST NOT enable fixture mode.  The fallback
// "尚無對應題目" placeholder is the correct production behavior when the
// verified bank has no matches.

export const FIXTURE_G5_FRAC = [
  {
    step_id: "fixture_mc_g3_001",
    knowledge_point: "math.G3.MULT.two-digit",
    subject: "math",
    question_type: "multiple_choice",
    representation_type: "text",
    stem: "23 × 4 = ?",
    choices: ["82", "92", "102", "112"],
    expected_answer: "92",
    difficulty: "easy",
    source: "verified",
    license: "CC0-1.0",
  },
  {
    step_id: "fixture_frac_g5_001",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    subject: "math",
    question_type: "fraction_input",
    representation_type: "fraction_bar",
    stem: "1/3 + 1/2 = ?",
    expected_answer: "5/6",
    difficulty: "medium",
    source: "verified",
    license: "CC0-1.0",
  },
  {
    step_id: "fixture_int_g4_001",
    knowledge_point: "math.G4.DIV.estimate",
    subject: "math",
    question_type: "integer_input",
    representation_type: "text",
    stem: "144 ÷ 12 = ?",
    expected_answer: "12",
    difficulty: "easy",
    source: "verified",
    license: "CC0-1.0",
  },
  {
    step_id: "fixture_dec_g5_001",
    knowledge_point: "math.G5.DEC.add",
    subject: "math",
    question_type: "decimal_input",
    representation_type: "text",
    stem: "0.5 + 0.25 = ?",
    expected_answer: "0.75",
    difficulty: "easy",
    source: "verified",
    license: "CC0-1.0",
  },
];

// Tests: math_hint_ladder_v2.mjs
// Run with: node --test test/math_hint_ladder_v2.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  nextMathHint,
  representationEffectiveness,
  MATH_HINT_LEVELS_V2,
} from "../lib/math_hint_ladder_v2.mjs";

test("MATH_HINT_LEVELS_V2 lists 5 levels", () => {
  assert.equal(MATH_HINT_LEVELS_V2.length, 5);
  assert.equal(MATH_HINT_LEVELS_V2[0], "none");
});

test("nextMathHint: attempts=1 + symbolic → concrete", () => {
  const r = nextMathHint({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G4.FRAC.proper-fraction-compare",
    attempts: 1,
    hints_given: 0,
    representation_used: "symbolic",
    error_type: "MATH-CONCEPT",
  });
  assert.equal(r.level, 1);
  assert.equal(r.representation_suggestion, "concrete");
  assert.ok(r.hint_text_zh.length > 0);
});

test("nextMathHint: attempts>=3 → mastery_check suggested", () => {
  const r = nextMathHint({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    attempts: 3,
    hints_given: 0,
    representation_used: "symbolic",
    error_type: "MATH-FRAC-ADD-DIFF",
    mastery_context: { mastery: 0.5 },
  });
  assert.ok(r.mastery_check_suggested);
});

test("nextMathHint: low mastery (<0.4) and attempts>=2 → mini_lesson + visual", () => {
  const r = nextMathHint({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G4.FRAC.proper-fraction-add-sub",
    attempts: 2,
    hints_given: 0,
    representation_used: "symbolic",
    error_type: "MATH-FRAC-ADD-DIFF",
    mastery_context: { mastery: 0.3 },
  });
  assert.ok(r.mini_lesson_suggested, "mini_lesson should be suggested");
  assert.equal(r.representation_suggestion, "visual");
});

test("nextMathHint: teacher-confirmed progress defers mastery_check", () => {
  const r = nextMathHint({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G6.FRAC.multiply-fraction-fraction",
    attempts: 3,
    hints_given: 0,
    representation_used: "visual",
    school_progress_context: { teacher_confirmed: true },
  });
  assert.equal(r.mastery_check_suggested, false);
});

test("nextMathHint: high mastery → no mastery_check", () => {
  const r = nextMathHint({
    student_id: "student_001",
    subject: "math",
    knowledge_point: "math.G6.PERCENT.intro",
    attempts: 3,
    hints_given: 0,
    representation_used: "visual",
    mastery_context: { mastery: 0.9, confidence: 0.95 },
  });
  assert.equal(r.mastery_check_suggested, false);
});

test("nextMathHint: rejects bad subject", () => {
  assert.throws(() => nextMathHint({
    student_id: "student_001",
    subject: "chinese",
    knowledge_point: "math.G6.PERCENT.intro",
    attempts: 1,
    hints_given: 0,
    representation_used: "symbolic",
  }));
});

test("representationEffectiveness: symbolic + attempts=1 → effective", () => {
  const r = representationEffectiveness({ representation: "symbolic", attempts: 1, hints: 0 });
  assert.equal(r.effective, true);
  assert.equal(r.switch_to, null);
});

test("representationEffectiveness: symbolic + attempts>=2 → switch to concrete", () => {
  const r = representationEffectiveness({ representation: "symbolic", attempts: 2, hints: 0 });
  assert.equal(r.effective, false);
  assert.equal(r.switch_to, "concrete");
});

test("representationEffectiveness: concrete failed twice → switch to visual", () => {
  const r = representationEffectiveness({ representation: "concrete", attempts: 2, hints: 1 });
  assert.equal(r.effective, false);
  assert.equal(r.switch_to, "visual");
});

test("representationEffectiveness: visual failed twice → no switch (backtrack suggested)", () => {
  const r = representationEffectiveness({ representation: "visual", attempts: 2, hints: 2 });
  assert.equal(r.effective, false);
  assert.equal(r.switch_to, null);
  assert.match(r.reason, /backtrack/);
});

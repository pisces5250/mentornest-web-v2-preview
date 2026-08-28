// test/math-rendering/hint_controller.test.mjs
//
// Phase 5B — Hint escalation controller tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextHintStage, HINT_STAGES } from "../../src/math-rendering/hint-controller.mjs";

test("hint: 0 wrong → no hint (level 0)", () => {
  // nextHintStage requires wrong_attempts >= 1 to advance.
  // We test the boundary: with wrong_attempts=0, the controller returns level 0.
  const r = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 0,
    hints_already_shown: 0,
  });
  assert.equal(r.level, 0);
});

test("hint: first wrong → level 1, text-only (no fraction_bar)", () => {
  const r = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 1,
    hints_already_shown: 0,
  });
  assert.equal(r.level, 1);
  assert.equal(r.stage, HINT_STAGES.TEXT_ONLY);
  assert.equal(r.show_fraction_bar, false);
  assert.equal(r.show_intermediate_structure, false);
  assert.equal(r.reveal_final_answer, false);
  // Hint text MUST be conceptual, not the answer.
  assert.ok(!r.hint_text_zh.includes("5/6"));
  assert.ok(!r.hint_text_zh.includes("5"));
  assert.ok(!r.hint_text_zh.includes("6"));
});

test("hint: second wrong → level 2, fraction_bar appears", () => {
  const r = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 2,
    hints_already_shown: 1,
  });
  assert.equal(r.level, 2);
  assert.equal(r.stage, HINT_STAGES.FRACTION_BAR);
  assert.equal(r.show_fraction_bar, true);
  assert.equal(r.reveal_final_answer, false);
});

test("hint: third wrong → level 3, intermediate structure", () => {
  const r = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 3,
    hints_already_shown: 2,
  });
  assert.equal(r.level, 3);
  assert.equal(r.stage, HINT_STAGES.INTERMEDIATE_STRUCTURE);
  assert.equal(r.show_fraction_bar, true);
  assert.equal(r.show_intermediate_structure, true);
  assert.equal(r.reveal_final_answer, false);
});

test("hint: 4th wrong → still level 3 (capped, no level 4 reveal)", () => {
  const r = nextHintStage({
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
    wrong_attempts: 5,
    hints_already_shown: 4,
  });
  assert.equal(r.level, 3);
  assert.equal(r.reveal_final_answer, false);
});

test("hint: never reveal_final_answer, even at high attempt counts", () => {
  for (let i = 0; i < 10; i++) {
    const r = nextHintStage({
      knowledge_point: "math.G5.FRAC.add-unlike-denom",
      wrong_attempts: i,
      hints_already_shown: i,
    });
    assert.equal(r.reveal_final_answer, false, `attempt ${i} should not reveal answer`);
  }
});

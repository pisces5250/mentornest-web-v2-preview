// Tests: hint_ladder_next
// Run with: node --test test/hint_ladder.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { nextHintLevel, HINT_LEVELS } from "../lib/hint_ladder.mjs";

test("correct answer → level 0 (none)", () => {
  const r = nextHintLevel({ result: "correct", attempts: 1 });
  assert.equal(r.level, 0);
  assert.equal(r.level_name, "none");
});

test("first incorrect attempt → level 1 (conceptual_nudge)", () => {
  const r = nextHintLevel({ result: "incorrect", attempts: 1, error_type: "concept_misunderstanding" });
  assert.equal(r.level, 1);
  assert.equal(r.level_name, "conceptual_nudge");
});

test("second incorrect attempt → level 2 (worked_example)", () => {
  const r = nextHintLevel({ result: "incorrect", attempts: 2, error_type: "fraction_operation_error" });
  assert.equal(r.level, 2);
});

test("third/fourth incorrect attempt → level 3 (partial_solution)", () => {
  for (const a of [3, 4]) {
    const r = nextHintLevel({ result: "incorrect", attempts: a });
    assert.equal(r.level, 3, `attempts=${a}`);
  }
});

test("5+ attempts → level 4 (full_solution)", () => {
  const r = nextHintLevel({ result: "incorrect", attempts: 5 });
  assert.equal(r.level, 4);
});

test("many hints already given escalates one level", () => {
  const r = nextHintLevel({ result: "incorrect", attempts: 1, hints_already: 3 });
  assert.equal(r.level, 2);
});

test("symbolic-first failing twice → recommend visual-first", () => {
  const r = nextHintLevel({
    result: "incorrect",
    attempts: 2,
    representation_used: "symbolic-first",
  });
  assert.equal(r.representation_recommendation, "visual-first");
  assert.equal(r.representation_change, true);
});

test("concrete-first failing 3+ times → recommend visual-first", () => {
  const r = nextHintLevel({
    result: "incorrect",
    attempts: 3,
    representation_used: "concrete-first",
  });
  assert.equal(r.representation_recommendation, "visual-first");
});

test("HINT_LEVELS has exactly 5 entries", () => {
  assert.equal(HINT_LEVELS.length, 5);
  assert.deepEqual([...HINT_LEVELS], [
    "none",
    "conceptual_nudge",
    "worked_example",
    "partial_solution",
    "full_solution",
  ]);
});

test("deterministic — same input same output", () => {
  const a = nextHintLevel({ result: "incorrect", attempts: 3, error_type: "x" });
  const b = nextHintLevel({ result: "incorrect", attempts: 3, error_type: "x" });
  assert.deepEqual(a, b);
});

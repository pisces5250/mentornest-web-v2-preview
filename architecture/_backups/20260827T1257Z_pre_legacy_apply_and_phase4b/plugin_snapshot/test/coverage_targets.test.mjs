// Test coverage targets module
import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultTargetFor,
  computeCoverageTargets,
  DIFFICULTIES,
  QUESTION_TYPES,
} from "../lib/coverage_targets.mjs";

test("defaultTargetFor: math short_answer easy → 3", () => {
  assert.equal(defaultTargetFor("math", "short_answer", "easy"), 3);
});
test("defaultTargetFor: math short_answer medium → 3", () => {
  assert.equal(defaultTargetFor("math", "short_answer", "medium"), 3);
});
test("defaultTargetFor: math short_answer hard → 2", () => {
  assert.equal(defaultTargetFor("math", "short_answer", "hard"), 2);
});
test("defaultTargetFor: math multiple_choice easy → 2", () => {
  assert.equal(defaultTargetFor("math", "multiple_choice", "easy"), 2);
});
test("defaultTargetFor: math multiple_choice hard → 1", () => {
  assert.equal(defaultTargetFor("math", "multiple_choice", "hard"), 1);
});
test("defaultTargetFor: math true_false → 1", () => {
  assert.equal(defaultTargetFor("math", "true_false", "easy"), 1);
});
test("defaultTargetFor: chinese short_answer easy → 2", () => {
  assert.equal(defaultTargetFor("chinese", "short_answer", "easy"), 2);
});
test("defaultTargetFor: chinese short_answer medium → 1", () => {
  assert.equal(defaultTargetFor("chinese", "short_answer", "medium"), 1);
});
test("defaultTargetFor: english multiple_choice easy → 1", () => {
  assert.equal(defaultTargetFor("english", "multiple_choice", "easy"), 1);
});
test("defaultTargetFor: rejects unknown difficulty", () => {
  assert.throws(() => defaultTargetFor("math", "short_answer", "lol"));
});
test("defaultTargetFor: rejects unknown type", () => {
  assert.throws(() => defaultTargetFor("math", "essay", "easy"));
});

test("computeCoverageTargets: math produces 9 cells (3 short + 3 multiple + 3 true_false)", () => {
  const cells = computeCoverageTargets({ subject: "math", grade: 5, knowledgePoint: "math.G5.FRAC.add-unlike-denom" });
  assert.equal(cells.length, 9);
  const shortCount = cells.filter((c) => c.type === "short_answer").length;
  const mcCount = cells.filter((c) => c.type === "multiple_choice").length;
  const tfCount = cells.filter((c) => c.type === "true_false").length;
  assert.equal(shortCount, 3);
  assert.equal(mcCount, 3);
  assert.equal(tfCount, 3);
});

test("computeCoverageTargets: chinese skips true_false", () => {
  const cells = computeCoverageTargets({ subject: "chinese", grade: 3, knowledgePoint: "chinese.G3.READ.basic-literal" });
  const tfCount = cells.filter((c) => c.type === "true_false").length;
  assert.equal(tfCount, 0);
  // 3 short_answer + 3 multiple_choice = 6 cells
  assert.equal(cells.length, 6);
});

test("computeCoverageTargets: override zeros out a cell", () => {
  const cells = computeCoverageTargets({
    subject: "math",
    grade: 5,
    knowledgePoint: "math.G5.FRAC.add-unlike-denom",
    override: { math: { "math.G5.FRAC.add-unlike-denom": { short_answer: { hard: 0 } } } },
  });
  const hardShort = cells.find((c) => c.type === "short_answer" && c.difficulty === "hard");
  assert.equal(hardShort, undefined);
  // Was 9 cells total with target > 0; now 8 after removing short_answer/hard.
  assert.equal(cells.length, 8);
});

test("computeCoverageTargets: override increases a cell", () => {
  const cells = computeCoverageTargets({
    subject: "math",
    grade: 5,
    knowledgePoint: "math.G5.FRAC.add-unlike-denom",
    override: { math: { "math.G5.FRAC.add-unlike-denom": { short_answer: { hard: 5 } } } },
  });
  const hardShort = cells.find((c) => c.type === "short_answer" && c.difficulty === "hard");
  assert.equal(hardShort.target, 5);
});

test("DIFFICULTIES + QUESTION_TYPES exported as arrays", () => {
  assert.ok(DIFFICULTIES.includes("easy"));
  assert.ok(QUESTION_TYPES.includes("short_answer"));
});
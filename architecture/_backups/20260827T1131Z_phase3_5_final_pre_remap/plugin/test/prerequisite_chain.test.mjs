// Tests: prerequisite_chain.mjs
// Run with: node --test test/prerequisite_chain.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getMathPrerequisites,
  weakestPrerequisite,
  listAllPrereqPairs,
} from "../lib/prerequisite_chain.mjs";

test("getMathPrerequisites: G5 add-unlike has G4 add-sub prereq", () => {
  const r = getMathPrerequisites({ knowledge_point: "math.G5.FRAC.add-unlike-denom" });
  assert.equal(r.found, true);
  assert.equal(r.prereqs.length, 1);
  assert.equal(r.prereqs[0].knowledge_point, "math.G4.FRAC.proper-fraction-add-sub");
});

test("getMathPrerequisites: G6 mul-fraction-fraction has G5 mul-fraction-by-int prereq", () => {
  const r = getMathPrerequisites({ knowledge_point: "math.G6.FRAC.multiply-fraction-fraction" });
  assert.equal(r.prereqs.length, 1);
  assert.equal(r.prereqs[0].knowledge_point, "math.G5.FRAC.multiply-fraction-by-integer");
});

test("getMathPrerequisites: G3 FRAC intro has no prereqs", () => {
  const r = getMathPrerequisites({ knowledge_point: "math.G3.FRAC.intro-fraction" });
  assert.equal(r.prereqs.length, 0);
});

test("getMathPrerequisites: unknown KP returns empty list", () => {
  const r = getMathPrerequisites({ knowledge_point: "math.G99.FOO.bar" });
  assert.equal(r.prereqs.length, 0);
});

test("getMathPrerequisites: non-math KP rejected", () => {
  const r = getMathPrerequisites({ knowledge_point: "chinese.G5.READ.main-idea" });
  assert.equal(r.found, false);
});

test("getMathPrerequisites: each entry has description_zh", () => {
  const r = getMathPrerequisites({ knowledge_point: "math.G5.FRAC.add-unlike-denom" });
  assert.ok(r.prereqs[0].description_zh);
  assert.match(r.prereqs[0].description_zh, /.+分數/);
});

test("listAllPrereqPairs: at least 15 known pairs", () => {
  const all = listAllPrereqPairs();
  assert.ok(all.length >= 15);
});

test("weakestPrerequisite: student_001 G6 mul-fraction-fraction returns prereq", async () => {
  const r = await weakestPrerequisite({
    student_id: "student_001",
    knowledge_point: "math.G6.FRAC.multiply-fraction-fraction",
  });
  assert.equal(r.knowledge_point, "math.G6.FRAC.multiply-fraction-fraction");
  assert.ok(r.prereq);
  assert.equal(r.prereq.knowledge_point, "math.G5.FRAC.multiply-fraction-by-integer");
  assert.ok(r.recommendation_zh.includes("先備") || r.mastered);
});

test("weakestPrerequisite: KP with no chain returns helpful message", async () => {
  const r = await weakestPrerequisite({
    student_id: "student_001",
    knowledge_point: "math.G3.FRAC.intro-fraction",
  });
  assert.equal(r.prereq, null);
  assert.match(r.recommendation_zh, /沒有列出的先備知識/);
});

test("weakestPrerequisite: missing student_id rejected", async () => {
  await assert.rejects(() => weakestPrerequisite({ student_id: "", knowledge_point: "math.G6.PERCENT.intro" }), /required/);
});

test("weakestPrerequisite: G6 PERCENT goes back to G5 DECIMAL", async () => {
  const r = await weakestPrerequisite({
    student_id: "student_001",
    knowledge_point: "math.G6.PERCENT.intro",
  });
  assert.equal(r.prereq.knowledge_point, "math.G5.DECIMAL.intro-and-compare");
});

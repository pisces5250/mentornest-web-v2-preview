// Tests: curriculum_map
// Run with: node --test test/curriculum_map.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupKnowledgePoint,
  listKnowledgePoints,
  listSubjects,
  curriculumMeta,
} from "../lib/curriculum_map.mjs";

test("V1 scope is G1-G6", async () => {
  const meta = await curriculumMeta();
  assert.equal(meta.scope, "G1-G6");
  assert.equal(meta.curriculum_code, "taiwan-12-year-curriculum");
});

test("lists 5 subjects", async () => {
  const subs = await listSubjects();
  assert.equal(subs.length, 5);
  for (const s of ["math", "chinese", "english", "science", "social_studies"]) {
    assert.ok(subs.includes(s), `missing subject ${s}`);
  }
});

test("G5 unlike denom (the one in 奐奐's actual records) is found", async () => {
  const r = await lookupKnowledgePoint({
    grade: 5,
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
  });
  assert.equal(r.found, true);
  assert.equal(r.curriculum_doc, "tw-12yrc-math-v1");
  assert.ok(r.knowledge_point.description.includes("異分母"));
  assert.ok(Array.isArray(r.sibling_points));
  assert.ok(r.sibling_points.length > 0);
});

test("G7 is explicitly out of V1 scope", async () => {
  const r = await lookupKnowledgePoint({ grade: 7, subject: "math", knowledge_point: "math.G7.X" });
  assert.equal(r.found, false);
  assert.equal(r.reason, "grade-not-in-curriculum-v1");
});

test("Wrong grade for kp returns 'not-found-in-grade' + available list", async () => {
  const r = await lookupKnowledgePoint({
    grade: 4,
    subject: "math",
    knowledge_point: "math.G5.FRAC.add-unlike-denom",
  });
  assert.equal(r.found, false);
  assert.equal(r.reason, "knowledge-point-not-found-in-grade");
  assert.ok(Array.isArray(r.available));
  assert.ok(r.available.includes("math.G4.FRAC.proper-fraction-compare"));
});

test("listKnowledgePoints for G5 math returns 6 entries", async () => {
  const r = await listKnowledgePoints({ grade: 5, subject: "math" });
  assert.equal(r.found, true);
  assert.equal(r.knowledge_points.length, 6);
});

test("Source is 教育部 (no publisher content in any kp)", async () => {
  const meta = await curriculumMeta();
  for (const d of meta.source_documents) {
    assert.match(d, /教育部/);
  }
});

test("Reasonable grade coverage: every grade G1–G6 has ≥ 3 kps", async () => {
  for (let g = 1; g <= 6; g++) {
    const r = await listKnowledgePoints({ grade: g, subject: "math" });
    assert.ok(r.knowledge_points.length >= 3, `G${g} has too few kps`);
  }
});

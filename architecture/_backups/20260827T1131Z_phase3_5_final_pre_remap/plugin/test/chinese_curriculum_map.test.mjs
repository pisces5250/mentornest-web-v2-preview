// Tests: chinese_curriculum_map
// Run with: node --test test/chinese_curriculum_map.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupChineseKP,
  listChineseKPForGrade,
  gradeAppropriateVocabulary,
  totalLadderSize,
  listLadderGrades,
} from "../lib/chinese_curriculum_map.mjs";

test("V1 scope is G1-G6", async () => {
  const r = await lookupChineseKP({ knowledge_point: "chinese.G4.READ.main-idea-multi" });
  assert.equal(r.found, true);
  assert.equal(r.curriculum_doc, "tw-12yrc-chinese-v1");
  assert.equal(r.scope, "G1-G6");
});

test("lookupChineseKP: parses KP id correctly", async () => {
  const r = await lookupChineseKP({ knowledge_point: "chinese.G4.READ.main-idea-multi" });
  assert.equal(r.found, true);
  assert.equal(r.grade, 4);
  assert.equal(r.topic, "READ");
  assert.equal(r.subtopic, "main-idea-multi");
});

test("lookupChineseKP: returns ~3-word vocabulary sample", async () => {
  const r = await lookupChineseKP({ knowledge_point: "chinese.G5.IDIOM.basic-idiom" });
  assert.ok(Array.isArray(r.vocabulary));
  assert.equal(r.vocabulary.length, 3);
  assert.ok(r.example_texts.length >= 1);
});

test("lookupChineseKP: returns example texts for reading KP", async () => {
  const r = await lookupChineseKP({ knowledge_point: "chinese.G5.READ.inference-implicit" });
  assert.ok(r.example_texts);
  assert.ok(r.example_texts.length >= 1);
  // Should mention 閱讀 or 推論 related topic.
  const joined = r.example_texts.join(" ");
  assert.match(joined, /(讀|推論|觀點)/);
});

test("lookupChineseKP: invalid KP returns reason", async () => {
  const r = await lookupChineseKP({ knowledge_point: "" });
  assert.equal(r.found, false);
});

test("listChineseKPForGrade: G5 returns multiple KPs", async () => {
  const r = await listChineseKPForGrade({ grade: 5 });
  assert.equal(r.found, true);
  assert.ok(r.knowledge_points.length >= 2, `G5 has ${r.knowledge_points.length} kps`);
  assert.ok(r.vocabulary_size > 0);
});

test("listChineseKPForGrade: invalid grade returns empty", async () => {
  const r = await listChineseKPForGrade({ grade: 99 });
  assert.equal(r.found, false);
  assert.deepEqual(r.knowledge_points, []);
});

test("listChineseKPForGrade: every grade G1-G6 has KPs", async () => {
  for (let g = 1; g <= 6; g++) {
    const r = await listChineseKPForGrade({ grade: g });
    assert.ok(r.knowledge_points.length >= 1, `G${g} has 0 kps`);
  }
});

test("gradeAppropriateVocabulary: known G1 word is appropriate", () => {
  const r = gradeAppropriateVocabulary({ grade: 1, word: "我" });
  assert.equal(r.appropriate, true);
  assert.equal(r.found_in_ladder, true);
});

test("gradeAppropriateVocabulary: unknown word is not appropriate", () => {
  const r = gradeAppropriateVocabulary({ grade: 1, word: "foobar-not-a-real-word" });
  assert.equal(r.appropriate, false);
});

test("gradeAppropriateVocabulary: gap_note documents V1 limitation", () => {
  const r = gradeAppropriateVocabulary({ grade: 5, word: "x" });
  assert.match(r.gap_note, /V1 ships ~30/);
});

test("totalLadderSize is roughly 30 per grade × 6 grades", () => {
  const total = totalLadderSize();
  assert.ok(total >= 100, `too few (${total})`);
  assert.ok(total <= 250, `too many (${total})`);
});

test("listLadderGrades returns 6 grades", () => {
  const grades = listLadderGrades();
  assert.equal(grades.length, 6);
  assert.deepEqual(grades, [1, 2, 3, 4, 5, 6]);
});
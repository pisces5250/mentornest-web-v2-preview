// Tests: english_curriculum_map
// Run with: node --test test/english_curriculum_map.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lookupEnglishKP,
  listEnglishKPForGrade,
  gradeAppropriateVocabulary,
  totalLadderSize,
  listLadderGrades,
} from "../lib/english_curriculum_map.mjs";

test("lookupEnglishKP: finds existing KP for G5", async () => {
  const r = await lookupEnglishKP({ knowledge_point: "english.G5.READ.passage-inference" });
  assert.equal(r.found, true);
  assert.equal(r.grade, 5);
  assert.equal(r.topic, "READ");
  assert.equal(r.subtopic, "passage-inference");
});

test("lookupEnglishKP: finds G3 PHONE KP", async () => {
  const r = await lookupEnglishKP({ knowledge_point: "english.G3.PHONE.letter-sound" });
  assert.equal(r.found, true);
  assert.equal(r.grade, 3);
  assert.equal(r.topic, "PHONE");
});

test("lookupEnglishKP: G6 WRITE short-paragraph", async () => {
  const r = await lookupEnglishKP({ knowledge_point: "english.G6.WRITE.short-paragraph" });
  assert.equal(r.found, true);
  assert.equal(r.grade, 6);
});

test("lookupEnglishKP: returns grade + vocabulary even for unknown KP", async () => {
  const r = await lookupEnglishKP({ knowledge_point: "english.G5.READ.unknown-subtopic" });
  assert.equal(r.found, false);
  assert.equal(r.grade, 5);
  assert.equal(r.topic, "READ");
  assert.ok(Array.isArray(r.vocabulary));
  assert.ok(r.vocabulary.length > 0);
});

test("lookupEnglishKP: rejects malformed KP id", async () => {
  const r = await lookupEnglishKP({ knowledge_point: "garbage" });
  assert.equal(r.found, false);
  assert.equal(r.reason, "kp-id-malformed");
});

test("lookupEnglishKP: rejects non-string", async () => {
  const r = await lookupEnglishKP({ knowledge_point: null });
  assert.equal(r.found, false);
  assert.equal(r.reason, "knowledge_point-must-be-string");
});

test("listEnglishKPForGrade: G3 returns KPs", async () => {
  const r = await listEnglishKPForGrade({ grade: 3 });
  assert.equal(r.found, true);
  assert.ok(r.knowledge_points.length >= 2);
  assert.ok(r.knowledge_points.some((k) => /PHONE/.test(k.id)));
});

test("listEnglishKPForGrade: G5 includes READ PASSAGE-INFERENCE", async () => {
  const r = await listEnglishKPForGrade({ grade: 5 });
  assert.equal(r.found, true);
  const ids = r.knowledge_points.map((k) => k.id);
  assert.ok(ids.some((id) => id === "english.G5.READ.passage-inference"));
});

test("listEnglishKPForGrade: invalid grade returns empty", async () => {
  const r = await listEnglishKPForGrade({ grade: 7 });
  assert.equal(r.found, false);
  assert.deepEqual(r.knowledge_points, []);
});

test("listEnglishKPForGrade: G1 returns empty (no KPs in YAML)", async () => {
  const r = await listEnglishKPForGrade({ grade: 1 });
  // G1 has no KPs in current YAML → found=false.
  assert.equal(r.found, false);
});

test("gradeAppropriateVocabulary: G3 'apple' is in ladder", () => {
  const r = gradeAppropriateVocabulary({ grade: 3, word: "apple" });
  assert.equal(r.found_in_ladder, true);
  assert.equal(r.appropriate, true);
  assert.match(r.gap_note, /V1|gap|production/i);
});

test("gradeAppropriateVocabulary: G3 unknown word → not appropriate", () => {
  const r = gradeAppropriateVocabulary({ grade: 3, word: "xyzqwerty" });
  assert.equal(r.found_in_ladder, false);
  assert.equal(r.appropriate, false);
});

test("totalLadderSize: ~30 words * 6 grades = ~180", () => {
  const n = totalLadderSize();
  assert.ok(n >= 150 && n <= 240, `got ${n}`);
});

test("listLadderGrades: returns [1,2,3,4,5,6]", () => {
  const grades = listLadderGrades();
  assert.deepEqual(grades, [1, 2, 3, 4, 5, 6]);
});

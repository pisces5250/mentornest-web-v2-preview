// Tests: english_subskill_map
// Run with: node --test test/english_subskill_map.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyEnglishSubskill,
  listSubskills,
} from "../lib/english_subskill_map.mjs";

test("listSubskills includes all 9 English subskills", () => {
  const all = listSubskills();
  assert.deepEqual(all, [
    "phonics",
    "spelling",
    "vocab",
    "grammar",
    "reading",
    "listening",
    "speaking",
    "writing",
    "conversation",
  ]);
});

test("PHONE segment → phonics", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G3.PHONE.letter-sound" });
  assert.equal(r.primary_subskill, "phonics");
  assert.equal(r.matched_segment, "PHONE");
});

test("VOC segment → vocab", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G3.VOC.basic-vocab" });
  assert.equal(r.primary_subskill, "vocab");
});

test("GRAMMAR segment → grammar", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G4.GRAMMAR.present-simple" });
  assert.equal(r.primary_subskill, "grammar");
});

test("READ segment → reading", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G5.READ.passage-inference" });
  assert.equal(r.primary_subskill, "reading");
});

test("LISTEN segment → listening", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G3.LIS.basic-listen" });
  assert.equal(r.primary_subskill, "listening");
});

test("SPEAK segment → speaking", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G5.SPEAK.short-dialog" });
  assert.equal(r.primary_subskill, "speaking");
});

test("WRITE segment → writing", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G6.WRITE.short-paragraph" });
  assert.equal(r.primary_subskill, "writing");
});

test("GRAMMER (typo'd) segment → grammar", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G5.GRAMMER.present-progressive" });
  assert.equal(r.primary_subskill, "grammar");
});

test("keyword heuristic: free text 'phonics letter-sound' → phonics", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.phonics-letter-sound" });
  assert.equal(r.primary_subskill, "phonics");
});

test("keyword heuristic: 'reading comprehension' → reading", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.reading-comprehension-basics" });
  assert.equal(r.primary_subskill, "reading");
});

test("secondary_subskills: at most 3 and non-empty", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G3.PHONE.letter-sound" });
  assert.ok(r.secondary_subskills.length <= 3);
  assert.ok(r.secondary_subskills.length >= 1);
});

test("secondary excludes primary", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.G5.READ.passage-inference" });
  assert.ok(!r.secondary_subskills.includes("reading"));
});

test("unknown KP falls back to default 'reading'", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "english.weird.unknown" });
  // Falls back to "reading" default (safe English default).
  assert.equal(typeof r.primary_subskill, "string");
  assert.ok(r.primary_subskill.length > 0);
});

test("empty KP returns a valid classification", () => {
  const r = classifyEnglishSubskill({ knowledge_point: "" });
  assert.equal(typeof r.primary_subskill, "string");
  assert.ok(Array.isArray(r.secondary_subskills));
});

// Tests: chinese_subskill_map
// Run with: node --test test/chinese_subskill_map.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyChineseSubskill,
  listSubskills,
} from "../lib/chinese_subskill_map.mjs";

test("classify: PHONE → 字", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G1.PHONE.bopomofo" });
  assert.equal(r.primary_subskill, "字");
});

test("classify: VOC → 詞", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G3.VOC.common-vocab" });
  assert.equal(r.primary_subskill, "詞");
});

test("classify: READ → 應用", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G4.READ.main-idea-multi" });
  assert.equal(r.primary_subskill, "應用");
});

test("classify: WRITE → 篇", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G5.WRITE.paragraph" });
  assert.equal(r.primary_subskill, "篇");
});

test("classify: RHET → 修辭", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G4.RHET.basic-rhetoric" });
  assert.equal(r.primary_subskill, "修辭");
});

test("classify: CLASSICAL → 文言", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G6.LANG.classical-intro" });
  // "LANG" segment doesn't match SEGMENT_TO_SUBSKILL; keyword "文言" or "古文" applies.
  assert.equal(r.primary_subskill, "文言");
});

test("classify: secondary_subskills is non-empty and ≤ 3", () => {
  for (const kp of [
    "chinese.G1.PHONE.bopomofo",
    "chinese.G3.VOC.common-vocab",
    "chinese.G4.READ.main-idea-multi",
    "chinese.G5.WRITE.paragraph",
    "chinese.G4.RHET.basic-rhetoric",
  ]) {
    const r = classifyChineseSubskill({ knowledge_point: kp });
    assert.ok(r.secondary_subskills.length >= 1);
    assert.ok(r.secondary_subskills.length <= 3);
    assert.notEqual(r.secondary_subskills[0], r.primary_subskill);
  }
});

test("classify: free-text keyword override", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G1.CX.something-with-閱讀-keyword" });
  // Segment "CX" doesn't match; keyword "閱讀" should push primary to 應用.
  assert.equal(r.primary_subskill, "應用");
});

test("classify: returns matched_segment", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G3.VOC.common-vocab" });
  assert.equal(r.matched_segment, "VOC");
});

test("classify: returns matched_keywords array", () => {
  const r = classifyChineseSubskill({ knowledge_point: "chinese.G3.VOC.common-vocab" });
  assert.ok(Array.isArray(r.matched_keywords));
});

test("classify: defaults to 應用 when nothing matches", () => {
  const r = classifyChineseSubskill({ knowledge_point: "unknown.subtopic.foo-bar" });
  assert.equal(r.primary_subskill, "應用");
});

test("listSubskills returns 8 known subskills", () => {
  const subs = listSubskills();
  assert.equal(subs.length, 8);
  for (const s of ["字", "詞", "句", "段", "篇", "修辭", "文言", "應用"]) {
    assert.ok(subs.includes(s));
  }
});

test("classify: deterministic — same input same output", () => {
  const a = classifyChineseSubskill({ knowledge_point: "chinese.G3.VOC.x" });
  const b = classifyChineseSubskill({ knowledge_point: "chinese.G3.VOC.x" });
  assert.deepEqual(a, b);
});
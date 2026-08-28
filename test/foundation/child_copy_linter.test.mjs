// test/foundation/child_copy_linter.test.mjs
// Phase 5A — child_copy_linter unit tests.

import { test } from "node:test";
import assert from "node:assert/strict";
import { lintChildCopy, ChildCopyLinter } from "../../src/foundation/child_copy_linter.mjs";

test("lint: G3-G4 short copy passes", () => {
  const r = lintChildCopy({ band: "G3-G4", text: "練習：認識分數", location: "test" });
  // ok if no error severity
  assert.equal(r.ok, true);
});

test("lint: G1-G2 too-long copy → TOO_LONG error", () => {
  // G1-G2 limit = 24 chars. Use a 25-char string.
  const text = "這是一段非常長的指令給小小孩讀太辛苦了呀呀啊哈哈哈";
  assert.equal(text.length, 25, `text should be 25 chars, got ${text.length}`);
  const r = lintChildCopy({ band: "G1-G2", text, location: "test" });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "TOO_LONG"));
});

test("lint: blame language → BLAME_LANGUAGE error", () => {
  const r = lintChildCopy({ band: "G3-G4", text: "你怎麼不會這個呢？", location: "test" });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "BLAME_LANGUAGE"));
});

test("lint: adult jargon → ADULT_JARGON warn", () => {
  const r = lintChildCopy({ band: "G5-G6", text: "我們用演算法來解這題", location: "test" });
  assert.equal(r.ok, true); // warn does not fail
  assert.ok(r.issues.some((i) => i.code === "ADULT_JARGON"));
});

test("lint: hint containing answer → HINT_REVEALS_ANSWER error", () => {
  const r = lintChildCopy({
    band: "G3-G4",
    text: "提示：把分數變成 5/6 就可以了",
    location: "hint",
    is_hint: true,
    correct_answer_text: "5/6",
  });
  assert.equal(r.ok, false);
  assert.ok(r.issues.some((i) => i.code === "HINT_REVEALS_ANSWER"));
});

test("lint: hint without answer text → no reveal", () => {
  const r = lintChildCopy({
    band: "G3-G4",
    text: "提示：找出公分母",
    location: "hint",
    is_hint: true,
    correct_answer_text: "5/6",
  });
  assert.equal(r.ok, true);
});

test("lint: terminology drift → TERMINOLOGY_DRIFT warn", () => {
  const r = lintChildCopy({
    band: "G3-G4",
    text: "做做看這道題",
    location: "test",
    terminology_set: ["練習", "題目"],
  });
  assert.equal(r.ok, true);
  assert.ok(r.issues.some((i) => i.code === "TERMINOLOGY_DRIFT"));
});

test("lint: terminology match → no drift", () => {
  const r = lintChildCopy({
    band: "G3-G4",
    text: "練習這道題目",
    location: "test",
    terminology_set: ["練習", "題目"],
  });
  assert.equal(r.issues.filter((i) => i.code === "TERMINOLOGY_DRIFT").length, 0);
});

test("lint: vocab ceiling (long CJK run) → warn", () => {
  const r = lintChildCopy({ band: "G1-G2", text: "通分後相加得到結果", location: "test" });
  // '通分後相加得到結果' has 9-char run; G1-G2 ceiling is 4 → warn
  assert.ok(r.issues.some((i) => i.code === "VOCAB_CEILING"));
});

test("lint: BAND_MAX_CHARS frozen", () => {
  assert.equal(Object.isFrozen(ChildCopyLinter.BAND_MAX_CHARS), true);
  assert.equal(ChildCopyLinter.BAND_MAX_CHARS["G1-G2"], 24);
  assert.equal(ChildCopyLinter.BAND_MAX_CHARS["G3-G4"], 48);
});

test("lint: forbidden blame phrases frozen", () => {
  assert.equal(Object.isFrozen(ChildCopyLinter.FORBIDDEN_BLAME), true);
  assert.ok(ChildCopyLinter.FORBIDDEN_BLAME.length >= 5);
});

test("lint: namespace exposes lintChildCopy", () => {
  assert.equal(typeof ChildCopyLinter.lintChildCopy, "function");
});

test("lint: empty text passes all checks", () => {
  const r = lintChildCopy({ band: "G3-G4", text: "", location: "test" });
  assert.equal(r.ok, true);
});

test("lint: whitespace normalized before length check", () => {
  const r = lintChildCopy({ band: "G1-G2", text: "       ", location: "test" });
  // normalized to empty → ok
  assert.equal(r.ok, true);
});
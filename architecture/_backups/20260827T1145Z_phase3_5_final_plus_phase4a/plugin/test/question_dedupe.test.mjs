import test from "node:test";
import assert from "node:assert/strict";
import { findDuplicates, normalizeStem, jaccard } from "../lib/question_dedupe.mjs";

test("normalizeStem: lowercases, collapses whitespace, strips trailing punctuation", () => {
  assert.equal(normalizeStem("Hello   World!!"), "hello world");
  assert.equal(normalizeStem("  計算 1/2 + 1/3 。 "), "計算 1/2 + 1/3");
  assert.equal(normalizeStem(""), "");
});

test("findDuplicates: exact match returns score 1.0", () => {
  const existing = [{ id: "a", stem: "計算 1/2 + 1/3" }, { id: "b", stem: "完全不一樣的題目" }];
  const dups = findDuplicates({ stem: "計算 1/2 + 1/3" }, existing);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].id, "a");
  assert.equal(dups[0].score, 1.0);
});

test("findDuplicates: punctuation-only difference still counts", () => {
  const existing = [{ id: "a", stem: "計算 1/2 + 1/3" }];
  const dups = findDuplicates({ stem: "計算 1/2 + 1/3。" }, existing);
  assert.equal(dups.length, 1);
  assert.equal(dups[0].score, 1.0);
});

test("findDuplicates: near-identical returns score >= 0.85", () => {
  const existing = [{ id: "a", stem: "計算 1/2 加 1/3 的結果" }];
  const dups = findDuplicates({ stem: "計算 1/2 加 1/3 的結果" }, existing);
  assert.equal(dups[0].score, 1.0);
});

test("findDuplicates: unrelated returns nothing", () => {
  const existing = [{ id: "a", stem: "完全不一樣的題目" }];
  const dups = findDuplicates({ stem: "另一個完全不同的題目" }, existing);
  assert.equal(dups.length, 0);
});

test("findDuplicates: empty existing returns nothing", () => {
  const dups = findDuplicates({ stem: "任何題目" }, []);
  assert.equal(dups.length, 0);
});

test("jaccard: identical = 1.0, disjoint = 0.0", () => {
  assert.equal(jaccard("a b c", "a b c"), 1.0);
  assert.equal(jaccard("", ""), 1.0);
  assert.equal(jaccard("a b", "c d"), 0.0);
});

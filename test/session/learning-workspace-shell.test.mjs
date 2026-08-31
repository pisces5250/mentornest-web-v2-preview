import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "../..");
const sessionView = readFileSync(resolve(root, "src/session/SessionView.tsx"), "utf8");
const css = readFileSync(resolve(root, "src/styles/app.css"), "utf8");

test("LearningWorkspaceShell 保留題目到老師回饋的單一 DOM 順序", () => {
  const question = sessionView.indexOf('className="mn-learning-workspace__question"');
  const renderer = sessionView.indexOf("<QuestionRenderer", question);
  const feedback = sessionView.indexOf('className="mn-learning-workspace__feedback"', renderer);
  const teacher = sessionView.indexOf("<TeacherTurnPanel", feedback);
  assert.ok(question >= 0 && renderer > question && feedback > renderer && teacher > feedback);
});

test("iPad 橫向雙欄同時要求足夠寬度與高度", () => {
  assert.match(css, /@media \(min-width: 900px\) and \(min-height: 620px\) and \(orientation: landscape\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(0, 0\.9fr\) minmax\(20rem, 1\.1fr\)/);
});

test("Split View、放大與直向保留單欄且不固定高度裁切", () => {
  assert.match(css, /@media \(max-width: 899px\), \(max-height: 619px\), \(orientation: portrait\)/);
  assert.match(css, /max-block-size:\s*none/);
  assert.doesNotMatch(css, /\.mn-learning-workspace\s*\{[^}]*block-size:\s*(?!auto|none|max|min|calc)[0-9]+px/s);
});

test("工作區具備縮排安全與局部捲動", () => {
  assert.match(css, /\.mn-learning-workspace\s*\{[^}]*min-block-size:\s*0/s);
  assert.match(css, /\.mn-learning-workspace__question,[\s\S]*?min-inline-size:\s*0/);
  assert.match(css, /overflow-y:\s*auto/);
  assert.match(css, /overscroll-behavior-block:\s*contain/);
});

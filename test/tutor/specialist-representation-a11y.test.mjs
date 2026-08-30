import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const subjects = ["math", "english", "chinese", "science", "social_studies"];
const source = readFileSync(new URL("../../src/tutor/SpecialistRepresentation.tsx", import.meta.url), "utf8");
const clientSource = readFileSync(new URL("../../src/tutor/TutorTurnClient.ts", import.meta.url), "utf8");
const axeSource = readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");

test("五科 representation 各自使用 subject-discriminated allowlist", () => {
  for (const subject of subjects) assert.match(source, new RegExp(`${subject}: new Set`));
  assert.match(source, /if \(!isKnownRepresentation\(data\)\) return null/);
});

test("representation transport 不接受 judgement、rubric 或 answer key", () => {
  assert.match(clientSource, /Specialist representation 含非呈現欄位/);
  assert.match(clientSource, /"expected_answer", "answer_key", "rubric", "judgement"/);
});

for (const subject of subjects) {
  test(`a11y: ${subject} representation 有可辨識 section、heading 與 list`, async () => {
    const dom = new JSDOM(`<!doctype html><html lang="zh-Hant"><head><title>老師回饋</title></head><body><main><h1>學習</h1><section aria-label="${subject} 老師的呈現"><h2>老師的引導</h2><p>這是 specialist 提供的內容。</p><ol><li>第一個觀察</li><li>第二個觀察</li></ol></section></main></body></html>`, { runScripts: "outside-only" });
    dom.window.eval(axeSource);
    const result = await dom.window.axe.run(dom.window.document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
    assert.equal(result.violations.filter((item) => item.impact === "critical" || item.impact === "serious").length, 0);
  });
}

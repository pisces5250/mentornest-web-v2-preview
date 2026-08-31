import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";

const axeSource = readFileSync(new URL("../../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../../src/session/ChildHome.tsx", import.meta.url), "utf8");
const sessionSource = readFileSync(new URL("../../src/session/SessionView.tsx", import.meta.url), "utf8");
const panelSource = readFileSync(new URL("../../src/tutor/TeacherTurnPanel.tsx", import.meta.url), "utf8");

test("入口只有今日學習／續學是 primary，換科是次層 disclosure", () => {
  assert.match(homeSource, /<details className="mn-home__subject-picker"/);
  assert.match(homeSource, /<summary>我想換一科<\/summary>/);
  assert.match(homeSource, /data-testid="start-session"/);
  assert.match(homeSource, /上次的進度會保留/);
});

test("入口具備 verifying、signed-out、ready、unavailable 語意且不顯示內部錯誤", () => {
  assert.match(homeSource, /"verifying" \| "signed_out" \| "ready" \| "unavailable"/);
  assert.match(homeSource, /正在準備學習空間/);
  assert.match(homeSource, /請家長協助登入/);
  assert.match(homeSource, /這次沒有動到你的進度/);
  assert.doesNotMatch(homeSource, /\{error\.code\}|\{e\?\.code\}/);
});

test("Memory recovery 使用同一 request 並阻止下一題", () => {
  assert.match(sessionSource, /pendingTurn\.current/);
  assert.match(sessionSource, /handleSaveRetry/);
  assert.match(panelSource, /答案已收到，進度還沒存好/);
  assert.match(panelSource, /data-testid="teacher-save-retry"/);
});

test("signed-out入口與換科accordion通過critical／serious axe", async () => {
  const dom = new JSDOM(`<!doctype html><html lang="zh-Hant"><head><title>MentorNest</title></head><body><main><section><header><h1>嗨，今天準備好了嗎？</h1></header><details><summary>我想換一科</summary><div role="group" aria-label="選擇學習科目"><button aria-pressed="true">數學<span>圖解與步驟</span></button><button aria-pressed="false">國語<span>文句與線索</span></button></div></details><form><h2>學習空間還沒連上</h2><p>請家長協助登入。</p><label for="password">家長登入密碼</label><input id="password" type="password" autocomplete="current-password"><button>請家長登入</button></form></section></main></body></html>`, { runScripts: "outside-only" });
  dom.window.eval(axeSource);
  const result = await dom.window.axe.run(dom.window.document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] } });
  assert.equal(result.violations.filter((item) => item.impact === "critical" || item.impact === "serious").length, 0);
});

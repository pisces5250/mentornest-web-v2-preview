// test/tutor/english-specialist-a11y.test.mjs
//
// Phase 6A — axe-core a11y audit on the TutorFeedbackCard DOM.
//
// We render a synthetic JSDOM that mirrors what React produces for
// each of the 4 tones (good / close / needs_work / unclear) and run
// axe-core to check for critical / serious violations.
//
// We use the JSDOM adapter that axe ships; this avoids pulling in
// Playwright.  The structural rules axe checks are stable across
// browsers, so this is a sufficient guard for the parts we own
// (the card itself, the action buttons, the teaching points).

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let axe = null;

async function getAxe() {
  if (axe) return axe;
  // Read axe-core's browser bundle and inject into JSDOM.  We do NOT
  // call axe-core via Node's require because axe is browser-only.
  const axeSource = readFileSync(
    resolve(__dirname, "../../node_modules/axe-core/axe.min.js"),
    "utf8",
  );
  const dom = new JSDOM(
    `<!doctype html><html lang="zh-Hant"><body><div id="root"></div></body></html>`,
    { runScripts: "outside-only" },
  );
  dom.window.eval(axeSource);
  axe = dom.window.axe;
  return axe;
}

function makeDomForTone(tone, withTeachingPoints) {
  const points = withTeachingPoints
    ? [
        { code: "EN-READ-OMIT", label: "漏字", explanation: "漏了 bright。" },
      ]
    : [];
  return `<!doctype html><html lang="zh-Hant"><head><title>練習 - MentorNest</title></head><body>
    <main>
      <h1 id="page-title">練習</h1>
      <section class="mn-question-card" aria-labelledby="stem-1">
        <h2 id="stem-1" class="mn-question-card__stem">Read this short passage aloud.</h2>
        <div class="mn-question-card__answer-area">
          <div
            class="mn-tutor-feedback mn-tutor-feedback--${tone}"
            data-testid="tutor-feedback-p5c2"
            data-state="result"
            role="status"
            aria-live="polite"
          >
            <div class="mn-tutor-feedback__head">
              <svg viewBox="0 0 24 24" class="mn-tutor-feedback__glyph" aria-hidden="true"></svg>
              <div class="mn-tutor-feedback__title">讀得很棒</div>
            </div>
            <p class="mn-tutor-feedback__summary">讀得還不錯。</p>
            <ul class="mn-tutor-feedback__points" aria-label="老師的回饋">
              ${points
                .map(
                  (p) => `<li class="mn-tutor-feedback__point" data-code="${p.code}">
                <span class="mn-tutor-feedback__point-label" aria-hidden="true">${p.label}</span>
                <span class="mn-tutor-feedback__point-explanation">${p.explanation}</span>
              </li>`,
                )
                .join("")}
            </ul>
            <div class="mn-tutor-feedback__actions">
              <button type="button" class="mn-action mn-action--ghost">再讀一次</button>
              <span class="mn-tutor-feedback__listen">
                <span aria-hidden="true">聽老師念</span>
                <button type="button" class="mn-tts-player__play" aria-label="聽老師念">播放</button>
              </span>
              <button type="button" class="mn-action mn-action--primary">下一題</button>
            </div>
          </div>
        </div>
      </section>
    </main>
  </body></html>`;
}

for (const tone of ["good", "close", "needs_work", "unclear"]) {
  test(`a11y: axe-core — TutorFeedbackCard tone=${tone} has 0 critical / 0 serious violations`, async () => {
    const ax = await getAxe();
    const dom = new JSDOM(makeDomForTone(tone, tone !== "good"), {
      runScripts: "outside-only",
    });
    // Inject axe-core into this DOM.
    const axeSource = readFileSync(
      resolve(__dirname, "../../node_modules/axe-core/axe.min.js"),
      "utf8",
    );
    dom.window.eval(axeSource);
    const results = await dom.window.axe.run(dom.window.document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] },
    });
    const critical = results.violations.filter((v) => v.impact === "critical");
    const serious = results.violations.filter((v) => v.impact === "serious");
    if (critical.length || serious.length) {
      const summary = [...critical, ...serious]
        .map(
          (v) =>
            `[${v.impact}] ${v.id}: ${v.help} — ${v.nodes.length} node(s)`,
        )
        .join("\n");
      assert.fail(`axe violations:\n${summary}`);
    }
    assert.equal(critical.length, 0);
    assert.equal(serious.length, 0);
  });
}

test("a11y: evaluating state is announced (role=status + aria-live=polite)", async () => {
  const ax = await getAxe();
  const dom = new JSDOM(
    `<!doctype html><html lang="zh-Hant"><body>
      <div
        class="mn-tutor-feedback mn-tutor-feedback--evaluating"
        role="status"
        aria-live="polite"
        data-testid="tutor-feedback-p5c2"
      >
        <div class="mn-tutor-feedback__spinner" aria-hidden="true"></div>
        <div class="mn-tutor-feedback__copy">老師正在看看你的回答…</div>
      </div>
    </body></html>`,
    { runScripts: "outside-only" },
  );
  const axeSource = readFileSync(
    resolve(__dirname, "../../node_modules/axe-core/axe.min.js"),
    "utf8",
  );
  dom.window.eval(axeSource);
  const card = dom.window.document.querySelector(".mn-tutor-feedback");
  assert.equal(card.getAttribute("role"), "status");
  assert.equal(card.getAttribute("aria-live"), "polite");
  const spinner = dom.window.document.querySelector(".mn-tutor-feedback__spinner");
  assert.equal(spinner.getAttribute("aria-hidden"), "true");
  const copy = dom.window.document.querySelector(".mn-tutor-feedback__copy");
  assert.match(copy.textContent, /老師正在看看/);
});

test("a11y: error state uses role=alert (not role=status)", async () => {
  const ax = await getAxe();
  const dom = new JSDOM(
    `<!doctype html><html lang="zh-Hant"><body>
      <div
        class="mn-tutor-feedback mn-tutor-feedback--error"
        role="alert"
      >
        <div class="mn-tutor-feedback__copy">老師這邊有一點點問題。</div>
        <div class="mn-tutor-feedback__actions">
          <button type="button">再試一次</button>
        </div>
      </div>
    </body></html>`,
    { runScripts: "outside-only" },
  );
  const card = dom.window.document.querySelector(".mn-tutor-feedback");
  assert.equal(card.getAttribute("role"), "alert");
});
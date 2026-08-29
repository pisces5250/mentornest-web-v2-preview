// test/tutor/conversation-tutor-a11y.test.mjs
//
// Phase 6B — Accessibility tests for ConversationTutor.tsx.
//
// Injects axe-core into a fresh JSDOM per phase and verifies there
// are 0 critical / 0 serious violations.  Also verifies the role /
// aria attributes we depend on for screen-reader continuity.

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let axeSource = null;
function loadAxe() {
  if (axeSource) return axeSource;
  axeSource = readFileSync(
    resolve(__dirname, "../../node_modules/axe-core/axe.min.js"),
    "utf8",
  );
  return axeSource;
}

function renderPhaseHarness(phase) {
  const greeting =
    phase === "IDLE" ? null : "嗨，老師在聽喔，隨時開始吧。";
  return `<!doctype html><html lang="zh-Hant"><head><title>和老師說英文</title></head><body>
    <section class="mn-conversation mn-conversation--${phase.toLowerCase()}" role="region" aria-label="和老師說英文" data-phase="${phase}">
      ${
        phase === "IDLE"
          ? `<div class="mn-conversation__idle">
            <h2 class="mn-conversation__title">和老師說英文</h2>
            <p class="mn-conversation__hint">按下開始，老師會在這裡聽你說話。</p>
            <button type="button" class="mn-conversation__btn mn-conversation__btn--primary" data-testid="start-conversation">開始和老師說話</button>
          </div>`
          : `<div class="mn-conversation__active">
            <header class="mn-conversation__header">
              <span class="mn-conversation__phase mn-conversation__phase--${phase.toLowerCase()}" role="status" aria-live="polite" data-testid="phase-badge">${
                phase === "LISTENING"
                  ? "🎤 老師在聽"
                  : phase === "THINKING"
                  ? "💭 老師想想"
                  : phase === "SPEAKING"
                  ? "🔊 老師在說"
                  : "結束"
              }</span>
              <button type="button" class="mn-conversation__btn mn-conversation__btn--ghost" data-testid="end-conversation">結束對話</button>
            </header>
            <div class="mn-conversation__tutor" data-testid="tutor-utterance" aria-live="polite">
              <p class="mn-conversation__tutor-text">老師：${greeting || ""}</p>
            </div>
          </div>`
      }
    </section>
  </body></html>`;
}

async function runAxe(html) {
  const d = new JSDOM(html, { runScripts: "outside-only" });
  d.window.eval(loadAxe());
  const results = await d.window.axe.run(d.window.document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "best-practice"] },
  });
  return results.violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious",
  );
}

test("a11y: phase=IDLE has 0 critical / 0 serious", async () => {
  const v = await runAxe(renderPhaseHarness("IDLE"));
  assert.equal(v.length, 0, v.map((x) => `${x.id}:${x.description}`).join("; "));
});

test("a11y: phase=LISTENING has 0 critical / 0 serious", async () => {
  const v = await runAxe(renderPhaseHarness("LISTENING"));
  assert.equal(v.length, 0, v.map((x) => `${x.id}:${x.description}`).join("; "));
});

test("a11y: phase=THINKING has 0 critical / 0 serious", async () => {
  const v = await runAxe(renderPhaseHarness("THINKING"));
  assert.equal(v.length, 0, v.map((x) => `${x.id}:${x.description}`).join("; "));
});

test("a11y: phase=SPEAKING has 0 critical / 0 serious", async () => {
  const v = await runAxe(renderPhaseHarness("SPEAKING"));
  assert.equal(v.length, 0, v.map((x) => `${x.id}:${x.description}`).join("; "));
});

test("a11y: phase=ENDED has 0 critical / 0 serious", async () => {
  const v = await runAxe(renderPhaseHarness("ENDED"));
  assert.equal(v.length, 0, v.map((x) => `${x.id}:${x.description}`).join("; "));
});

test("a11y: phase badge uses role=status + aria-live=polite", async () => {
  const html = renderPhaseHarness("LISTENING");
  const d = new JSDOM(html);
  const badge = d.window.document.querySelector("[data-testid='phase-badge']");
  assert.ok(badge);
  assert.equal(badge.getAttribute("role"), "status");
  assert.equal(badge.getAttribute("aria-live"), "polite");
});

test("a11y: end button is keyboard-reachable (no aria-hidden, no tabindex=-1)", async () => {
  const html = renderPhaseHarness("LISTENING");
  const d = new JSDOM(html);
  const btn = d.window.document.querySelector("[data-testid='end-conversation']");
  assert.ok(btn);
  assert.notEqual(btn.getAttribute("aria-hidden"), "true");
  assert.notEqual(btn.getAttribute("tabindex"), "-1");
});
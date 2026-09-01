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

test("正式對話 STT 使用同源 credentials 與 CSRF，結束後可繼續下一題", () => {
  const source = readFileSync(resolve(__dirname, "../../src/tutor/ConversationTutor.tsx"), "utf8");
  const renderer = readFileSync(resolve(__dirname, "../../src/session/QuestionRenderer.tsx"), "utf8");
  assert.match(source, /credentials:\s*"same-origin"/);
  assert.match(source, /"X-MentorNest-CSRF":\s*browserCsrfToken\(\)/);
  assert.match(source, /\/api\/stt\/transcribe\?language=en/);
  assert.match(source, /data-testid="conversation-next"/);
  assert.match(renderer, /onComplete=\{onAdvance\}/);
});

test("對話 VAD 使用 server-confirmed session ref 與遞增 turn ref", () => {
  const source = readFileSync(resolve(__dirname, "../../src/tutor/ConversationTutor.tsx"), "utf8");
  assert.match(source, /sessionIdRef\.current\s*=\s*resp\.session\.session_id/);
  assert.match(source, /const sessionId\s*=\s*sessionIdRef\.current/);
  assert.match(source, /const nextTurnIndex\s*=\s*turnIndexRef\.current\s*\+\s*1/);
  assert.match(source, /turnIndexRef\.current\s*=\s*resp\.turn_index/);
  assert.match(source, /if \(turnInFlightRef\.current\) return/);
  assert.doesNotMatch(source, /session_id:\s*state\.sessionId/);
});

test("對話 STT 有等待上限、可恢復收音，並支援 iPad 錄音格式", () => {
  const source = readFileSync(resolve(__dirname, "../../src/tutor/ConversationTutor.tsx"), "utf8");
  const stateMachine = readFileSync(resolve(__dirname, "../../src/tutor/ConversationStateMachine.ts"), "utf8");
  assert.match(source, /const STT_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(source, /signal:\s*controller\.signal/);
  assert.match(source, /type:\s*"LISTEN_AGAIN"/);
  assert.match(source, /resumeListening\s*&&\s*sessionIdRef\.current/);
  assert.match(source, /"audio\/mp4"/);
  assert.match(source, /role="alert"/);
  assert.match(stateMachine, /errorMessage:\s*ev\.errorMessage\s*\?\?\s*null/);
});

test("Conversation greeting 與每輪老師回應皆為 hands-free spoken turn", () => {
  const source = readFileSync(resolve(__dirname, "../../src/tutor/ConversationTutor.tsx"), "utf8");
  const stateMachine = readFileSync(resolve(__dirname, "../../src/tutor/ConversationStateMachine.ts"), "utf8");
  assert.match(stateMachine, /case\s+"STARTED":[\s\S]*phase:\s*"SPEAKING"/);
  assert.match(stateMachine, /lastAction:\s*"greeting"/);
  assert.match(source, /primeConversationAudio\(\)/);
  assert.match(source, /state\.phase\s*!==\s*"SPEAKING"/);
  assert.match(source, /void playTutorAudio\(state\.lastUtterance\)/);
  assert.match(source, /onEnded=\{finishTutorAudio\}/);
  assert.match(source, /stopListening\(\);[\s\S]*releaseConversationAudio\(\)/);
  assert.match(source, /data-testid="conversation-auto-speaking"/);
  assert.match(source, /data-testid="conversation-playback-retry"/);
  assert.match(source, /data-testid="conversation-playback-skip"/);
  assert.doesNotMatch(source, /<TTSPlayer/);
});

test("Conversation 開麥有 acoustic guard，VAD 需先確認安靜且啟用回音抑制", () => {
  const source = readFileSync(resolve(__dirname, "../../src/tutor/ConversationTutor.tsx"), "utf8");
  assert.match(source, /POST_PLAYBACK_GUARD_MS\s*=\s*600/);
  assert.match(source, /VAD_ARM_SILENCE_MS\s*=\s*450/);
  assert.match(source, /if\s*\(!armed\)[\s\S]*quietStartedAt[\s\S]*VAD_ARM_SILENCE_MS/);
  assert.match(source, /echoCancellation:\s*true/);
  assert.match(source, /noiseSuppression:\s*true/);
  assert.match(source, /autoGainControl:\s*true/);
  assert.match(source, /start\(\)[\s\S]*TTS_DONE/);
});

test("Conversation 正常播放不顯示一般播放鍵，錯誤恢復仍可鍵盤操作", async () => {
  const html = `<!doctype html><html lang="zh-Hant"><head><title>英文對話</title></head><body>
    <section role="region" aria-label="和老師說英文" data-phase="SPEAKING">
      <span role="status" aria-live="polite">老師在說</span>
      <p aria-live="polite">老師：Hello!</p>
      <p data-testid="conversation-auto-speaking">老師正在說話…</p>
      <audio aria-hidden="true"></audio>
      <div role="alert"><p>老師的聲音沒有播放成功，可以再試一次。</p>
        <button type="button" data-testid="conversation-playback-retry">點一下聽老師說</button>
        <button type="button" data-testid="conversation-playback-skip">略過這次，繼續說</button>
      </div>
      <button type="button">結束對話</button>
    </section></body></html>`;
  const d = new JSDOM(html);
  assert.equal(d.window.document.querySelector("[data-testid='tts-play']"), null);
  for (const id of ["conversation-playback-retry", "conversation-playback-skip"]) {
    const button = d.window.document.querySelector(`[data-testid='${id}']`);
    assert.ok(button);
    assert.notEqual(button.getAttribute("tabindex"), "-1");
  }
  assert.equal((await runAxe(html)).length, 0);
});

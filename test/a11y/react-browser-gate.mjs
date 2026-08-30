import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseUrl = process.env.MN_BROWSER_BASE_URL ?? "http://127.0.0.1:4173";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch(executablePath
  ? { headless: true, executablePath }
  : { headless: true });

try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const tutorRequests = [];
  await page.route("**/api/tutor/turn", async (route) => {
    const request = route.request();
    const input = request.postDataJSON();
    tutorRequests.push(input);
    const correct = input.response === "92";
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        contract_version: "phase6.tutor-turn.v1",
        trace_id: correct ? "trace_browser_correct" : "trace_browser_retry",
        loop_completed: true,
        subject: "math",
        judgement: { result: correct ? "correct" : "incorrect" },
        diagnosis: correct
          ? { error_code: null, evidence_status: "observed" }
          : { error_code: "MATH-WRONG-CHOICE", evidence_status: "inferred" },
        teaching: correct
          ? {
            action: "advance",
            utterance: "答對了，你抓到這題的重點了。",
            representation: {
              kind: "worked_example",
              title: "數量關係",
              content: "先看每組有幾個，再看一共有幾組。",
              items: ["找每組數量", "找組數"],
            },
          }
          : { action: "retry_same", utterance: "差一點。先找出題目真正要問的量，再試一次。" },
        assessment_evidence: { observation_id: correct ? "obs_correct" : "obs_retry" },
        memory_write: { accepted: true, event_id: correct ? "mem_correct" : "mem_retry" },
        director_decision: { recommendations: [{ reason: "依觀察到的本次作答調整" }] },
        next_step: correct ? {
          id: "fixture_frac_g5_001",
          subject: "math",
          knowledge_point: "math.G5.FRAC.add-unlike-denom",
          type: "fraction_input",
          representation_type: "fraction_bar",
          stem: "1/3 + 1/2 = ?",
          difficulty: "medium",
          source: "verified",
          license: "CC0-1.0",
        } : null,
      }),
    });
  });
  await page.goto(`${baseUrl}?qtype=multiple_choice`, { waitUntil: "networkidle" });
  await page.getByTestId("settings-gear").waitFor();

  // 直接掃描 Vite 實際掛載的 React DOM，不使用手工 HTML mirror。
  const axeResult = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const blocking = axeResult.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  assert.deepEqual(
    blocking.map(({ id, impact, nodes }) => ({ id, impact, nodes: nodes.length })),
    [],
    "實際 React 畫面不得有 critical／serious axe violations",
  );

  // Keyboard-only：首頁主操作與設定 dialog 必須可透過鍵盤完成及返回焦點。
  await page.keyboard.press("Tab");
  const firstFocus = await page.evaluate(() => document.activeElement?.getAttribute("data-testid"));
  assert.equal(firstFocus, "settings-gear", "第一個鍵盤焦點應到設定按鈕");
  await page.keyboard.press("Enter");
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  await page.getByRole("dialog").waitFor({ state: "hidden" });
  assert.equal(
    await page.evaluate(() => document.activeElement?.getAttribute("data-testid")),
    "settings-gear",
    "關閉 dialog 後應返回觸發按鈕",
  );

  const startButton = page.getByRole("button", { name: /開始今天的學習|繼續上次的學習/ });
  await startButton.waitFor();
  let startFocused = false;
  for (let attempt = 0; attempt < 12 && !startFocused; attempt += 1) {
    await page.keyboard.press("Tab");
    startFocused = await startButton.evaluate((element) => element === document.activeElement);
  }
  assert.equal(startFocused, true, "開始學習按鈕應存在於自然鍵盤順序");
  await page.keyboard.press("Enter");
  await page.getByTestId("mn-session").waitFor();

  // Phase 6 孩子流程：第一次答錯會收到老師診斷，可再答；答對後才前往下一題。
  await page.getByTestId("choice-0").click();
  await page.getByTestId("mc-submit").click();
  const retryFeedback = page.getByTestId("teacher-turn-result");
  await retryFeedback.waitFor();
  assert.equal(await retryFeedback.getAttribute("data-verdict"), "incorrect");
  await page.getByTestId("teacher-retry").click();
  await page.getByTestId("choice-1").click();
  await page.getByTestId("mc-submit").click();
  const correctFeedback = page.getByTestId("teacher-turn-result");
  await correctFeedback.waitFor();
  assert.equal(await correctFeedback.getAttribute("data-verdict"), "correct");
  await page.getByTestId("specialist-representation-math").waitFor();
  assert.equal(await page.evaluate(() => document.activeElement?.id), "teacher-turn-title", "Tutor 回饋完成後應移動焦點至標題");
  assert.equal(await page.getByTestId("next-question").isVisible(), true);
  assert.equal(tutorRequests.length, 2, "再答應形成兩筆 append-only response");
  assert.notEqual(tutorRequests[0].response_id, tutorRequests[1].response_id);
  assert.deepEqual(tutorRequests.map(({ response }) => response), ["82", "92"]);
  assert.equal(tutorRequests.some((request) => "expected_answer" in request), false);

  const phase6Axe = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  const phase6Blocking = phase6Axe.violations.filter(
    (violation) => violation.impact === "critical" || violation.impact === "serious",
  );
  assert.deepEqual(phase6Blocking.map(({ id }) => id), [], "老師回饋畫面不得有嚴重可及性違規");

  process.stdout.write(`${JSON.stringify({
    axe: { criticalOrSerious: 0, totalViolations: axeResult.violations.length },
    keyboard: { settingsDialog: "通過", startSession: "通過", tutorFeedbackFocus: "通過" },
    tutor: { specialistRepresentation: "math", dynamicAxe: "通過" },
    phase6TutorFlow: {
      firstIncorrectDiagnosis: "通過",
      retryThenCorrect: "通過",
      appendOnlyResponses: tutorRequests.length,
      browserAnswerKeyExposure: 0,
      feedbackCriticalOrSeriousAxe: 0,
    },
  })}\n`);
  await context.close();
} finally {
  await browser.close();
}

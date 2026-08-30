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
  await page.goto(baseUrl, { waitUntil: "networkidle" });
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

  process.stdout.write(`${JSON.stringify({
    axe: { criticalOrSerious: 0, totalViolations: axeResult.violations.length },
    keyboard: { settingsDialog: "通過", startSession: "通過" },
  })}\n`);
  await context.close();
} finally {
  await browser.close();
}

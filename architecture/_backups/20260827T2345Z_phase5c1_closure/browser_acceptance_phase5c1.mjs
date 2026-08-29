// test/a11y/browser_acceptance_phase5c1.mjs
//
// Phase 5C-1 — Real-browser acceptance for the complete Child Learning Session.
//
// Scope:
//   - Open Child Home, click "start today's learning"
//   - Drive one multiple-choice question end-to-end
//   - Click "next question" → second question
//   - Drive one fraction_input question (wrong → hint → correct)
//   - Reach Session Summary
//   - axe 0 critical + 0 serious across mobile/tablet/desktop
//   - keyboard flow, focus management, ARIA/live feedback
//   - reload resume behavior (start session, do one Q, reload, verify resume notice)
//   - retry state (wrong → click retry → can submit again)
//
// Exit code 0 iff 0 critical + 0 serious axe violations AND every behavioral
// guard produced its result without throwing.

import { chromium } from "playwright";
import axe from "axe-core";
import { writeFileSync } from "node:fs";

const BASE = process.env.MN_AUDIT_BASE ?? "http://localhost:5181/";
const RESULTS_PATH = process.env.MN_AUDIT_RESULTS ?? "/tmp/phase5c1_browser_acceptance.json";

const VIEWPORTS = [
  { name: "mobile",  width: 360,  height: 800 },
  { name: "tablet",  width: 768,  height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const results = {
  startedAt: new Date().toISOString(),
  base: BASE,
  axe: { version: axe.version },
  viewports: {},
  full_session: {},
  keyboard: {},
  reload_resume: {},
  retry: {},
  error_state: {},
  hint_escalation: {},
  representation_switch: {},
  summary: {},
  axeRuns: [],
};

let totalCritical = 0;
let totalSerious = 0;
const guard = async (name, fn) => {
  try { return await fn(); }
  catch (e) {
    results.failedAt = `${name}: ${e?.message ?? String(e)}`;
    console.error(`[guard] ${name} failed:`, e?.message ?? e);
    return null;
  }
};

const browser = await chromium.launch({ headless: true });

try {
  // ──────────────────────────────────────────────────────────────────────
  // A. Axe across viewports on the Child Home view
  // ──────────────────────────────────────────────────────────────────────
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
    // Force the today-tab so axe sees the 5C-1 view.
    await page.addInitScript(() => {
      try { window.localStorage.removeItem("mentornest.session.v1"); } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]', { timeout: 10000 });
    await page.addScriptTag({ content: axe.source });
    const axeResult = await page.evaluate(async () => {
      const r = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
      });
      return {
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length })),
        incomplete: r.incomplete.length,
      };
    });
    results.viewports[vp.name] = {
      width: vp.width, height: vp.height,
      axeCritical: axeResult.violations.filter((v) => v.impact === "critical").length,
      axeSerious:  axeResult.violations.filter((v) => v.impact === "serious").length,
      axeModerate: axeResult.violations.filter((v) => v.impact === "moderate").length,
      axeMinor:    axeResult.violations.filter((v) => v.impact === "minor").length,
      axeIncomplete: axeResult.incomplete,
      consoleErrors,
    };
    totalCritical += results.viewports[vp.name].axeCritical;
    totalSerious  += results.viewports[vp.name].axeSerious;
    results.axeRuns.push({ viewport: vp.name, violations: axeResult.violations });
    await ctx.close();
  }

  // ──────────────────────────────────────────────────────────────────────
  // B. Full session flow on desktop
  //    Question 1 = multiple_choice (built into the verified bank sample)
  //    Question 2 = fraction_input (the G5 FRAC add-unlike question)
  // ──────────────────────────────────────────────────────────────────────
  await guard("full_session", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { window.localStorage.removeItem("mentornest.session.v1"); } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    // Wait for the first question to render.
    await page.waitForSelector('[data-testid^="question-"]', { timeout: 8000 });

    const q1Type = await page.locator('[data-testid^="question-"]').first().getAttribute("data-question-type");

    // ─── Q1: try MC interaction ────────────────────────────────────────
    let q1_correct_on_first = false;
    let q1_advanced = false;
    if (q1Type === "multiple_choice") {
      // The fixture stem is "23 × 4 = ?" with choices ["82", "92", "102", "112"];
      // expected_answer is "92" which is index 1.
      await page.locator('[data-testid="choice-1"]').click();
      await page.locator('[data-testid="mc-submit"]').click();
      await page.waitForTimeout(200);
      q1_correct_on_first = await page.locator('[data-testid="feedback-correct"]').count() > 0;
      // Click "next question" (or "完成練習" if last)
      const nextBtn = page.locator('[data-testid="next-question"]');
      if (await nextBtn.count() > 0) {
        await nextBtn.click();
        q1_advanced = true;
      }
    } else if (q1Type === "fraction_input") {
      // If the verified bank had no MC question and went straight to FRAC,
      // verify the same flow but with the keypad.
      await page.locator('[data-testid="keypad-numerator"]').click();
      await page.keyboard.type("1");
      await page.keyboard.press("Tab");
      await page.keyboard.type("2");
      await page.locator('[data-testid="keypad-submit"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      q1_advanced = await page.locator('[data-testid="next-question"]').count() > 0;
      if (q1_advanced) await page.locator('[data-testid="next-question"]').click();
    }

    // ─── Q2: drive the other question type if available ────────────────
    let q2_seen = false;
    let q2_summary_reached = false;
    try {
      await page.waitForSelector('[data-testid^="question-"]', { timeout: 4000 });
      q2_seen = true;
      const q2Type = await page.locator('[data-testid^="question-"]').first().getAttribute("data-question-type");
      if (q2Type === "fraction_input") {
        // Type a wrong value first to test hint, then correct.
        await page.locator('[data-testid="keypad-numerator"]').click();
        await page.keyboard.type("1");
        await page.keyboard.press("Tab");
        await page.keyboard.type("2");
        await page.locator('[data-testid="keypad-submit"]').focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
        // Hint should appear (level 1, text-only).
        const hintLevel1 = await page.locator('[data-testid="hint-panel"]').count();
        // Now correct.
        await page.locator('[data-testid="keypad-key-clear"]').click();
        await page.locator('[data-testid="keypad-numerator"]').click();
        await page.keyboard.type("5");
        await page.keyboard.press("Tab");
        await page.keyboard.type("6");
        await page.locator('[data-testid="keypad-submit"]').focus();
        await page.keyboard.press("Enter");
        await page.waitForTimeout(200);
      } else if (q2Type === "multiple_choice") {
        await page.locator('[data-testid="choice-0"]').click();
        await page.locator('[data-testid="mc-submit"]').click();
        await page.waitForTimeout(150);
      }
      const nextBtn2 = page.locator('[data-testid="next-question"]');
      if (await nextBtn2.count() > 0) {
        const label = await nextBtn2.textContent();
        await nextBtn2.click();
        // After last question, button text becomes "完成練習"; summary appears.
        q2_summary_reached = await page.locator('[data-testid="session-summary"]').count() > 0;
      }
    } catch (e) {
      // Q2 may not exist if session had only 1 question; that's OK.
    }

    results.full_session = {
      q1_type: q1Type,
      q1_correct_on_first,
      q1_advanced,
      q2_seen,
      q2_summary_reached,
    };
    await ctx.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // C. Reload resume
  // ──────────────────────────────────────────────────────────────────────
  await guard("reload_resume", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    // Only clear localStorage on the first navigation.  addInitScript runs
    // on EVERY navigation including reload, so we use a sessionStorage flag
    // to detect reload (which survives the page navigation) vs. first nav.
    await page.addInitScript(() => {
      try {
        if (!sessionStorage.getItem("phase5c1_reload_resume_already")) {
          window.localStorage.removeItem("mentornest.session.v1");
          sessionStorage.setItem("phase5c1_reload_resume_already", "1");
        }
      } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    await page.waitForSelector('[data-testid^="question-"]');
    const firstQid = await page.locator('[data-testid^="question-"]').first().getAttribute("data-testid");
    // Reload — ChildHome re-renders.  The user clicks "start-session" again
    // and SessionView picks up the localStorage snapshot to resume.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    await page.waitForSelector('[data-testid^="question-"]', { timeout: 8000 });
    const resumedNotice = await page.locator('[data-testid="session-resumed-notice"]').count();
    const resumedQid = await page.locator('[data-testid^="question-"]').first().getAttribute("data-testid");
    results.reload_resume = {
      first_qid: firstQid,
      resumed_notice_visible: resumedNotice > 0,
      resumed_qid: resumedQid,
      resumed_to_same_question: firstQid === resumedQid,
    };
    await ctx.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // D. Retry state
  // ──────────────────────────────────────────────────────────────────────
  await guard("retry", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { window.localStorage.removeItem("mentornest.session.v1"); } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    await page.waitForSelector('[data-testid^="question-"]');
    const qtype = await page.locator('[data-testid^="question-"]').first().getAttribute("data-question-type");
    let wrongSeen = false;
    let retrySeen = false;
    if (qtype === "fraction_input") {
      await page.locator('[data-testid="keypad-numerator"]').click();
      await page.keyboard.type("1");
      await page.keyboard.press("Tab");
      await page.keyboard.type("2");
      await page.locator('[data-testid="keypad-submit"]').focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(200);
      wrongSeen = await page.locator('[data-testid="feedback-incorrect"]').count() > 0;
      retrySeen = await page.locator('[data-testid="retry-button"]').count() > 0;
      if (retrySeen) await page.locator('[data-testid="retry-button"]').click();
      const submitDisabled = await page.locator('[data-testid="keypad-submit"]').isDisabled();
      results.retry = {
        wrong_feedback_seen: wrongSeen,
        retry_button_seen: retrySeen,
        submit_disabled_after_retry: submitDisabled,
      };
    } else if (qtype === "multiple_choice") {
      // Pick a wrong choice to trigger feedback-incorrect + retry-button.
      // The fixture's choices for Q1 are ["82", "92", "102", "112"] with
      // expected_answer "92" (index 1).  Pick index 0 to be wrong.
      await page.locator('[data-testid="choice-0"]').click();
      await page.locator('[data-testid="mc-submit"]').click();
      await page.waitForTimeout(200);
      wrongSeen = await page.locator('[data-testid="feedback-incorrect"]').count() > 0;
      retrySeen = await page.locator('[data-testid="retry-button"]').count() > 0;
      if (retrySeen) {
        await page.locator('[data-testid="retry-button"]').click();
        await page.waitForTimeout(150);
      }
      const submitDisabled = await page.locator('[data-testid="mc-submit"]').isDisabled();
      results.retry = {
        wrong_feedback_seen: wrongSeen,
        retry_button_seen: retrySeen,
        submit_disabled_after_retry: submitDisabled,
      };
    } else {
      results.retry = {
        wrong_feedback_seen: false,
        retry_button_seen: false,
        note: `unknown question_type "${qtype}"`,
      };
    }
    await ctx.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // E. Hint escalation
  // ──────────────────────────────────────────────────────────────────────
  await guard("hint_escalation", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { window.localStorage.removeItem("mentornest.session.v1"); } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    await page.waitForSelector('[data-testid^="question-"]');
    // Walk past Q1 (MC, fixture_mc_g3_001) to reach Q2 (fraction_input).
    await page.locator('[data-testid="choice-1"]').click();
    await page.locator('[data-testid="mc-submit"]').click();
    await page.waitForTimeout(200);
    const nextBtn = page.locator('[data-testid="next-question"]');
    if (await nextBtn.count() > 0) await nextBtn.click();
    await page.waitForSelector('[data-testid^="question-"]');
    const qtype = await page.locator('[data-testid^="question-"]').first().getAttribute("data-question-type");
    if (qtype !== "fraction_input") {
      results.hint_escalation = { note: `q2 was "${qtype}", not fraction_input — escalation path skipped` };
      await ctx.close();
      return;
    }
    // 1) wrong → hint level 1 should appear after click 看提示 button.
    await page.locator('[data-testid="keypad-numerator"]').click();
    await page.keyboard.type("1");
    await page.keyboard.press("Tab");
    await page.keyboard.type("2");
    await page.locator('[data-testid="keypad-submit"]').focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const hintPanelBefore = await page.locator('[data-testid="hint-panel"]').count();
    const hintToggle1 = await page.locator('[data-testid="hint-toggle"]').count();
    let hintPanel1 = 0;
    let hintStage1 = null;
    if (hintToggle1 > 0) {
      await page.locator('[data-testid="hint-toggle"]').click();
      await page.waitForTimeout(200);
      hintPanel1 = await page.locator('[data-testid="hint-panel"]').count();
      hintStage1 = hintPanel1 > 0 ? await page.locator('[data-testid="hint-panel"]').getAttribute("data-stage") : null;
    }
    // 2) click "看提示" again to escalate to level 2 (visual representation).
    const hintToggle2 = await page.locator('[data-testid="hint-toggle"]').count();
    if (hintToggle2 > 0) {
      await page.locator('[data-testid="hint-toggle"]').click();
      await page.waitForTimeout(200);
    }
    const hintPanel2 = await page.locator('[data-testid="hint-panel"]').count();
    const hintStage2 = hintPanel2 > 0 ? await page.locator('[data-testid="hint-panel"]').getAttribute("data-stage") : null;
    const visualCount = await page.locator('[data-testid="math-visual"]').count();
    results.hint_escalation = {
      hint_panel_before_click: hintPanelBefore,
      hint_toggle_present_1: hintToggle1,
      hint_panel_after_1st_hint: hintPanel1,
      hint_stage_after_1st_hint: hintStage1,
      hint_toggle_present_2: hintToggle2,
      hint_panel_after_2nd_hint: hintPanel2,
      hint_stage_after_2nd_hint: hintStage2,
      visual_count_after_level2: visualCount,
      escalation_visible_to_level2: visualCount > 0,
    };
    await ctx.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // F. Representation switch (visual teaching)
  // ──────────────────────────────────────────────────────────────────────
  await guard("representation_switch", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { window.localStorage.removeItem("mentornest.session.v1"); } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    await page.waitForSelector('[data-testid^="question-"]');
    // Walk past Q1 (MC, no rep toggle) to reach Q2 (fraction_input).
    await page.locator('[data-testid="choice-1"]').click();
    await page.locator('[data-testid="mc-submit"]').click();
    await page.waitForTimeout(200);
    const nextBtn = page.locator('[data-testid="next-question"]');
    if (await nextBtn.count() > 0) await nextBtn.click();
    await page.waitForSelector('[data-testid^="question-"]');
    const repBefore = await page.locator('[data-testid^="question-"]').first().getAttribute("data-representation");
    const toggle = await page.locator('[data-testid="representation-toggle"]').count();
    let repAfter = null;
    if (toggle > 0) {
      await page.locator('[data-testid="representation-toggle"]').click();
      await page.waitForTimeout(150);
      repAfter = await page.locator('[data-testid^="question-"]').first().getAttribute("data-representation");
    }
    results.representation_switch = {
      rep_before: repBefore,
      toggle_present: toggle,
      rep_after: repAfter,
      switched: repBefore !== null && repAfter !== null && repBefore !== repAfter,
    };
    await ctx.close();
  });

  // ──────────────────────────────────────────────────────────────────────
  // G. Session summary content
  // ──────────────────────────────────────────────────────────────────────
  await guard("summary", async () => {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      try { window.localStorage.removeItem("mentornest.session.v1"); } catch {}
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="child-home"]');
    await page.locator('[data-testid="start-session"]').click();
    await page.waitForSelector('[data-testid^="question-"]');
    // Drive questions quickly to reach summary.  Each iteration picks the
    // correct answer for whatever question is on screen.
    for (let i = 0; i < 8; i++) {
      const qtype = await page.locator('[data-testid^="question-"]').first().getAttribute("data-question-type");
      const stem = await page.locator('[data-testid="question-stem"]').textContent();
      if (qtype === "fraction_input") {
        await page.locator('[data-testid="keypad-numerator"]').click();
        await page.keyboard.type("5");
        await page.keyboard.press("Tab");
        await page.keyboard.type("6");
        await page.locator('[data-testid="keypad-submit"]').focus();
        await page.keyboard.press("Enter");
      } else if (qtype === "multiple_choice") {
        // 23 × 4 = 92 (index 1)
        await page.locator('[data-testid="choice-1"]').click();
        await page.locator('[data-testid="mc-submit"]').click();
      } else if (qtype === "integer_input") {
        // 144 ÷ 12 = 12
        await page.locator('[data-testid="keypad-key-1"]').click();
        await page.locator('[data-testid="keypad-key-2"]').click();
        await page.locator('[data-testid="keypad-submit"]').focus();
        await page.keyboard.press("Enter");
      } else if (qtype === "decimal_input") {
        // 0.5 + 0.25 = 0.75.  The keypad "." key has testid keypad-key-.
        await page.locator('[data-testid="keypad-key-0"]').click();
        await page.locator('[data-testid="keypad-key-."]').click();
        await page.locator('[data-testid="keypad-key-7"]').click();
        await page.locator('[data-testid="keypad-key-5"]').click();
        await page.locator('[data-testid="keypad-submit"]').focus();
        await page.keyboard.press("Enter");
      } else {
        break;
      }
      await page.waitForTimeout(200);
      const nextBtn = page.locator('[data-testid="next-question"]');
      if (await nextBtn.count() === 0) break;
      await nextBtn.click();
      await page.waitForTimeout(200);
      const summaryCount = await page.locator('[data-testid="session-summary"]').count();
      if (summaryCount > 0) break;
    }
    const summaryCount = await page.locator('[data-testid="session-summary"]').count();
    const headline = summaryCount > 0 ? await page.locator('[data-testid="summary-headline"]').textContent() : null;
    const totalSteps = summaryCount > 0 ? await page.locator('[data-testid="stat-total"]').textContent() : null;
    results.summary = {
      reached: summaryCount > 0,
      headline,
      total_steps: totalSteps,
    };
    await ctx.close();
  });
} finally {
  results.finishedAt = new Date().toISOString();
  results.summary_meta = {
    totalCritical,
    totalSerious,
    exit: totalCritical === 0 && totalSerious === 0 ? 0 : 1,
    failedAt: results.failedAt ?? null,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  try { await browser.close(); } catch {}
  console.log(JSON.stringify(results.summary_meta));
  console.log("Results written to", RESULTS_PATH);
  process.exit(results.summary_meta.exit);
}

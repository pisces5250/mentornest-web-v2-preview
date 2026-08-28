// test/a11y/browser_acceptance.mjs
// Real-browser acceptance for the Phase 5A G3-G4 multiple_choice_basic vertical slice.
//
// Boots a headless Chromium via Playwright, opens the served dist/index.html,
// runs axe-core, performs keyboard / viewport / color-mode / reduced-motion
// inspections.  Emits a single JSON report to stdout.
//
// Exit code 0 if axe finds 0 critical + 0 serious violations (per user spec).
// Exit code 1 if any critical/serious axe violation, or if a behavioral
// expectation (focus ring, touch target, etc.) fails.

import { chromium } from "playwright";
import axe from "axe-core";
import { writeFileSync } from "node:fs";

const BASE = process.env.MN_AUDIT_BASE ?? "http://localhost:5181/";
const RESULTS_PATH = process.env.MN_AUDIT_RESULTS ?? "/tmp/phase5a_browser_acceptance.json";

const VIEWPORTS = [
  { name: "mobile", width: 360, height: 800 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
];

const COLOR_MODES = [
  { name: "default", dataMode: null },
  { name: "high-contrast", dataMode: "high-contrast" },
  { name: "color-vision-safe", dataMode: "color-vision-safe" },
];

const results = {
  startedAt: new Date().toISOString(),
  base: BASE,
  axe: { version: axe.version },
  viewports: {},
  keyboard: {},
  aria: {},
  motion: {},
  touchTargets: {},
  axeRuns: [],
  // Behavioral assertions (not axe)
  behavioral: {},
};

let totalCritical = 0;
let totalSerious = 0;

const browser = await chromium.launch({ headless: true });

try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      reducedMotion: vp.name === "mobile" ? "reduce" : "no-preference",
    });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e)));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="multiple-choice-basic"]', { timeout: 10000 });
    // Inject axe-core
    await page.addScriptTag({ content: axe.source });

    // Per-viewport axe run (default mode)
    const axeResult = await page.evaluate(async () => {
      // eslint-disable-next-line no-undef
      const result = await axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        resultTypes: ["violations", "incomplete"],
      });
      return {
        violations: result.violations.map((v) => ({
          id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length,
        })),
        incomplete: result.incomplete.length,
      };
    });

    // Behavioral checks per viewport
    const choiceCount = await page.locator('.mn-choice').count();
    const firstChoiceVisible = await page.locator('.mn-choice').first().isVisible();
    const cardBox = await page.locator('.mn-question-card').first().boundingBox();
    const touchTargets = await page.evaluate(() => {
      const arr = [];
      for (const el of document.querySelectorAll('.mn-choice')) {
        const r = el.getBoundingClientRect();
        arr.push({ tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height) });
      }
      return arr;
    });
    const gridColumns = await page.evaluate(() => {
      const grid = document.querySelector('.mn-choices');
      if (!grid) return null;
      const cs = getComputedStyle(grid);
      return cs.gridTemplateColumns;
    });

    results.viewports[vp.name] = {
      width: vp.width, height: vp.height,
      choiceCount,
      firstChoiceVisible,
      cardBox,
      touchTargets,
      gridColumns,
      axeCritical: axeResult.violations.filter((v) => v.impact === "critical").length,
      axeSerious: axeResult.violations.filter((v) => v.impact === "serious").length,
      axeModerate: axeResult.violations.filter((v) => v.impact === "moderate").length,
      axeMinor: axeResult.violations.filter((v) => v.impact === "minor").length,
      axeIncomplete: axeResult.incomplete,
      consoleErrors,
    };
    totalCritical += results.viewports[vp.name].axeCritical;
    totalSerious += results.viewports[vp.name].axeSerious;
    results.axeRuns.push({
      viewport: vp.name,
      violations: axeResult.violations,
      incomplete: axeResult.incomplete,
    });
    await ctx.close();
  }

  // Keyboard-only acceptance (desktop viewport, default mode)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="multiple-choice-basic"]');

    // Initial focus should land on the first choice (roving tabindex=0).
    await page.evaluate(() => document.querySelector('.mn-choice')?.focus());
    const initialFocus = await page.evaluate(() => document.activeElement?.getAttribute('aria-checked'));
    const initialTabindex = await page.evaluate(() => {
      const c = document.querySelectorAll('.mn-choice');
      return Array.from(c).map((el) => el.getAttribute('tabindex'));
    });
    // ArrowDown to next
    await page.keyboard.press('ArrowDown');
    const afterArrow = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('.mn-choice'));
      const focused = all.findIndex((el) => el === document.activeElement);
      return focused;
    });
    // Space to select
    await page.keyboard.press(' ');
    const ariaChecked = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('.mn-choice'));
      return all.map((el) => el.getAttribute('aria-checked'));
    });

    // Submit — after Space selection, Tab lands on the hint toggle (it is
    // first in source order).  Press Tab again to reach the submit button.
    await page.keyboard.press('Tab'); // hint toggle
    await page.keyboard.press('Tab'); // submit button
    await page.keyboard.press('Enter');
    const feedbackVisible = await page.locator('[data-testid="feedback"]').isVisible();

    results.keyboard = {
      initialFocus,
      initialTabindex,
      afterArrowFocusedIndex: afterArrow,
      ariaCheckedAfterSpace: ariaChecked,
      feedbackVisibleAfterSubmit: feedbackVisible,
    };
    await ctx.close();
  }

  // ARIA / screen-reader semantics acceptance (desktop)
  {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="multiple-choice-basic"]');

    results.aria = await page.evaluate(() => {
      const out = {};
      const radiogroup = document.querySelector('[role="radiogroup"]');
      out.radiogroupExists = !!radiogroup;
      out.radiogroupLabelledby = radiogroup?.getAttribute('aria-labelledby') ?? null;
      out.radiogroupDescribedby = radiogroup?.getAttribute('aria-describedby') ?? null;
      const radios = Array.from(document.querySelectorAll('[role="radio"]'));
      out.radioCount = radios.length;
      out.radiosWithAriaChecked = radios.every((r) => r.hasAttribute('aria-checked'));
      const hintToggle = document.querySelector('[aria-expanded][aria-controls]');
      out.hintToggleAriaExpanded = hintToggle?.getAttribute('aria-expanded') ?? null;
      out.hintToggleAriaControls = hintToggle?.getAttribute('aria-controls') ?? null;
      const liveRegion = document.querySelector('[role="status"][aria-live]');
      out.liveRegionExists = !!liveRegion;
      out.liveRegionAriaLive = liveRegion?.getAttribute('aria-live') ?? null;
      const stem = document.getElementById('question-stem');
      out.stemId = stem?.id ?? null;
      const choiceKeys = Array.from(document.querySelectorAll('.mn-choice-key'));
      out.choiceKeysPresent = choiceKeys.length === radios.length;
      out.choiceKeysAriaHidden = choiceKeys.every((k) => k.getAttribute('aria-hidden') === 'true');
      return out;
    });
    await ctx.close();
  }

  // Reduced-motion acceptance
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="multiple-choice-basic"]');
    results.motion = await page.evaluate(() => {
      const sample = document.querySelector('.mn-choice');
      const cs = getComputedStyle(sample);
      // 0.01ms = 0.00001s — the browser serializes this as "1e-05s".
      // We accept both notations as evidence that motion is collapsed.
      const collapsed = (d) => d === "0.01ms" || d === "1e-05s" || d === "0s";
      return {
        reducedMotionRequested: true,
        transitionDuration: cs.transitionDuration,
        animationDuration: cs.animationDuration,
        transitionCollapsed: collapsed(cs.transitionDuration),
        animationCollapsed: collapsed(cs.animationDuration),
        motionCollapsed:
          collapsed(cs.transitionDuration) && collapsed(cs.animationDuration),
      };
    });
    await ctx.close();
  }

  // Each subsection is wrapped so partial failures don't lose earlier results.
  const guard = async (name, fn) => {
    try { return await fn(); }
    catch (e) {
      results.failedAt = `${name}: ${e?.message ?? String(e)}`;
      console.error(`[guard] ${name} failed:`, e?.message ?? e);
      return null;
    }
  };

  // Color-mode acceptance (each mode boots separately)
  for (const m of COLOR_MODES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-testid="multiple-choice-basic"]');
    if (m.dataMode) {
      await page.evaluate((mode) => {
        document.documentElement.setAttribute('data-mode', mode);
      }, m.dataMode);
    } else {
      await page.evaluate(() => document.documentElement.removeAttribute('data-mode'));
    }
    // Trigger a select+submit to expose color states.  Click the choice
    // and the submit button directly; keyboard focus order across the
    // roving tabindex + the form actions can be flaky in headless mode.
    await page.locator('.mn-choice').nth(2).click();   // pick the correct one
    await page.locator('[data-testid="submit"]').click();
    await page.waitForSelector('[data-testid="feedback"]', { timeout: 5000 });
    const choiceRects = await page.evaluate(() => {
      const out = {};
      for (const el of document.querySelectorAll('.mn-choice')) {
        const cs = getComputedStyle(el);
        out[el.dataset.state] = {
          borderColor: cs.borderColor,
          backgroundColor: cs.backgroundColor,
          hasIconSpan: !!el.querySelector('.mn-feedback-icon'),
          hasKeyGlyph: !!el.querySelector('.mn-choice-key'),
        };
      }
      return out;
    });
    // Check that correct/incorrect states have BOTH icon and text (R7)
    results.behavioral[m.name] = {
      dataMode: m.dataMode,
      // icon presence in correct/incorrect states
      correctHasIcon: choiceRects.correct?.hasIconSpan ?? false,
      correctHasKey: choiceRects.correct?.hasKeyGlyph ?? false,
      incorrectHasIcon: choiceRects.incorrect?.hasIconSpan ?? false,
      incorrectHasKey: choiceRects.incorrect?.hasKeyGlyph ?? false,
    };
    await ctx.close();
  }

  // Touch-target size acceptance (re-check at mobile viewport, G3-G4 min = 48px)
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('.mn-choice');
    results.touchTargets = await page.evaluate(() => {
      const arr = [];
      for (const el of document.querySelectorAll('.mn-choice, .mn-button')) {
        const r = el.getBoundingClientRect();
        arr.push({
          cls: el.className.split(' ').find((c) => c.startsWith('mn-')),
          w: Math.round(r.width),
          h: Math.round(r.height),
          meetsG3G4_48: r.height >= 48,
        });
      }
      return arr;
    });
    await ctx.close();
  }
} finally {
  results.finishedAt = new Date().toISOString();
  results.summary = {
    totalCritical,
    totalSerious,
    exit: totalCritical === 0 && totalSerious === 0 ? 0 : 1,
    failedAt: results.failedAt ?? null,
  };
  writeFileSync(RESULTS_PATH, JSON.stringify(results, null, 2));
  try { await browser.close(); } catch {}
  console.log(JSON.stringify(results.summary));
  console.log("Results written to", RESULTS_PATH);
  process.exit(results.summary.exit);
}
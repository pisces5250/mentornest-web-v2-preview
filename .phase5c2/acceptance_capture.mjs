// .phase5c2/acceptance_capture.mjs
//
// Phase 5C-2 acceptance — 3 flows × 3 viewports = 9 frames.
// Verify 0 critical / 0 serious axe-core violations.
//
// Flows:
//   1. open_text       (open_response with text composer)
//   2. voice_text_mode (voice_response, switched to text mode for screenshot)
//   3. english_voice   (voice_response with mic button)
//
// Viewports: desktop 1280×800, tablet 768×1024, mobile 375×667.
//
// Usage:
//   1. Start backend:  node server/open-response.mjs   (port 8787)
//   2. Start vite:     npm run dev:vite                 (port 5173)
//   3. Run:            node .phase5c2/acceptance_capture.mjs

import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, 'captures');
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

const VIEWPORTS = {
  desktop: { width: 1280, height: 800 },
  tablet:  { width: 768,  height: 1024 },
  mobile:  { width: 375,  height: 667 },
};

const FLOWS = [
  { name: 'open_text', qtype: 'open_response',
    ready: '[data-testid="open-response-submit"]' },
  { name: 'voice_text_mode', qtype: 'voice_response',
    ready: '[data-testid="switch-to-text"]',
    afterWait: async (page) => {
      await page.click('[data-testid="switch-to-text"]');
      await page.waitForSelector('[data-testid="open-response-composer"]', { timeout: 5000 });
    } },
  { name: 'english_voice', qtype: 'english_voice',
    ready: '[data-testid="voice-record-start"]' },
];

async function runFlow(browser, viewportName, viewport, flow) {
  const context = await browser.newContext({
    viewport,
    permissions: ['microphone'],
  });
  // Auto-grant mic permission for all frames
  await context.grantPermissions(['microphone'], { origin: new URL(APP_URL).origin });

  const page = await context.newPage();
  // Clear any leftover session storage so we land on home
  await page.goto(APP_URL);
  await page.evaluate(() => {
    try { localStorage.removeItem('mentornest.session.v1'); } catch {}
  });

  // Navigate to the acceptance override URL
  await page.goto(`${APP_URL}/?qtype=${flow.qtype}`);
  // Wait for home, then click start-session to enter the question
  await page.waitForSelector('[data-testid="start-session"]', { timeout: 15000 });
  await page.click('[data-testid="start-session"]');
  await page.waitForSelector(flow.ready, { timeout: 15000 });
  if (flow.afterWait) await flow.afterWait(page);
  await page.waitForTimeout(400);

  const outPath = path.join(OUT_DIR, `${viewportName}_${flow.name}.png`);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await page.screenshot({ path: outPath, fullPage: true });

  // Run axe on the visible page
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();

  await context.close();
  return { viewport: viewportName, flow: flow.name, file: outPath, violations: results.violations };
}

async function main() {
  const browser = await chromium.launch();
  const results = [];
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    for (const flow of FLOWS) {
      try {
        const r = await runFlow(browser, vpName, vp, flow);
        results.push(r);
      } catch (e) {
        results.push({ viewport: vpName, flow: flow.name, error: e.message });
      }
    }
  }
  await browser.close();

  // Report
  console.log('\n=== Phase 5C-2 Acceptance Report ===\n');
  let totalCritical = 0, totalSerious = 0, totalModerate = 0, totalMinor = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`❌ ${r.viewport} / ${r.flow}: ERROR — ${r.error}`);
      continue;
    }
    if (r.violations.length === 0) {
      console.log(`✅ ${r.viewport} / ${r.flow}: 0 violations  [${r.file}]`);
    } else {
      console.log(`${r.viewport} / ${r.flow}:`);
      for (const v of r.violations) {
        const n = v.nodes.length;
        console.log(`  ${v.impact === 'critical' ? '🛑' : v.impact === 'serious' ? '⚠️' : 'ℹ️'} ${v.impact}: ${v.id} — ${v.description}  (${n} nodes)`);
        if (v.impact === 'critical') totalCritical += n;
        if (v.impact === 'serious') totalSerious += n;
        if (v.impact === 'moderate') totalModerate += n;
        if (v.impact === 'minor') totalMinor += n;
      }
    }
  }
  console.log('\n=== TOTALS ===');
  console.log(`critical: ${totalCritical}, serious: ${totalSerious}, moderate: ${totalModerate}, minor: ${totalMinor}`);
  console.log(`captures: ${results.length}`);
  process.exit((totalCritical + totalSerious) === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error('Acceptance script error:', e);
  process.exit(1);
});
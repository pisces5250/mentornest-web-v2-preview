import { chromium } from 'playwright';
import fs from 'node:fs/promises';

const urls = [
  { url: 'https://mentornest-v2-preview.zeabur.app/', name: 'home' },
  { url: 'https://mentornest-v2-preview.zeabur.app/?qtype=open_response', name: 'open_response' },
  { url: 'https://mentornest-v2-preview.zeabur.app/?qtype=voice_response', name: 'voice_response' },
  { url: 'https://mentornest-v2-preview.zeabur.app/?qtype=english_voice', name: 'english_voice' },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

page.on('pageerror', (e) => console.log('[pageerror]', e.message));
page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('[err]', msg.text());
});

for (const { url, name } of urls) {
  console.log(`\n=== ${name}: ${url} ===`);
  await page.goto(url);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(2000);

  // Dump key testids
  const testIds = await page.evaluate(() => {
    const els = Array.from(document.querySelectorAll('[data-testid]'));
    return els.map((e) => e.getAttribute('data-testid'));
  });
  console.log('testIds:', testIds.slice(0, 10));

  await page.screenshot({ path: `/tmp/zeabur_${name}.png`, fullPage: false });
  console.log(`screenshot: /tmp/zeabur_${name}.png`);
}

await browser.close();
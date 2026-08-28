// /tmp/axe_debug.mjs — print full node HTML for each violation
import { chromium } from "playwright";
import axe from "axe-core";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
await page.goto("http://localhost:5181/", { waitUntil: "domcontentloaded" });
await page.waitForSelector('[data-testid="multiple-choice-basic"]');
await page.addScriptTag({ content: axe.source });

const result = await page.evaluate(async () => {
  const r = await axe.run(document, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa"] },
    resultTypes: ["violations"],
  });
  return r.violations.map((v) => ({
    id: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.map((n) => ({
      html: n.html.slice(0, 400),
      target: n.target,
      failureSummary: n.failureSummary?.slice(0, 400),
    })),
  }));
});

console.log(JSON.stringify(result, null, 2));
await browser.close();
/** Developer helper: print axe-core violations per route in a real browser. */
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { launchOptions } from './local-chromium.mjs';

const AXE = readFileSync(new URL('../node_modules/axe-core/axe.min.js', import.meta.url), 'utf8');
const base = process.env.BASE_URL || 'http://127.0.0.1:5199';
const routes = process.argv.slice(2);
const browser = await chromium.launch(launchOptions());
// The app ships a strict CSP that blocks inline script, which is the point.
// Accessibility tooling has to be injected, so the policy is bypassed for this
// developer-only audit, never in the application.
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, bypassCSP: true });
const page = await context.newPage();
for (const hash of routes) {
  await page.goto(`${base}/${hash}`);
  await page.waitForTimeout(400);
  await page.addScriptTag({ content: AXE });
  const violations = await page.evaluate(async () => {
    const result = await axe.run(document, { resultTypes: ['violations'] });
    return result.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' :: ' + n.failureSummary?.split('\n').slice(0, 2).join(' | ')) }));
  });
  console.log(`\n### ${hash} — ${violations.length} violation type(s)`);
  for (const v of violations) {
    console.log(`  ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes) console.log(`     - ${n}`);
  }
}
await browser.close();

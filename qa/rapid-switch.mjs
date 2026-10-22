import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { collectorInit } from '../perf/collector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const results = [];
  for (const profile of [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]) {
    const ctx = await browser.newContext({ viewport: profile.viewport, hasTouch: !!profile.hasTouch, isMobile: !!profile.isMobile, reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
    });
    await ctx.addInitScript(collectorInit);
    const page = await ctx.newPage();
    await page.goto(server.base + '/');
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll('.tab-btn')];
      let last = null;
      for (let i = 0; i < 10; i++) {
        last = tabs[(i + 1) % tabs.length];
        last.click();
        await new Promise((res) => setTimeout(res, 40));
      }
      const t0 = performance.now();
      await new Promise((res) => setTimeout(res, 300));
      const strictRunning = window.__perf.running(true);
      let quiet = null;
      let since = null;
      while (performance.now() - t0 < 6000) {
        if (window.__perf.running(true) === 0) {
          if (since === null) since = performance.now();
          if (performance.now() - since >= 300) { quiet = since - t0; break; }
        } else {
          since = null;
        }
        await new Promise((res) => requestAnimationFrame(res));
      }
      return {
        strictRunning,
        quietAfterMs: quiet === null ? null : Math.round(quiet),
        activeIsLast: last.getAttribute('aria-selected') === 'true',
        clampCleared: !document.querySelector('.lx-bar.lx-switching')
      };
    });
    results.push({ profile: profile.name, ...r, strictPass: r.strictRunning === 0, pass: r.quietAfterMs !== null && r.activeIsLast && r.clampCleared });
    await ctx.close();
  }
  await browser.close();
  await server.close();
  console.log(JSON.stringify(results));
  if (results.some((r) => !r.pass)) process.exit(1);
  if (process.argv.includes('--strict') && results.some((r) => !r.strictPass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { collectorInit } from '../perf/collector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMING = process.argv.includes('--timing');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const boost = (ctx) => ctx.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
});

const open = async (browser, base, opts = {}, url = '/') => {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', serviceWorkers: opts.noSw ? 'block' : 'allow' });
  await boost(ctx);
  await ctx.addInitScript(collectorInit);
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2500);
  return { ctx, page };
};

const versionSwitches = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
  const r = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('#appGrid .app-card')].filter((c) => c.querySelectorAll('.variant-chip').length > 1);
    const card = cards.find((c) => !c.querySelector('[data-ms^="g:"], [data-ms^="f:"]')) || cards[0];
    const t0 = performance.now();
    performance.mark('lx-in');
    const gaps = [];
    let last = performance.now();
    let stop = false;
    const loop = (ts) => { gaps.push(ts - last); last = ts; if (!stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    for (let i = 0; i < 20; i++) {
      const chips = [...card.querySelectorAll('.variant-chip')];
      (chips.find((c) => c.getAttribute('aria-checked') !== 'true') || chips[0]).click();
      await new Promise((res) => setTimeout(res, 140));
    }
    stop = true;
    performance.mark('lx-out');
    const reqs = performance.getEntriesByType('resource').filter((e) => e.startTime >= t0 && (e.initiatorType === 'img' || e.initiatorType === 'css' || /\.(png|jpe?g|webp|avif|svg|ico)(\?|$)/i.test(e.name))).length;
    return { reqs, worstGap: Math.max(...gaps.slice(2)) };
  });
  const trace = JSON.parse((await browser.stopTracing()).toString('utf8')).traceEvents;
  const a = trace.find((e) => e.name === 'lx-in');
  const b = trace.find((e) => e.name === 'lx-out');
  const decodes = a && b ? trace.filter((e) => (e.name === 'Decode Image' || e.name === 'ImageDecodeTask') && e.ts >= a.ts && e.ts <= b.ts).length : null;
  record('20 version switches: no image requests', r.reqs === 0, { requests: r.reqs });
  record('20 version switches: no image decodes', decodes === 0, { decodes });
  if (TIMING) record('20 version switches: no frame over 32 ms (desktop)', r.worstGap <= 32, { worstFrameMs: Math.round(r.worstGap) });
  await ctx.close();
};

const legacyMotion = async (browser, base) => {
  const probe = async (query) => {
    const { ctx, page } = await open(browser, base, {}, '/' + query);
    const info = await page.evaluate(() => ({
      motion: document.documentElement.dataset.motion || null,
      version: getComputedStyle(document.documentElement).getPropertyValue('--lx-version-ms').trim(),
      boot: getComputedStyle(document.documentElement).getPropertyValue('--lx-boot-ms').trim(),
      saved: Object.keys(localStorage).filter((k) => /motion/i.test(k))
    }));
    const outMs = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll('.tab-btn')];
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      tabs[(i + 1) % tabs.length].click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = document.getAnimations().filter((a) => { const t = a.effect && a.effect.target; return t && t.closest && t.closest('.grid-ghost'); }).map((a) => a.effect.getComputedTiming().duration);
      return out.length ? Math.max(...out) : null;
    });
    await ctx.close();
    return { ...info, outMs };
  };
  const legacy = await probe('?motion=legacy');
  const current = await probe('');
  record('?motion=legacy sets data-motion and the legacy timings', legacy.motion === 'legacy' && legacy.version === '240ms' && legacy.boot === '' && legacy.outMs === 190 && legacy.saved.length === 0, legacy);
  record('default motion uses the new timings', current.motion === null && current.version === '120ms' && current.boot === '360ms' && current.outMs === 120, current);
};

const manifestRefresh = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { mobile: true, noSw: true, viewport: { width: 390, height: 844 } });
  await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('lx-icons')); m.hash = '00000000'; localStorage.setItem('lx-icons', JSON.stringify(m)); });
  const manifestUrl = /icons\/manifest\.v2\.json$/;
  await page.route(manifestUrl, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const link = document.querySelectorAll('#appGrid .card-link-overlay')[2];
    link.focus();
    window.scrollTo(0, 120);
    return { focusId: link.href, y: Math.round(window.scrollY), sig: JSON.parse(localStorage.getItem('lx-icons')).hash };
  });
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => ({ focusId: document.activeElement && document.activeElement.href, y: Math.round(window.scrollY), sig: JSON.parse(localStorage.getItem('lx-icons')).hash }));
  const changed = before.sig === '00000000' && after.sig !== '00000000';
  record('focus and scroll are kept after a manifest hash change', changed && after.focusId === before.focusId && Math.abs(after.y - before.y) <= 1, { before, after });
  await ctx.close();
};

const reducedMotion = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { reduced: true });
  const quiet = () => page.evaluate(async () => { await new Promise((r) => setTimeout(r, 450)); return window.__perf.running(true); });
  const left = {};
  await page.evaluate(() => { const t = [...document.querySelectorAll('.tab-btn')]; const i = t.findIndex((x) => x.getAttribute('aria-selected') === 'true'); t[(i + 1) % t.length].click(); });
  left.tab = await quiet();
  await page.keyboard.press('Alt+KeyV');
  left.view = await quiet();
  await page.evaluate(() => { const c = [...document.querySelectorAll('#appGrid .app-card')].find((x) => x.querySelectorAll('.variant-chip').length > 1); if (c) [...c.querySelectorAll('.variant-chip')].find((x) => x.getAttribute('aria-checked') !== 'true').click(); });
  left.version = await quiet();
  await page.keyboard.press('Alt+KeyP');
  left.colors = await quiet();
  await page.keyboard.press('Control+KeyK');
  left.paletteOpen = await quiet();
  await page.keyboard.press('Escape');
  left.paletteClose = await quiet();
  record('reduced motion leaves no running animations after any interaction', Object.values(left).every((n) => n === 0), left);
  await ctx.close();
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  for (const step of [versionSwitches, legacyMotion, manifestRefresh, reducedMotion]) {
    try { await step(browser, server.base); } catch (e) { record(step.name, false, { error: String(e.message || e).slice(0, 200) }); }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

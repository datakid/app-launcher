import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMING = process.argv.includes('--timing');
const rootArg = process.argv.find((a) => a.startsWith('--root='));
const LIMITS = { p95: 18, p95Throttled: 34, loaf: 100 };
const VIEWS = ['bento', 'list', 'icons'];
const THROTTLES = [1, 4];
const STEPS = 8;

const sampler = () => {
  const state = { deltas: [], loaf: [], on: false };
  window.__smooth = state;
  let last = 0;
  const tick = (t) => {
    if (state.on) {
      if (last) state.deltas.push(t - last);
      last = t;
    } else {
      last = 0;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => { for (const e of list.getEntries()) if (state.on) state.loaf.push(e.duration); }).observe({ type: 'long-animation-frame', buffered: false });
  } catch (e) {}
};

const percentile = (values, p) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};

const sampled = async (page, run) => {
  await page.evaluate(() => { window.__smooth.deltas = []; window.__smooth.loaf = []; window.__smooth.on = true; });
  await run();
  await page.waitForTimeout(120);
  const data = await page.evaluate(() => { window.__smooth.on = false; return { deltas: window.__smooth.deltas.slice(), loaf: window.__smooth.loaf.slice() }; });
  const r = (v) => Math.round(v * 100) / 100;
  return {
    frames: data.deltas.length,
    p50: r(percentile(data.deltas, 0.5)),
    p95: r(percentile(data.deltas, 0.95)),
    max: r(Math.max(0, ...data.deltas)),
    loaf50: data.loaf.filter((d) => d > 50).length,
    loafMax: r(Math.max(0, ...data.loaf))
  };
};

const tileCentres = (page) => page.evaluate(() => {
  const els = [...document.querySelectorAll('#appGrid .app-card')].filter((el) => el.getClientRects().length);
  const boxes = els.map((el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top }; })
    .filter((b) => b.y > 0 && b.y < innerHeight && b.x > 0 && b.x < innerWidth);
  const rows = [];
  boxes.sort((a, b) => a.top - b.top || a.x - b.x);
  for (const b of boxes) {
    const row = rows.find((r) => Math.abs(r.top - b.top) < 24);
    if (row) row.items.push(b); else rows.push({ top: b.top, items: [b] });
  }
  return rows.flatMap((r, i) => (i % 2 ? r.items.sort((a, b) => b.x - a.x) : r.items.sort((a, b) => a.x - b.x)).map((b) => ({ x: b.x, y: b.y })));
});

const sweep = async (page) => {
  const points = await tileCentres(page);
  for (const p of points) await page.mouse.move(p.x, p.y, { steps: STEPS });
  await page.mouse.move(8, 8);
};

const paletteCycle = async (page) => {
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Control+KeyK');
    await page.waitForTimeout(320);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(260);
  }
};

const tabCycle = async (page) => {
  const ids = await page.evaluate(() => [...document.querySelectorAll('#tabRail .tab-btn')].map((b) => b.id));
  for (let i = 0; i < 10; i++) {
    await page.click(`#${ids[(i + 1) % ids.length]}`);
    await page.waitForTimeout(520);
  }
};

const SCENARIOS = [
  { name: 'hover-sweep', run: sweep },
  { name: 'palette-x10', run: paletteCycle },
  { name: 'tabs-x10', run: tabCycle }
];

const main = async () => {
  const server = await startServer(rootArg ? path.resolve(rootArg.slice(7)) : siteRoot(root));
  const browser = await chromium.launch();
  const rows = [];
  const errors = [];
  for (const view of VIEWS) {
    for (const rate of THROTTLES) {
      for (const scenario of SCENARIOS) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'block' });
        await ctx.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
          Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
        });
        await ctx.addInitScript((v) => { try { localStorage.setItem('lx-view', v); localStorage.setItem('lx-zen', '0'); localStorage.setItem('lx-lang', 'en'); localStorage.setItem('lx-theme', 'light'); } catch (e) {} }, view);
        await ctx.addInitScript(sampler);
        const page = await ctx.newPage();
        page.on('pageerror', (e) => errors.push(e.message));
        await page.goto(`${server.base}/?view=${view}#core`);
        await page.waitForSelector('#appGrid .app-card');
        await page.waitForTimeout(1600);
        await page.mouse.move(8, 8);
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await sampled(page, () => scenario.run(page).catch(() => {}));
        const result = await sampled(page, () => scenario.run(page));
        rows.push({ view, scenario: scenario.name, throttle: rate, ...result });
        await ctx.close();
      }
    }
  }
  await browser.close();
  await server.close();

  rows.forEach((r) => console.log(`${r.view.padEnd(6)} ${r.scenario.padEnd(12)} x${r.throttle} frames ${String(r.frames).padStart(4)} p50 ${r.p50} p95 ${r.p95} max ${r.max} loaf>50 ${r.loaf50} loafMax ${r.loafMax}`));
  const failing = TIMING ? rows.filter((r) => r.p95 > (r.throttle > 1 ? LIMITS.p95Throttled : LIMITS.p95) || r.loafMax > LIMITS.loaf || r.frames < 20) : [];
  console.log(JSON.stringify({ timing: TIMING, limits: LIMITS, scenarios: rows.length, failing: failing.length, errors }));
  if (errors.length || failing.length) {
    failing.forEach((r) => console.log('SLOW', r.view, r.scenario, `x${r.throttle}`, `p95 ${r.p95}`, `loafMax ${r.loafMax}`, `frames ${r.frames}`));
    process.exit(1);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });

import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { siteRoot } from './site-root.mjs';
import { collectorInit } from './collector.mjs';
import { INTERACTIONS, NAMES, settleIdle } from './interactions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };

const CI = !!process.env.CI;
const RUNS = Number(opt('--runs', CI ? 4 : 7));
const ONLY = opt('--only', null);
const ONLY_PROFILE = opt('--profile', null);
const OUT = opt('--out', path.join(here, 'out', 'latest.json'));
const WITH_DECODES = !flag('--no-decodes');
const LOW_END = flag('--lowend');
const IMG_EXT = /\.(png|jpe?g|gif|webp|avif|jxl|svg|ico)(\?|$)/i;

const PROFILES = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, cpu: 4 },
  desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, cpu: 1 }
};

const median = (a) => {
  const v = a.filter((x) => typeof x === 'number' && Number.isFinite(x)).sort((x, y) => x - y);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const worst = (a) => {
  const v = a.filter((x) => typeof x === 'number' && Number.isFinite(x));
  return v.length ? Math.max(...v) : null;
};
const round = (x) => (typeof x === 'number' ? Math.round(x * 100) / 100 : x);

const compute = (raw, def) => {
  if (raw.inputT === null) return null;
  const inputT = raw.inputT;
  const frames = raw.frames.filter((f) => f.t >= inputT);
  if (!frames.length) return null;
  let windowEnd;
  let settleMs = null;
  let settleCoreMs = null;
  let settleGridMs = null;
  if (def.mode === 'fixed') {
    windowEnd = inputT + def.fixedMs;
  } else {
    let lastRunning = null;
    for (const f of frames) if (f.running > 0) lastRunning = f.t;
    const after = lastRunning === null ? frames[0] : frames.find((f) => f.t > lastRunning);
    const settleT = after ? after.t : frames[frames.length - 1].t;
    settleMs = settleT - inputT;
    windowEnd = settleT + 100;
    let lastCore = null;
    for (const f of frames) if (f.core > 0) lastCore = f.t;
    const afterCore = lastCore === null ? frames[0] : frames.find((f) => f.t > lastCore);
    settleCoreMs = (afterCore ? afterCore.t : frames[frames.length - 1].t) - inputT;
    let lastGrid = null;
    for (const f of frames) if (f.grid > 0) lastGrid = f.t;
    const afterGrid = lastGrid === null ? frames[0] : frames.find((f) => f.t > lastGrid);
    settleGridMs = (afterGrid ? afterGrid.t : frames[frames.length - 1].t) - inputT;
  }
  const win = frames.filter((f) => f.t <= windowEnd);
  const gaps = [];
  for (let i = 1; i < win.length; i++) gaps.push(win[i].t - win[i - 1].t);
  const med = median(gaps);
  let readableMs = null;
  let sawLow = false;
  for (const f of win) {
    if (typeof f.op === 'number' && f.op < 0.6) sawLow = true;
    if ((sawLow || !f.same) && typeof f.op === 'number' && f.op >= 0.6) { readableMs = f.t - inputT; break; }
  }
  const ev = raw.events.find((e) => e.name === def.trigger.type && Math.abs(e.startTime - inputT) < 4);
  let interactionMs = null;
  if (def.mode !== 'fixed') interactionMs = ev ? ev.duration : 8;
  const longTasks = raw.loaf.filter((l) => l.duration > 50 && l.startTime + l.duration >= inputT && l.startTime <= windowEnd).length;
  const imageRequests = raw.resources.filter((r) => r.startTime >= inputT && r.startTime <= windowEnd && (r.initiatorType === 'img' || r.initiatorType === 'css' || IMG_EXT.test(r.name))).length;
  return {
    interactionMs,
    settleMs,
    settleCoreMs,
    settleGridMs,
    readableMs: def.mode === 'fixed' ? null : readableMs,
    longTasks,
    worstFrameMs: gaps.length ? Math.max(...gaps) : null,
    medianFrameMs: med,
    droppedFrames: med ? gaps.filter((g) => g > 1.5 * med).length : null,
    imageRequests,
    imageDecodes: null
  };
};

const countDecodes = (traceBuf) => {
  let json;
  try { json = JSON.parse(traceBuf.toString('utf8')); } catch (e) { return null; }
  const evs = Array.isArray(json) ? json : json.traceEvents || [];
  const inn = evs.find((e) => e.name === 'lx-in');
  const out = evs.find((e) => e.name === 'lx-out');
  if (!inn || !out) return null;
  return evs.filter((e) => (e.name === 'Decode Image' || e.name === 'ImageDecodeTask') && e.ts >= inn.ts && e.ts <= out.ts && (e.ph === 'X' || e.ph === 'B' || e.ph === 'b')).length;
};

const newPage = async (browser, base, profile, url) => {
  const p = PROFILES[profile];
  const ctx = await browser.newContext({ viewport: p.viewport, hasTouch: p.hasTouch, isMobile: p.isMobile, reducedMotion: 'no-preference' });
  await ctx.addInitScript(([hc, dm]) => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => hc });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => dm });
  }, LOW_END ? [2, 2] : [8, 8]);
  await ctx.addInitScript(collectorInit);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  if (p.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: p.cpu });
  await page.goto(`${base}${url}`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  await settleIdle(page);
  return { ctx, page };
};

const sample = async (page, def) => {
  if (def.prepare) await def.prepare(page);
  const cfg = { trigger: def.trigger, mode: def.mode, fixedMs: def.fixedMs || 0, maxMs: 3000 };
  const done = page.evaluate((c) => window.__perf.begin(c), cfg);
  await page.waitForTimeout(30);
  await def.run(page);
  const raw = await done;
  if (def.after) await def.after(page);
  else await settleIdle(page);
  return raw;
};

const measureProfile = async (browser, base, profile) => {
  const res = {};
  for (const name of NAMES) {
    if (ONLY && name !== ONLY) continue;
    const def = INTERACTIONS[name];
    const { ctx, page } = await newPage(browser, base, profile, '/' + (process.env.LX_PERF_QUERY || ''));
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const raw = await sample(page, def);
      const m = compute(raw, def);
      if (m && i > 0) runs.push(m);
    }
    await ctx.close();
    if (WITH_DECODES) {
      const dec = await newPage(browser, base, profile, '/' + (process.env.LX_PERF_QUERY || ''));
      const counts = [];
      for (let i = 0; i < RUNS; i++) {
        await browser.startTracing(dec.page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
        await sample(dec.page, def);
        const buf = await browser.stopTracing();
        if (i > 0) counts.push(countDecodes(buf));
      }
      await dec.ctx.close();
      runs.forEach((r, i) => { r.imageDecodes = counts[i] ?? null; });
    }
    const metrics = {};
    for (const k of Object.keys(runs[0] || {})) {
      const vals = runs.map((r) => r[k]);
      metrics[k] = { median: round(median(vals)), worst: round(worst(vals)) };
    }
    res[name] = metrics;
    console.log(profile, name, JSON.stringify(Object.fromEntries(Object.entries(metrics).map(([k, v]) => [k, v.median]))));
  }
  return res;
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const out = {};
  for (const profile of Object.keys(PROFILES)) {
    if (ONLY_PROFILE && profile !== ONLY_PROFILE) continue;
    out[profile] = await measureProfile(browser, server.base, profile);
  }
  await browser.close();
  await server.close();
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out, null, 2) + '\n');
  await fs.writeFile(path.join(path.dirname(OUT), 'meta.json'), JSON.stringify({ runs: RUNS, lowEnd: LOW_END, decodes: WITH_DECODES, playwright: (await import('playwright/package.json', { with: { type: 'json' } })).default.version, generatedAt: new Date().toISOString() }, null, 2) + '\n');

  if (flag('--compare')) {
    let base;
    try { base = JSON.parse(await fs.readFile(path.join(here, 'baseline.json'), 'utf8')); } catch (e) { base = null; }
    if (base) {
      for (const p of Object.keys(out)) for (const i of Object.keys(out[p])) for (const m of Object.keys(out[p][i])) {
        const a = base[p]?.[i]?.[m]; const b = out[p][i][m];
        for (const s of ['median', 'worst']) {
          if (typeof a?.[s] === 'number' && typeof b?.[s] === 'number' && b[s] > a[s] * 1.05 && b[s] - a[s] > 0.5) console.log('REGRESSION', p, i, m, s, a[s], '->', b[s]);
        }
      }
    }
  }

  if (flag('--assert')) {
    const TIMING = new Set(['interactionMs', 'settleMs', 'settleCoreMs', 'settleGridMs', 'readableMs', 'longTasks', 'worstFrameMs', 'medianFrameMs', 'droppedFrames']);
    let targets = {};
    try { targets = JSON.parse(await fs.readFile(path.join(here, 'targets.json'), 'utf8')); } catch (e) { targets = {}; }
    const misses = [];
    for (const p of Object.keys(targets)) for (const i of Object.keys(targets[p])) for (const m of Object.keys(targets[p][i])) for (const s of Object.keys(targets[p][i][m])) {
      if (CI && TIMING.has(m)) continue;
      const got = out[p]?.[i]?.[m]?.[s];
      const max = targets[p][i][m][s];
      if (typeof got !== 'number' || got > max) misses.push(`${p}.${i}.${m}.${s}: ${got} > ${max}`);
    }
    if (misses.length) { misses.forEach((x) => console.log('MISS', x)); process.exit(1); }
  }
};

main().catch((e) => { console.error(e); process.exit(1); });

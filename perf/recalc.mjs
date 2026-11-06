import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from './browser.mjs';
import { startServer } from './server.mjs';
import { siteRoot } from './site-root.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const opt = (name, fallback) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : fallback; };
const list = (name, fallback) => String(opt(name, fallback)).split(',').map((s) => s.trim()).filter(Boolean);

const RUNS = Number(opt('--runs', 9));
const TRACE_RUNS = Number(opt('--trace-runs', 3));
const WARMUPS = Number(opt('--warmups', 1));
const DWELL = Number(opt('--dwell', 140));
const OUT_DIR = path.resolve(opt('--out-dir', path.join(here, 'out')));
const BASE = { label: opt('--base-label', 'main'), dir: path.resolve(opt('--base', path.join(root, '..', 'lx-main', 'dist'))) };
const HEAD = { label: opt('--head-label', 'head'), dir: path.resolve(opt('--head', siteRoot(root))) };
const REUSE_BASE = flag('--reuse-base');
const MERGE = flag('--merge');
const SKIP_DONE = flag('--skip-done');
const COMPARE_ONLY = flag('--compare-only');

const PROFILES = {
  desktop: { viewport: { width: 1280, height: 800 }, touch: false, cpu: 1 },
  'desktop-4x': { viewport: { width: 1280, height: 800 }, touch: false, cpu: 4 },
  mobile: { viewport: { width: 390, height: 844 }, touch: true, cpu: 1 },
  'mobile-4x': { viewport: { width: 390, height: 844 }, touch: true, cpu: 4 }
};

const METRICS = ['RecalcStyleCount', 'RecalcStyleDuration', 'LayoutCount', 'LayoutDuration', 'ScriptDuration', 'TaskDuration'];
const TRACE_CATEGORIES = ['devtools.timeline', 'disabled-by-default-devtools.timeline'];

const snapshot = async (cdp) => {
  const { metrics } = await cdp.send('Performance.getMetrics');
  const out = {};
  for (const m of metrics) if (METRICS.includes(m.name)) out[m.name] = m.value;
  return out;
};

const settle = async (page, pad = 100) => {
  await page.waitForFunction(() => !document.getAnimations().some((a) => a.playState === 'running' && a.effect && a.effect.getComputedTiming().iterations !== Infinity), null, { polling: 50, timeout: 10000 });
  await page.waitForTimeout(pad);
};

const currentView = (page) => page.evaluate(() => document.getElementById('appGrid').dataset.layout || 'bento');

const setView = async (page, view) => {
  for (let i = 0; i < 4 && (await currentView(page)) !== view; i += 1) {
    await page.keyboard.press('Alt+KeyV');
    await settle(page, 150);
  }
  if ((await currentView(page)) !== view) throw new Error(`cannot reach view ${view}`);
};

const tilePoints = (page) => page.evaluate(() => {
  const cards = [...document.querySelectorAll('#appGrid .app-card')]
    .map((c) => c.getBoundingClientRect())
    .filter((r) => r.width > 0 && r.height > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth)
    .map((r) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2, row: Math.round(r.top / 24) }));
  const rows = [...new Set(cards.map((c) => c.row))].sort((a, b) => a - b);
  return rows.flatMap((row, i) => {
    const cells = cards.filter((c) => c.row === row).sort((a, b) => a.x - b.x);
    return i % 2 ? cells.reverse() : cells;
  });
});

const tabCount = (page) => page.locator('.tab-btn').count();

const hoverSweep = async (page, win) => {
  const tabs = await tabCount(page);
  for (let t = 0; t < tabs; t += 1) {
    await page.locator('.tab-btn').nth(t).click();
    await page.mouse.move(2, 2);
    await settle(page, 250);
    const points = await tilePoints(page);
    await win.start();
    for (const p of points) {
      await page.mouse.move(p.x, p.y, { steps: 3 });
      await page.waitForTimeout(DWELL);
    }
    await win.stop();
    await page.mouse.move(2, 2);
    await settle(page, 150);
  }
};

const paletteCycles = async (page, win) => {
  await win.start();
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('Control+KeyK');
    await settle(page, 120);
    await page.keyboard.press('Escape');
    await settle(page, 120);
  }
  await win.stop();
};

const tabSwitches = async (page, win) => {
  const tabs = await tabCount(page);
  await win.start();
  for (let i = 1; i <= 10; i += 1) {
    await page.locator('.tab-btn').nth(i % tabs).click();
    await settle(page, 150);
  }
  await win.stop();
};

const viewSwitches = async (page, win) => {
  await win.start();
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('Alt+KeyV');
    await settle(page, 150);
  }
  await win.stop();
};

const lookCycle = async (page, win) => {
  await win.start();
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Alt+KeyP');
    await settle(page, 150);
  }
  await win.stop();
};

const SCENARIOS = {
  'hover-bento': { view: 'bento', run: hoverSweep },
  'hover-list': { view: 'list', run: hoverSweep },
  'hover-icons': { view: 'icons', run: hoverSweep },
  'palette-cycles': { view: 'bento', run: paletteCycles },
  'tab-switches': { view: 'bento', run: tabSwitches },
  'view-switches': { view: 'bento', run: viewSwitches },
  'look-cycle': { view: 'bento', run: lookCycle }
};

const startTrace = async (browser) => {
  const session = await browser.newBrowserCDPSession();
  const events = [];
  session.on('Tracing.dataCollected', (e) => { for (const ev of e.value) events.push(ev); });
  const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve));
  await session.send('Tracing.start', { traceConfig: { recordMode: 'recordAsMuchAsPossible', includedCategories: TRACE_CATEGORIES }, transferMode: 'ReportEvents' });
  return async () => {
    await session.send('Tracing.end');
    await complete;
    await session.detach();
    return events;
  };
};

const tally = (events) => {
  const stamps = events.filter((e) => e.name === 'TimeStamp' && e.args && e.args.data).map((e) => ({ ts: e.ts, msg: e.args.data.message })).sort((a, b) => a.ts - b.ts);
  const windows = [];
  let open = null;
  for (const s of stamps) {
    if (s.msg === 'lx:start') open = s.ts;
    else if (s.msg === 'lx:end' && open !== null) { windows.push([open, s.ts]); open = null; }
  }
  const out = { elementsRestyled: 0, styleEvents: 0, styleTraceMs: 0 };
  for (const e of events) {
    if (e.name !== 'UpdateLayoutTree' || e.ph !== 'X') continue;
    if (!windows.some(([a, b]) => e.ts >= a && e.ts <= b)) continue;
    out.elementsRestyled += (e.args && e.args.elementCount) || 0;
    out.styleEvents += 1;
    out.styleTraceMs += (e.dur || 0) / 1000;
  }
  return out;
};

const runOnce = async (browser, base, profile, name, traced) => {
  const def = SCENARIOS[name];
  const prof = PROFILES[profile];
  const ctx = await browser.newContext({ viewport: prof.viewport, hasTouch: prof.touch, isMobile: prof.touch, reducedMotion: 'no-preference', serviceWorkers: 'block', locale: 'en-US' });
  try {
    const page = await ctx.newPage();
    const cdp = await ctx.newCDPSession(page);
    await page.goto(base + '/', { waitUntil: 'load' });
    await page.waitForSelector('#appGrid .app-card');
    await page.evaluate(() => document.fonts.ready);
    await settle(page, 600);
    await setView(page, def.view);
    await settle(page, 400);
    await page.mouse.move(2, 2);
    if (prof.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: prof.cpu });
    await cdp.send('Performance.enable');
    const acc = Object.fromEntries(METRICS.map((m) => [m, 0]));
    let before = null;
    const win = {
      start: async () => {
        if (traced) await page.evaluate(() => console.timeStamp('lx:start'));
        before = await snapshot(cdp);
      },
      stop: async () => {
        const after = await snapshot(cdp);
        if (traced) await page.evaluate(() => console.timeStamp('lx:end'));
        for (const m of METRICS) acc[m] += after[m] - before[m];
      }
    };
    const endTrace = traced ? await startTrace(browser) : null;
    await def.run(page, win);
    if (traced) return { trace: tally(await endTrace()) };
    return {
      metrics: {
        RecalcStyleCount: acc.RecalcStyleCount,
        RecalcStyleDuration: acc.RecalcStyleDuration * 1000,
        LayoutCount: acc.LayoutCount,
        LayoutDuration: acc.LayoutDuration * 1000,
        ScriptDuration: acc.ScriptDuration * 1000,
        TaskDuration: acc.TaskDuration * 1000
      }
    };
  } finally {
    await ctx.close();
  }
};

const median = (a) => {
  const v = [...a].sort((x, y) => x - y);
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};

const stat = (samples) => {
  const med = median(samples);
  const lo = Math.min(...samples);
  const hi = Math.max(...samples);
  return { median: med, min: lo, max: hi, spreadPct: med ? ((hi - lo) / med) * 100 : 0, n: samples.length, samples };
};

const summarise = (raw) => {
  const out = { metrics: {}, trace: {} };
  for (const [k, v] of Object.entries(raw.metrics)) out.metrics[k] = stat(v);
  for (const [k, v] of Object.entries(raw.trace)) out.trace[k] = stat(v);
  return out;
};

const pushSample = (bucket, kind, result) => {
  for (const [k, v] of Object.entries(result)) (bucket[kind][k] ||= []).push(v);
};

const metaFor = (profiles, scenarios) => ({
  date: new Date().toISOString(),
  node: process.version,
  cpus: os.cpus().length,
  runs: RUNS,
  traceRuns: TRACE_RUNS,
  warmups: WARMUPS,
  dwellMs: DWELL,
  interleaved: !REUSE_BASE,
  profiles,
  scenarios
});

const run = async () => {
  const profiles = list('--profiles', Object.keys(PROFILES).join(','));
  const scenarios = list('--scenarios', Object.keys(SCENARIOS).join(','));
  for (const p of profiles) if (!PROFILES[p]) throw new Error(`unknown profile ${p}`);
  for (const s of scenarios) if (!SCENARIOS[s]) throw new Error(`unknown scenario ${s}`);

  const sides = REUSE_BASE ? [HEAD] : [BASE, HEAD];
  const done = {};
  for (const side of sides) done[side.label] = (SKIP_DONE && (await loadSide(side.label))?.results) || {};
  const isDone = (profile, name) => sides.every((side) => done[side.label][profile]?.[name]);

  const servers = {};
  for (const side of sides) servers[side.label] = await startServer(side.dir);
  const browser = await launchBrowser();
  const meta = metaFor(profiles, scenarios);
  const started = Date.now();

  for (const profile of profiles) {
    for (const name of scenarios) {
      if (isDone(profile, name)) { process.stderr.write(`skip ${profile} ${name} (already measured)\n`); continue; }
      const buckets = {};
      for (const side of sides) buckets[side.label] = { metrics: {}, trace: {} };
      for (let r = -WARMUPS; r < RUNS; r += 1) {
        const order = r % 2 === 0 ? sides : [...sides].reverse();
        for (const side of order) {
          const res = await runOnce(browser, servers[side.label].base, profile, name, false);
          if (r >= 0) pushSample(buckets[side.label], 'metrics', res.metrics);
        }
      }
      for (let r = 0; r < TRACE_RUNS; r += 1) {
        const order = r % 2 === 0 ? sides : [...sides].reverse();
        for (const side of order) {
          const res = await runOnce(browser, servers[side.label].base, profile, name, true);
          pushSample(buckets[side.label], 'trace', res.trace);
        }
      }
      for (const side of sides) await saveSide(side.label, meta, { [profile]: { [name]: summarise(buckets[side.label]) } });
      const mins = ((Date.now() - started) / 60000).toFixed(1);
      process.stderr.write(`[${mins} min] ${profile} ${name} saved\n`);
    }
  }
  await browser.close();
  for (const side of sides) await servers[side.label].close();
};

const sideFile = (label) => path.join(OUT_DIR, `recalc-${label}.json`);

const loadSide = async (label) => {
  try { return JSON.parse(await fs.readFile(sideFile(label), 'utf8')); } catch (e) { return null; }
};

const saveSide = async (label, meta, results) => {
  const prior = MERGE || SKIP_DONE ? await loadSide(label) : null;
  const merged = prior ? prior.results : {};
  for (const [profile, byName] of Object.entries(results)) Object.assign((merged[profile] ||= {}), byName);
  const runMeta = { ...(prior ? prior.meta : {}), ...meta, profiles: Object.keys(merged), scenarios: [...new Set(Object.values(merged).flatMap((m) => Object.keys(m)))] };
  await fs.writeFile(sideFile(label), JSON.stringify({ label, meta: runMeta, results: merged }, null, 1));
};

const fmt = (n, digits) => (Math.abs(n) >= 100 || digits === 0 ? Math.round(n).toString() : n.toFixed(digits));

const delta = (a, b) => (a === 0 ? (b === 0 ? 0 : Infinity) : ((b - a) / a) * 100);

const pct = (d) => (Number.isFinite(d) ? `${d >= 0 ? '+' : ''}${d.toFixed(1)}%` : 'n/a');

const COLUMNS = [
  ['restyled', 'trace', 'elementsRestyled', 0],
  ['recalcs', 'metrics', 'RecalcStyleCount', 0],
  ['recalc ms', 'metrics', 'RecalcStyleDuration', 1],
  ['layout ms', 'metrics', 'LayoutDuration', 1],
  ['script ms', 'metrics', 'ScriptDuration', 1],
  ['task ms', 'metrics', 'TaskDuration', 1]
];

const compare = (base, head) => {
  const rows = [];
  const lines = [];
  for (const profile of Object.keys(PROFILES)) {
    if (!base.results[profile] || !head.results[profile]) continue;
    const names = Object.keys(SCENARIOS).filter((n) => base.results[profile][n] && head.results[profile][n]);
    if (!names.length) continue;
    lines.push(`### ${profile}`, '', `| scenario | ${COLUMNS.map((c) => c[0]).join(' | ')} |`, `|---|${COLUMNS.map(() => '---').join('|')}|`);
    for (const name of names) {
      const ra = base.results[profile][name];
      const rb = head.results[profile][name];
      const cells = [];
      const row = { profile, scenario: name };
      for (const [label, kind, key, digits] of COLUMNS) {
        const sa = ra[kind][key];
        const sb = rb[kind][key];
        const d = delta(sa.median, sb.median);
        row[label] = { base: sa.median, head: sb.median, deltaPct: d, baseSpreadPct: sa.spreadPct, headSpreadPct: sb.spreadPct };
        cells.push(`${fmt(sa.median, digits)} → ${fmt(sb.median, digits)} (${pct(d)})`);
      }
      rows.push(row);
      lines.push(`| ${name} | ${cells.join(' | ')} |`);
    }
    lines.push('');
  }
  return { rows, markdown: lines.join('\n') };
};

const assertTargets = (rows) => {
  const failures = [];
  for (const row of rows) {
    if (row.restyled.deltaPct > 0) failures.push(`${row.profile} ${row.scenario}: elements restyled ${pct(row.restyled.deltaPct)}`);
    if (row['recalc ms'].deltaPct > 0) failures.push(`${row.profile} ${row.scenario}: recalc ms ${pct(row['recalc ms'].deltaPct)}`);
    if (row['task ms'].deltaPct > 5) failures.push(`${row.profile} ${row.scenario}: task ms ${pct(row['task ms'].deltaPct)}`);
  }
  return failures;
};

const main = async () => {
  if (!COMPARE_ONLY) {
    await fs.mkdir(OUT_DIR, { recursive: true });
    if (!MERGE && !SKIP_DONE) for (const side of REUSE_BASE ? [HEAD] : [BASE, HEAD]) await fs.rm(sideFile(side.label), { force: true });
    await run();
  }
  const base = await loadSide(BASE.label);
  const head = await loadSide(HEAD.label);
  if (!base || !head) throw new Error(`missing results for ${!base ? BASE.label : HEAD.label} in ${OUT_DIR}`);
  const { rows, markdown } = compare(base, head);
  const header = `${BASE.label} → ${HEAD.label}  runs=${head.meta.runs} trace-runs=${head.meta.traceRuns} interleaved=${head.meta.interleaved}`;
  await fs.writeFile(path.join(OUT_DIR, 'recalc-compare.json'), JSON.stringify({ base: BASE.label, head: HEAD.label, meta: head.meta, rows }, null, 1));
  await fs.writeFile(path.join(OUT_DIR, 'recalc-compare.md'), `${header}\n\n${markdown}`);
  console.log(`${header}\n`);
  console.log(markdown);
  if (flag('--assert')) {
    const failures = assertTargets(rows);
    if (failures.length) {
      console.error(`recalc: ${failures.length} target(s) missed`);
      for (const f of failures) console.error('  ' + f);
      process.exit(1);
    }
    console.log('recalc: all targets met');
  }
};

main().catch((e) => { console.error(e); process.exit(1); });

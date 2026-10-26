import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { collectorInit } from '../perf/collector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const boost = (ctx) => ctx.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
});

const open = async (browser, base, view, tab, opts = {}) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await boost(ctx);
  await ctx.addInitScript(collectorInit);
  await ctx.addInitScript((v) => { try { localStorage.setItem('lx-view', v); localStorage.setItem('lx-zen', '0'); localStorage.setItem('lx-lang', 'en'); } catch (e) {} }, view);
  if (opts.noVT) await ctx.addInitScript(() => { delete Document.prototype.startViewTransition; });
  const page = await ctx.newPage();
  await page.goto(`${base}/#${tab}`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => window.__perf.running(true) === 0, null, { timeout: 15000, polling: 100 }).catch(() => {});
  return { ctx, page };
};

const settle = async (page) => {
  await page.waitForTimeout(250);
  await page.waitForFunction(() => !document.documentElement.classList.contains('is-zen-transitioning') && window.__perf.running(true) === 0, null, { timeout: 15000, polling: 100 }).catch(() => {});
  await page.waitForTimeout(500);
};

const measure = (page) => page.evaluate(() => {
  const g = document.getElementById('appGrid');
  const cs = getComputedStyle(g);
  const bar = document.querySelector('.lx-bar').getBoundingClientRect();
  const cont = document.querySelector('.container');
  const cc = getComputedStyle(cont);
  const gr = g.getBoundingClientRect();
  const w = g.querySelector('.app-card--icon .app-icon-wrapper');
  return {
    gridW: Math.round(gr.width),
    gridTop: Math.round(gr.top),
    gridH: Math.round(gr.height),
    barBottom: Math.round(bar.bottom),
    contBottom: Math.round(cont.getBoundingClientRect().bottom - parseFloat(cc.paddingBottom)),
    icCols: parseInt(cs.getPropertyValue('--ic-cols'), 10) || 0,
    listTpl: getComputedStyle(g).gridTemplateColumns.split(' ').length,
    iconSize: w ? getComputedStyle(w).getPropertyValue('--icon-size').trim() : null,
    headerH: Math.round(document.querySelector('.site-header').getBoundingClientRect().height),
    zen: document.body.classList.contains('is-zen'),
    transitioning: document.documentElement.classList.contains('is-zen-transitioning'),
    running: window.__perf ? window.__perf.running(true) : -1
  };
});

const zenFor = (view, tab, napps) => async (browser, base) => {
  const { ctx, page } = await open(browser, base, view, tab);
  const before = await measure(page);
  await page.keyboard.press('Alt+KeyZ');
  await settle(page);
  const zen = await measure(page);
  const t = `${view}`;
  record(`${t}: Zen on, header hidden, no running animations, no transition class`, zen.zen && zen.headerH === 0 && zen.running === 0 && !zen.transitioning, { headerH: zen.headerH, running: zen.running, transitioning: zen.transitioning });
  if (view === 'list') {
    record('list: stays one column in Zen, centred and no wider than 780', zen.listTpl === 1 && zen.gridW <= 780, { before: before.gridW, zen: zen.gridW, cols: zen.listTpl });
  } else if (view === 'icons') {
    const flatZen = await page.evaluate(() => {
      const plates = [...document.querySelectorAll('#appGrid .icon-plate')];
      return { plates: plates.length, vertical: plates.filter((p) => { const k = [...p.querySelectorAll('.app-card--icon .app-icon-wrapper')].map((w) => w.getBoundingClientRect()); return k.length > 1 && Math.abs(k[0].top - k[1].top) > 4; }).length };
    });
    record('icons: plates stay horizontal in Zen', flatZen.plates > 0 && flatZen.vertical === 0, flatZen);
    record('icons: at least as many columns, with 76px tiles', zen.icCols >= before.icCols && zen.iconSize === '76px', { before: before.icCols, zen: zen.icCols, size: zen.iconSize });
  } else {
    record('bento: grid at least as wide as before', zen.gridW >= before.gridW, { before: before.gridW, zen: zen.gridW });
  }
  if (view !== 'bento') {
    const free = zen.contBottom - zen.barBottom - zen.gridH;
    const expected = zen.barBottom + free / 2;
    record(`${t}: grid is vertically centred in the free space`, Math.abs(zen.gridTop - expected) <= 40, { gridTop: zen.gridTop, expected: Math.round(expected), free });
  }
  await page.keyboard.press('Escape');
  await settle(page);
  const back = await measure(page);
  record(`${t}: Escape leaves Zen and restores the width`, !back.zen && Math.abs(back.gridW - before.gridW) <= 2, { before: before.gridW, back: back.gridW });
  await ctx.close();
};

const rapid = async (browser, base) => {
  const { ctx, page } = await open(browser, base, 'icons', 'core');
  for (let i = 0; i < 6; i++) { await page.keyboard.press('Alt+KeyZ'); await page.waitForTimeout(60); }
  await settle(page);
  const m = await measure(page);
  record('rapid Alt+Z x6 ends in a consistent state with no running animations', m.running === 0 && !m.transitioning, { zen: m.zen, running: m.running, transitioning: m.transitioning });
  await ctx.close();
};

const fallback = async (browser, base) => {
  const { ctx, page } = await open(browser, base, 'icons', 'core', { noVT: true });
  const hasVT = await page.evaluate(() => typeof document.startViewTransition);
  await page.keyboard.press('Alt+KeyZ');
  await page.waitForTimeout(100);
  const n = await page.evaluate(() => document.getAnimations().filter((a) => a.effect && a.effect.target && a.effect.target.classList && a.effect.target.classList.contains('app-card--icon')).length);
  record('no View Transition: icon cards animate through the FLIP fallback', hasVT === 'undefined' && n > 0, { hasVT, iconAnims: n });
  await settle(page);
  const m = await measure(page);
  record('no View Transition: settles with no running animations', m.zen && m.running === 0, { running: m.running });
  await ctx.close();
};

const header = async (browser, base) => {
  const bad = [];
  for (const w of [1100, 1280, 1440, 1600, 1920]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('lx-view', 'list'); localStorage.setItem('lx-zen', '1'); localStorage.setItem('lx-lang', 'en'); } catch (e) {} });
    const page = await ctx.newPage();
    await page.goto(`${base}/#core`);
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(1800);
    const r = await page.evaluate(() => {
      const a = document.querySelector('.controls-pill').getBoundingClientRect();
      const b = document.querySelector('.lx-bar').getBoundingClientRect();
      const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
      const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      return { overlap: x > 0 && y > 0, pill: [Math.round(a.left), Math.round(a.right), Math.round(a.top), Math.round(a.bottom)], bar: [Math.round(b.left), Math.round(b.right), Math.round(b.top), Math.round(b.bottom)] };
    });
    if (r.overlap) bad.push({ w, ...r });
    await ctx.close();
  }
  record('zen: controls pill never overlaps the search bar from 1100 to 1920 wide', bad.length === 0, bad);
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const links = await (await fetch(server.base + '/links.json')).json();
  const biggest = links.categories.slice().sort((a, b) => b.apps.length - a.apps.length)[0];
  const steps = [zenFor('bento', biggest.id, biggest.apps.length), zenFor('list', biggest.id, biggest.apps.length), zenFor('icons', biggest.id, biggest.apps.length), rapid, fallback, header];
  for (const step of steps) {
    try { await step(browser, server.base); } catch (e) { record(step.name || 'step', false, { error: String(e.message || e).slice(0, 240) }); }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

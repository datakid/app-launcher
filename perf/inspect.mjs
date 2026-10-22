import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';
import { siteRoot } from './site-root.mjs';
import { collectorInit } from './collector.mjs';
import { INTERACTIONS, settleIdle } from './interactions.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const PROFILES = {
  mobile: { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false }
};
const VIEWS = ['bento', 'list', 'icons'];

const open = async (browser, base, profile, url) => {
  const p = PROFILES[profile];
  const ctx = await browser.newContext({ viewport: p.viewport, hasTouch: p.hasTouch, isMobile: p.isMobile, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
  });
  await ctx.addInitScript(collectorInit);
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2500);
  await settleIdle(page);
  return { ctx, page };
};

const collectMarks = (page, surface) => page.evaluate((surface) => {
  const out = [];
  const label = (el) => {
    const chain = [];
    let n = el.parentElement;
    for (let i = 0; i < 3 && n; i++, n = n.parentElement) chain.push(n.className && n.className.baseVal !== undefined ? n.className.baseVal : n.className);
    return chain.join(' < ');
  };
  document.querySelectorAll('.lx-glyph, img.lx-fav, svg.fas').forEach((el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const kind = el.classList.contains('lx-glyph') ? 'glyph' : el.classList.contains('lx-fav') ? 'favicon' : 'fa';
    out.push({ surface, kind, own: String(el.className.baseVal ?? el.className), ctx: label(el), w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10, watermark: !!el.closest('.card-glyph') });
  });
  return out;
}, surface);

const group = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const k = [r.surface, r.kind, r.own, r.ctx].join(' | ');
    const e = m.get(k) || { surface: r.surface, kind: r.kind, own: r.own, ctx: r.ctx, watermark: r.watermark, min: Infinity, max: 0, count: 0 };
    e.min = Math.min(e.min, r.w, r.h);
    e.max = Math.max(e.max, r.w, r.h);
    e.count += 1;
    m.set(k, e);
  }
  return [...m.values()];
};

const sizes = async (browser, base, profile) => {
  const rows = [];
  for (const view of VIEWS) {
    const { ctx, page } = await open(browser, base, profile, `/?view=${view}`);
    rows.push(...(await collectMarks(page, `view:${view}`)));
    if (profile === 'desktop' || view === 'bento') {
      await page.keyboard.press('Control+KeyK');
      await page.waitForTimeout(1200);
      rows.push(...(await collectMarks(page, `palette:${view}`)));
      const detail = await page.evaluate(() => {
        const rowsEl = document.querySelectorAll('#lx-palette [role="option"], #lx-palette .palette-row');
        return rowsEl.length;
      });
      rows.push({ surface: `palette-rows:${view}`, kind: 'count', own: '', ctx: String(detail), w: 0, h: 0, watermark: false });
      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      const card = await page.$('#appGrid .app-card');
      if (card) {
        await card.click({ button: 'right' });
        await page.waitForTimeout(800);
        rows.push(...(await collectMarks(page, `context-menu:${view}`)));
        await page.keyboard.press('Escape');
      }
    }
    await ctx.close();
  }
  return group(rows);
};

const swapTrace = async (browser, base, profile) => {
  const { ctx, page } = await open(browser, base, profile, '/');
  await page.evaluate(() => {
    const card = [...document.querySelectorAll('#appGrid .app-card')].find((c) => c.querySelectorAll('.variant-chip').length > 1);
    window.__mut = [];
    window.__mo = new MutationObserver((list) => {
      for (const m of list) {
        const t = m.target;
        const tag = t.nodeType === 1 ? t.tagName.toLowerCase() + '.' + String(t.className && t.className.baseVal !== undefined ? t.className.baseVal : t.className).split(/\s+/).slice(0, 3).join('.') : '#text';
        if (m.type === 'attributes') window.__mut.push({ type: 'attr', name: m.attributeName, target: tag, old: (m.oldValue || '').slice(0, 90), now: (t.getAttribute(m.attributeName) || '').slice(0, 90) });
        else if (m.type === 'childList') window.__mut.push({ type: 'childList', target: tag, added: [...m.addedNodes].map((n) => n.nodeName).join(','), removed: [...m.removedNodes].map((n) => n.nodeName).join(',') });
        else window.__mut.push({ type: 'text', target: tag });
      }
    });
    window.__mo.observe(card, { subtree: true, attributes: true, attributeOldValue: true, childList: true, characterData: true });
    card.setAttribute('data-perf-target', '1');
    window.__cardRef = card;
  });
  await INTERACTIONS.versionSwitch.run(page);
  await page.waitForTimeout(1500);
  const res = await page.evaluate(() => {
    const card = window.__cardRef;
    return { mutations: window.__mut, cardStillAttached: document.contains(card), imgSrcNow: [...card.querySelectorAll('img')].map((i) => i.getAttribute('src')), glyphStyles: [...card.querySelectorAll('.lx-glyph')].map((g) => g.getAttribute('style')) };
  });
  await ctx.close();
  return res;
};

const coverage = async (browser, base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  await page.coverage.startCSSCoverage();
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.goto(base + '/?view=bento');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(3000);
  const css = await page.coverage.stopCSSCoverage();
  const js = await page.coverage.stopJSCoverage();
  const cssUsed = (e) => e.ranges.reduce((n, r) => n + (r.end - r.start), 0);
  const cssTotal = css.reduce((n, e) => n + e.text.length, 0);
  const cssUsedB = css.reduce((n, e) => n + cssUsed(e), 0);
  let jsTotal = 0;
  let jsUsed = 0;
  for (const e of js) {
    const len = (e.source || '').length;
    if (!len) continue;
    const mask = new Uint8Array(len);
    const fns = [...e.functions].sort((a, b) => (a.ranges[0]?.startOffset ?? 0) - (b.ranges[0]?.startOffset ?? 0));
    const ranges = [];
    for (const f of fns) for (const r of f.ranges) ranges.push(r);
    ranges.sort((a, b) => (b.endOffset - b.startOffset) - (a.endOffset - a.startOffset));
    for (const r of ranges) mask.fill(r.count > 0 ? 1 : 0, r.startOffset, Math.min(r.endOffset, len));
    jsTotal += len;
    for (let i = 0; i < len; i++) jsUsed += mask[i];
  }
  await ctx.close();
  return {
    css: { total: cssTotal, used: cssUsedB, unusedPct: Math.round((1 - cssUsedB / cssTotal) * 1000) / 10, sheets: css.map((e) => ({ url: e.url.replace(/^https?:\/\/[^/]+/, ''), bytes: e.text.length })) },
    js: { total: jsTotal, used: jsUsed, unusedPct: Math.round((1 - jsUsed / jsTotal) * 1000) / 10, scripts: js.map((e) => ({ url: e.url.replace(/^https?:\/\/[^/]+/, '') || '(inline)', bytes: (e.source || '').length })) }
  };
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const out = { sizes: {}, swap: {}, coverage: null };
  for (const profile of Object.keys(PROFILES)) {
    out.sizes[profile] = await sizes(browser, server.base, profile);
    out.swap[profile] = await swapTrace(browser, server.base, profile);
  }
  out.coverage = await coverage(browser, server.base);
  await browser.close();
  await server.close();
  await fs.mkdir(path.join(here, 'out'), { recursive: true });
  await fs.writeFile(path.join(here, 'out', 'inspect.json'), JSON.stringify(out, null, 2) + '\n');
  console.log('done');
};
main().catch((e) => { console.error(e); process.exit(1); });

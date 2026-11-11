import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN = [
  'box-shadow', 'filter', 'backdrop-filter', 'background', 'background-image', 'width', 'height', 'inset', 'top', 'left', 'border-radius',
  'inline-size', 'block-size', 'right', 'bottom', 'background-position', 'background-size'
];
const FORBIDDEN_PREFIX = ['inset-', 'border-radius-', 'border-start-', 'border-end-', 'border-top-left-', 'border-top-right-', 'border-bottom-left-', 'border-bottom-right-', 'background-position-'];

const TARGETS = [
  { name: '.app-card', sel: '.app-card' },
  { name: '.card-clip', sel: '.card-clip' },
  { name: '.app-icon-wrapper', sel: '.app-icon-wrapper' },
  { name: '.palette-item', sel: '.palette-item' },
  { name: '.icon-plate', sel: '.icon-plate' },
  { name: '.controls-pill button', sel: '.controls-pill button' },
  { name: '.lx-bar', sel: '.lx-bar' },
  { name: '.tab-rail > *', sel: '.tab-rail > *' },
  { name: '.variant-chip', sel: '.variant-chip' }
];

const LOOKS = ['vivid', 'curated', 'muted', 'mono'];
const VIEWS = ['bento', 'list', 'icons'];

const isForbidden = (prop) => FORBIDDEN.includes(prop) || FORBIDDEN_PREFIX.some((p) => prop.startsWith(p));

const readStates = ({ targets, state }) => {
  const parse = (v) => v.split(',').map((s) => s.trim()).filter(Boolean);
  const seconds = (v) => parse(v).map((s) => (s.endsWith('ms') ? parseFloat(s) / 1000 : parseFloat(s)));
  const out = [];
  for (const t of targets) {
    const els = [...document.querySelectorAll(t.sel)].filter((el) => el.getClientRects().length || el.matches('.lx-bar, .lx-bar *'));
    out.push({ target: t.name, count: els.length, counter: true });
    for (const el of els.slice(0, 6)) {
      for (const pseudo of [null, '::before', '::after']) {
        const cs = pseudo ? getComputedStyle(el, pseudo) : getComputedStyle(el);
        if (pseudo && cs.content === 'none') continue;
        const props = parse(cs.transitionProperty);
        const dur = seconds(cs.transitionDuration);
        const delay = seconds(cs.transitionDelay);
        props.forEach((p, i) => {
          const d = dur[i % dur.length] || 0;
          const dl = delay[i % delay.length] || 0;
          if (d > 0 || (dl > 0 && d > 0)) out.push({ target: t.name, pseudo: pseudo || '', prop: p, dur: d, state, tag: el.tagName.toLowerCase(), cls: String(el.className).slice(0, 60) });
        });
      }
    }
  }
  return out;
};

const read = (page, state) => page.evaluate(readStates, { targets: TARGETS, state });

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  const violations = new Map();
  const seen = new Map(TARGETS.map((t) => [t.name, 0]));
  const errors = [];

  const record = (rows, ctx) => {
    for (const r of rows) {
      if (r.counter) { seen.set(r.target, (seen.get(r.target) || 0) + r.count); continue; }
      const prop = r.prop === 'all' ? 'all' : r.prop;
      if (prop !== 'all' && !isForbidden(prop)) continue;
      const key = `${r.target}${r.pseudo} ${prop}`;
      const entry = violations.get(key) || { target: `${r.target}${r.pseudo}`, prop, where: new Set() };
      entry.where.add(`${ctx} ${r.state}`);
      violations.set(key, entry);
    }
  };

  for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 800 }]) {
    for (const theme of ['light', 'dark']) {
      for (const look of LOOKS) {
        for (const view of VIEWS) {
          if (viewport.width === 390 && (theme === 'dark' || look !== 'vivid')) continue;
          const ctx = await browser.newContext({ viewport, reducedMotion: 'no-preference', serviceWorkers: 'block', hasTouch: viewport.width === 390 });
          await ctx.addInitScript((c) => { try { localStorage.setItem('lx-theme', c.theme); localStorage.setItem('lx-lang', 'en'); localStorage.setItem('lx-zen', '0'); } catch (e) {} }, { theme });
          const page = await ctx.newPage();
          page.on('pageerror', (e) => errors.push(e.message));
          await page.goto(`${server.base}/?view=${view}&palette=${look}#core`);
          await page.waitForSelector('#appGrid .app-card');
          await page.waitForTimeout(1300);
          const tag = `${viewport.width} ${theme} ${look} ${view}`;
          record(await read(page, 'rest').catch(() => []), tag);
          if (viewport.width === 1280) {
            const card = await page.$('#appGrid .app-card:not(.status-closed)');
            const bb = card && await card.boundingBox();
            if (bb) {
              await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
              await page.waitForTimeout(150);
              record(await read(page, 'hover'), tag);
              await page.mouse.down();
              await page.waitForTimeout(120);
              record(await read(page, 'press'), tag);
              await page.mouse.up();
            }
            await page.focus('#lxBarSearch').catch(() => {});
            record(await read(page, 'bar-focus'), tag);
            if (view === 'bento' && look === 'vivid') {
              await page.keyboard.press('Control+KeyK');
              await page.waitForSelector('.palette-item', { timeout: 4000 }).catch(() => {});
              await page.waitForTimeout(500);
              record(await read(page, 'palette'), tag);
              await page.keyboard.press('Escape');
            }
          }
          await ctx.close();
        }
      }
    }
  }
  await browser.close();
  await server.close();

  const missing = [...seen.entries()].filter(([, n]) => n === 0).map(([k]) => k);
  const failing = [...violations.values()].map((v) => ({ target: v.target, prop: v.prop, where: [...v.where].slice(0, 3) }));
  console.log(JSON.stringify({ checked: Object.fromEntries(seen), failing: failing.length, missing, errors }));
  if (failing.length || missing.length || errors.length) {
    failing.forEach((r) => console.log('VIOLATION', r.target, r.prop, JSON.stringify(r.where)));
    process.exit(1);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });

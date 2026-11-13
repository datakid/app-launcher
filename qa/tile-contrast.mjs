import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_RATIO = 3;
const WHITE_PALETTES = ['vivid', 'curated', 'mono'];
const INK_PALETTES = ['muted'];
const THEMES = ['light', 'dark'];
const VIEWS = ['bento', 'icons'];
const TABS = ['core', 'tools', 'experimental'];

const channel = (v) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const ratio = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const centralAverage = (buffer) => {
  const png = PNG.sync.read(buffer);
  const x0 = Math.floor(png.width * 0.3);
  const x1 = Math.ceil(png.width * 0.7);
  const y0 = Math.floor(png.height * 0.3);
  const y1 = Math.ceil(png.height * 0.7);
  const sum = [0, 0, 0];
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (png.width * y + x) * 4;
      sum[0] += png.data[i];
      sum[1] += png.data[i + 1];
      sum[2] += png.data[i + 2];
      count++;
    }
  }
  return sum.map((v) => v / count);
};

const collectTiles = (page, wantInk) => page.evaluate((wantInkColour) => {
  const toRgb = (css) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#000';
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2]];
  };
  const out = [];
  const wrappers = [...document.querySelectorAll('#appGrid .app-icon-wrapper')];
  wrappers.forEach((w) => {
    const kind = w.getAttribute('data-mark');
    if (kind !== 'glyph' && kind !== 'fa') return;
    const r = w.getBoundingClientRect();
    if (r.width < 8 || r.height < 8 || r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth) return;
    const glyph = w.querySelector('.lx-glyph, svg.app-icon, .app-icon, svg');
    const index = out.length;
    w.setAttribute('data-tile-contrast', String(index));
    const card = w.closest('.app-card');
    const label = card ? (card.querySelector('.app-title, .icon-label')?.textContent || '').trim() : '';
    out.push({ index, kind, label, ink: wantInkColour && glyph ? toRgb(getComputedStyle(glyph).color) : null });
  });
  return out;
}, wantInk);

const measureCombo = async (page, base, look, theme, view, tab, wantInk) => {
  await page.goto(`${base}/?view=${view}&palette=${look}#${tab}`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(1100);
  await page.addStyleTag({ content: '#appGrid .app-icon-wrapper > * { opacity: 0 !important; transition: none !important; animation: none !important; }' });
  await page.waitForTimeout(150);
  const tiles = await collectTiles(page, wantInk);
  const rows = [];
  for (const tile of tiles) {
    const buffer = await page.locator(`[data-tile-contrast="${tile.index}"]`).screenshot();
    const average = centralAverage(buffer);
    const value = wantInk ? ratio(tile.ink, average) : ratio([255, 255, 255], average);
    rows.push({ look, theme, view, tab, label: tile.label, kind: tile.kind, average: average.map(Math.round), exact: value, ratio: Math.round(value * 1000) / 1000 });
  }
  return rows;
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  const all = [];
  const errors = [];
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('lx-theme', t); localStorage.setItem('lx-lang', 'en'); localStorage.setItem('lx-zen', '0'); } catch (e) {} }, theme);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    for (const [looks, wantInk] of [[WHITE_PALETTES, false], [INK_PALETTES, true]]) {
      for (const look of looks) {
        for (const view of VIEWS) {
          for (const tab of TABS) {
            all.push(...await measureCombo(page, server.base, look, theme, view, tab, wantInk));
          }
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  await server.close();
  const failing = all.filter((r) => r.exact < MIN_RATIO);
  const worst = [...all].sort((a, b) => a.exact - b.exact).slice(0, 5).map(({ exact, ...rest }) => rest);
  console.log(JSON.stringify({ tiles: all.length, min: MIN_RATIO, failing: failing.length, worst, errors }));
  if (!all.length || failing.length || errors.length) {
    failing.slice(0, 20).forEach((r) => console.log('LOW', r.look, r.theme, r.view, r.tab, r.label, r.ratio, JSON.stringify(r.average)));
    process.exit(1);
  }
};

main().catch((e) => { console.error(e); process.exit(1); });

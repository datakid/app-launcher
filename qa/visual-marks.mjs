import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(here, 'out', 'visual-marks');
const PALETTES = ['vivid', 'curated', 'muted', 'mono'];
const THEMES = ['light', 'dark'];
const VIEWS = ['bento', 'list', 'icons'];

const main = async () => {
  await fs.mkdir(outDir, { recursive: true });
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  let shots = 0;
  const errors = [];
  for (const theme of THEMES) {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await ctx.addInitScript((t) => { try { localStorage.setItem('lx-theme', t); localStorage.setItem('lx-lang', 'en'); } catch (e) {} }, theme);
    await ctx.addInitScript((cores) => {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => cores });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => cores });
    }, process.argv.includes('--lowend') ? 2 : 8);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(e.message));
    for (const palette of PALETTES) {
      for (const view of VIEWS) {
        await page.goto(`${server.base}/?view=${view}&palette=${palette}`);
        await page.waitForSelector('#appGrid .app-card');
        await page.waitForTimeout(1200);
        await page.screenshot({ path: path.join(outDir, `${theme}-${palette}-${view}.png`) });
        shots++;
        if (view === 'bento') {
          await page.keyboard.press('Control+KeyK');
          await page.waitForTimeout(900);
          await page.screenshot({ path: path.join(outDir, `${theme}-${palette}-palette.png`) });
          shots++;
          await page.keyboard.press('Escape');
          await page.waitForTimeout(300);
          const card = await page.$('#appGrid .app-card');
          await card.click({ button: 'right' });
          await page.waitForTimeout(700);
          await page.screenshot({ path: path.join(outDir, `${theme}-${palette}-context.png`) });
          shots++;
          await page.keyboard.press('Escape');
        }
      }
    }
    await ctx.close();
  }
  await browser.close();
  await server.close();
  console.log(JSON.stringify({ shots, errors, outDir: path.relative(root, outDir) }));
  if (errors.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

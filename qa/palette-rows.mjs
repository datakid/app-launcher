import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

const typeAndInspect = (page, value) => page.evaluate((v) => new Promise((resolve) => {
  const list = document.getElementById('paletteResults');
  const rowsNow = () => [...list.querySelectorAll('.palette-item')];
  const seen = (r) => r.bottom > list.getBoundingClientRect().top && r.top < list.getBoundingClientRect().bottom;
  const before = new Map(rowsNow().map((li) => [li.dataset.key, { el: li, top: li.getBoundingClientRect().top, layout: li.offsetTop, seen: seen(li.getBoundingClientRect()) }]));
  const input = document.getElementById('paletteInput');
  input.value = v;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  requestAnimationFrame(() => {
    const after = rowsNow().map((li) => {
      const prev = before.get(li.dataset.key);
      const slides = li.getAnimations().filter((a) => a.id === 'row-slide').length;
      return {
        key: li.dataset.key,
        survived: !!prev,
        sameNode: !!prev && prev.el === li,
        moved: !!prev && prev.seen && seen(li.getBoundingClientRect()) && Math.abs(prev.layout - li.offsetTop) >= 1,
        slides,
        jump: prev ? Math.abs(prev.top - li.getBoundingClientRect().top) : null
      };
    });
    resolve({ after, gone: [...before.keys()].filter((k) => !rowsNow().some((li) => li.dataset.key === k)).length });
  });
}), value);

const settled = (page) => page.evaluate(() => [...document.querySelectorAll('#paletteResults .palette-item')].every((li) => li.getAnimations().every((a) => a.id !== 'row-slide') && getComputedStyle(li).transform === 'none'));

const run = async (browser, base, reduced) => {
  const label = reduced ? 'reduced motion' : 'motion';
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference', serviceWorkers: 'block' });
  await ctx.addInitScript(() => { try { localStorage.setItem('lx-lang', 'en'); localStorage.setItem('lx-zen', '0'); localStorage.setItem('lx-theme', 'light'); localStorage.setItem('lx-view', 'bento'); } catch (e) {} });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/#core`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(900);
  await page.keyboard.press('Control+KeyK');
  await page.waitForSelector('#paletteResults .palette-item');
  await page.waitForTimeout(500);

  await typeAndInspect(page, 'p');
  await page.waitForTimeout(400);
  const step = await typeAndInspect(page, 'pa');
  const survivors = step.after.filter((r) => r.survived);
  record(`${label}: rows that survive a keystroke keep their nodes`, survivors.length >= 3 && survivors.every((r) => r.sameNode), `${survivors.length} survivors`);
  const movers = survivors.filter((r) => r.moved);
  const stillKey = step.after[0] ? step.after[0].key : null;
  if (reduced) {
    record(`${label}: no row slides`, step.after.every((r) => r.slides === 0), JSON.stringify(step.after.filter((r) => r.slides)));
  } else {
    const sliding = movers.filter((r) => r.key !== stillKey);
    record(`${label}: moved rows slide, none is left behind`, sliding.length > 0 && sliding.every((r) => r.slides === 1), `${sliding.length} moved, ${sliding.filter((r) => r.slides !== 1).length} without a slide`);
    record(`${label}: a sliding row starts where the eye last saw it`, sliding.every((r) => r.jump < 1.5), JSON.stringify(sliding.map((r) => [r.key, r.jump])));
    record(`${label}: the highlighted first row does not travel`, step.after[0] && step.after[0].slides === 0, JSON.stringify(step.after[0]));
    await page.waitForTimeout(600);
    record(`${label}: rows settle with no leftover transform`, await settled(page));
  }

  await typeAndInspect(page, 'p');
  const chain = [];
  for (const q of ['pa', 'par', 'pl', 'pa']) chain.push(await typeAndInspect(page, q));
  const chained = chain.flatMap((c) => c.after).filter((r) => r.survived && r.slides);
  record(`${label}: back-to-back keystrokes stay continuous`, chained.every((r) => r.jump < 1.5), JSON.stringify(chained.filter((r) => r.jump >= 1.5)));
  await page.waitForTimeout(600);
  record(`${label}: rows settle after a burst of keystrokes`, await settled(page));

  record(`${label}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  await run(browser, server.base, false);
  await run(browser, server.base, true);
  await browser.close();
  await server.close();
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` ${JSON.stringify(r.detail)}`}`));
  console.log(JSON.stringify({ total: results.length, failed: failed.length }));
  if (failed.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

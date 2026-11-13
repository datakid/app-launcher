import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

const firstRow = (page) => page.evaluate(() => {
  const row = document.querySelector('#paletteResults .palette-item');
  if (!row) return null;
  const via = row.querySelector('.palette-item-via');
  const marks = via ? [...via.querySelectorAll('mark')].map((m) => m.textContent) : [];
  const titleMarks = [...row.querySelectorAll('.palette-item-title mark')].map((m) => m.textContent);
  return {
    key: row.dataset.key,
    height: row.offsetHeight,
    overflowX: row.scrollWidth - row.clientWidth,
    viaText: via ? via.textContent : null,
    viaDirection: via ? getComputedStyle(via).direction : null,
    viaMarks: marks,
    titleMarks,
    focus: document.activeElement ? document.activeElement.id : null
  };
});

const keyOf = (page) => page.evaluate(() => { const r = document.querySelector('#paletteResults .palette-item'); return r ? r.dataset.key : null; });

const run = async (browser, base, lang) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await ctx.addInitScript((l) => { try { localStorage.setItem('lx-lang', l); localStorage.setItem('lx-zen', '0'); localStorage.setItem('lx-theme', 'light'); localStorage.setItem('lx-view', 'bento'); } catch (e) {} }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/#core`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(900);
  await page.keyboard.press('Control+KeyK');
  await page.waitForSelector('#paletteResults .palette-item');
  await page.waitForTimeout(500);

  const baseline = await firstRow(page);
  record(`${lang}: palette opens with the input focused`, baseline && baseline.focus === 'paletteInput', baseline && baseline.focus);
  const placeholder = await page.getAttribute('#paletteInput', 'placeholder');
  record(`${lang}: palette placeholder is the Search v2 text`, placeholder === (lang === 'ar' ? 'ابحث عن تطبيق أو رابط أو نطاق…' : 'Search apps, links, hosts…'), placeholder);

  await page.keyboard.type('lx-index', { delay: 30 });
  await page.waitForFunction(() => {
    const v = document.querySelector('#paletteResults .palette-item .palette-item-via');
    return !!v && [...v.querySelectorAll('mark')].map((m) => m.textContent).join('').replace(/[^a-z]/gi, '').includes('lxindex');
  }, null, { timeout: 4000 }).catch(() => {});
  const hit = await firstRow(page);
  record(`${lang}: lx-index puts Index Builder first`, hit && hit.key === 'index-builder', hit && hit.key);
  record(`${lang}: lx-index shows the host in the via line`, hit && hit.viaText && hit.viaText.includes('lx-index'), hit && hit.viaText);
  record(`${lang}: the via line highlights the match`, hit && hit.viaMarks.join('').replace(/[^a-z]/gi, '').includes('lxindex'), hit && JSON.stringify(hit.viaMarks));
  record(`${lang}: the via line is left-to-right`, hit && hit.viaDirection === 'ltr', hit && hit.viaDirection);
  record(`${lang}: the via line does not change the row height`, hit && baseline && hit.height === baseline.height, hit && baseline && `${hit.height} vs ${baseline.height}`);
  record(`${lang}: the via line does not overflow the row`, hit && hit.overflowX <= 1, hit && hit.overflowX);
  record(`${lang}: focus stays in the input while typing`, hit && hit.focus === 'paletteInput', hit && hit.focus);

  await page.fill('#paletteInput', '');
  await page.keyboard.type('hglpgg', { delay: 30 });
  await page.waitForFunction(() => { const r = document.querySelector('#paletteResults .palette-item'); return r && r.dataset.key === 'parser'; }, null, { timeout: 4000 }).catch(() => {});
  record(`${lang}: a query typed on the wrong keyboard layout finds Parser`, (await keyOf(page)) === 'parser', await keyOf(page));

  if (lang === 'en') {
    await page.fill('#paletteInput', '');
    await page.keyboard.type('ind', { delay: 30 });
    await page.waitForFunction(() => { const m = document.querySelector('#paletteResults .palette-item[data-key="index-builder"] .palette-item-title mark'); return !!m && m.textContent.toLowerCase() === 'ind'; }, null, { timeout: 4000 }).catch(() => {});
    const ind = await firstRow(page);
    record('en: the title highlight comes from the match ranges', ind && ind.key === 'index-builder' && ind.titleMarks.length === 1 && ind.titleMarks[0].toLowerCase() === 'ind', ind && JSON.stringify(ind.titleMarks));
    record('en: a title match has no via line', ind && ind.viaText === null, ind && ind.viaText);
  }

  await page.fill('#paletteInput', '');
  await page.keyboard.type('ادوية', { delay: 30 });
  await page.waitForFunction(() => { const r = document.querySelector('#paletteResults .palette-item'); return r && r.dataset.key.startsWith('drug-list'); }, null, { timeout: 4000 }).catch(() => {});
  await page.waitForFunction(() => { const r = document.querySelector('#paletteResults .palette-item'); return !!r && r.dataset.key.startsWith('drug-list') && r.querySelectorAll('.palette-item-title mark').length > 0; }, null, { timeout: 4000 }).catch(() => {});
  const drugs = await firstRow(page);
  record(`${lang}: Arabic text without hamza finds the Drug List`, drugs && drugs.key.startsWith('drug-list'), drugs && drugs.key);
  if (lang === 'ar') record('ar: the Arabic title highlight maps back to the hamza form', drugs && drugs.titleMarks.some((m) => m.includes('أد')), drugs && JSON.stringify(drugs.titleMarks));

  if (lang === 'en') {
    await page.fill('#paletteInput', '');
    await page.keyboard.type('>', { delay: 30 });
    await page.keyboard.type('drak', { delay: 30 });
    await page.waitForFunction(() => !!document.querySelector('#paletteResults .palette-item[data-key="cmd-theme"]'), null, { timeout: 4000 }).catch(() => {});
    const cmd = await page.evaluate(() => ({ key: (document.querySelector('#paletteResults .palette-item') || {}).dataset?.key, mode: document.getElementById('lx-palette').classList.contains('is-command-mode') }));
    record('en: command mode tolerates a typo', cmd.mode && cmd.key === 'cmd-theme', JSON.stringify(cmd));
  }

  record(`${lang}: no page errors`, errors.length === 0, errors.join(' | '));
  await ctx.close();
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  for (const lang of ['en', 'ar']) await run(browser, server.base, lang);
  await browser.close();
  await server.close();
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` ${JSON.stringify(r.detail)}`}`));
  console.log(JSON.stringify({ total: results.length, failed: failed.length }));
  if (failed.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

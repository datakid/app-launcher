import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import jsQR from 'jsqr';
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

const open = async (browser, base, opts = {}) => {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await boost(ctx);
  await ctx.addInitScript(collectorInit);
  await ctx.addInitScript((lang) => { try { localStorage.setItem('lx-lang', lang); } catch (e) {} }, opts.lang || 'en');
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  return { ctx, page };
};

const decode = async (page) => {
  const buf = await page.locator('#qrStage').screenshot();
  const png = PNG.sync.read(buf);
  const code = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
  return code ? code.data : null;
};

const openFromMenu = async (page, selector) => {
  const card = page.locator(selector).first();
  await card.locator('.card-link-overlay').first().click({ button: 'right' });
  await page.waitForSelector('.lx-context-menu [data-action="qr"]');
  await page.click('.lx-context-menu [data-action="qr"]');
  await page.waitForSelector('#lx-qr[open]');
  await page.waitForTimeout(450);
};

const core = (lang, mobile) => async (browser, base) => {
  const tag = `${lang}${mobile ? ' mobile' : ''}`;
  const { ctx, page } = await open(browser, base, { lang, mobile, viewport: mobile ? { width: 390, height: 844 } : undefined });
  const href = await page.evaluate(() => document.querySelector('#appGrid .app-card .card-link-overlay').href);
  if (mobile) {
    await page.locator('#appGrid .app-card .card-link-overlay').first().dispatchEvent('contextmenu', { clientX: 120, clientY: 300 });
    await page.waitForSelector('.lx-context-menu [data-action="qr"]');
    await page.click('.lx-context-menu [data-action="qr"]');
    await page.waitForSelector('#lx-qr[open]');
    await page.waitForTimeout(450);
  } else {
    await openFromMenu(page, '#appGrid .app-card');
  }
  const state = await page.evaluate(() => ({ path: document.querySelector('#lx-qr .qr-svg path[d]')?.getAttribute('d')?.length || 0, focus: document.activeElement?.dataset?.qr || null }));
  record(`${tag}: dialog opens with a QR and focuses Copy`, state.path > 50 && state.focus === 'copy', state);
  const data = await decode(page);
  record(`${tag}: decoded QR equals the card link`, data === href, { data, href });
  if (mobile) {
    const m = await page.evaluate(() => ({ bottom: document.getElementById('lx-qr').getBoundingClientRect().bottom, vh: innerHeight, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    record('mobile: sheet sits on the bottom edge, no horizontal overflow', Math.abs(m.bottom - m.vh) <= 1 && m.sw <= m.iw, m);
  }
  if (!mobile) {
    await page.evaluate(() => {
      window.__qrT = {};
      addEventListener('keydown', (e) => { if (e.key === 'Escape') window.__qrT.k = performance.now(); }, true);
      document.getElementById('lx-qr').addEventListener('close', () => { window.__qrT.x = performance.now(); }, { once: true });
    });
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.getElementById('lx-qr').open, null, { timeout: 1500 });
    const dt = await page.evaluate(() => Math.round(window.__qrT.x - window.__qrT.k));
    const back = await page.evaluate(() => document.activeElement?.classList.contains('card-link-overlay'));
    record(`${tag}: Escape closes within 700 ms and returns focus to the card`, dt < 700 && back, { dt, back });
  }
  await ctx.close();
};

const variants = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  const info = await page.evaluate(() => {
    const c = [...document.querySelectorAll('#appGrid .app-card')].find((x) => x.querySelectorAll('.variant-chip').length > 1);
    return c ? { id: c.dataset.appId } : null;
  });
  const links = await (await fetch(base + '/links.json')).json();
  const app = links.categories.flatMap((c) => c.apps).find((a) => a.id === info.id);
  await openFromMenu(page, `#appGrid .app-card[data-app-id="${info.id}"]`);
  const first = await decode(page);
  await page.click('#lx-qr .qr-variant:nth-child(2)');
  await page.waitForTimeout(250);
  const second = await decode(page);
  const dIndex = Number(app.defaultVariant) || 0;
  record('variants: switching version re-renders the QR for that url', first === app.variants[dIndex].url && second === app.variants[1].url, { first, second });
  await ctx.close();
};

const palette = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  const title = await page.evaluate(() => document.querySelector('#appGrid .app-card .app-title, #appGrid .app-card h3')?.textContent.trim());
  await page.keyboard.press('Control+KeyK');
  await page.waitForTimeout(400);
  await page.keyboard.type(title || 'parser');
  await page.waitForTimeout(500);
  await page.keyboard.press('Alt+KeyQ');
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => ({ qr: document.getElementById('lx-qr').open, pal: document.getElementById('lx-palette').open }));
  record('palette: Alt+Q opens the QR and closes the palette', r.qr && !r.pal, r);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await ctx.close();
};

const site = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await page.keyboard.press('Alt+KeyQ');
  await page.waitForSelector('#lx-qr[open]');
  await page.waitForTimeout(450);
  const data = await decode(page);
  record('Alt+Q on the page opens the QR for the site', !!data && data.startsWith(base), { data });
  await page.keyboard.press('Alt+KeyQ');
  await page.waitForTimeout(500);
  const closed = await page.evaluate(() => !document.getElementById('lx-qr').open);
  record('Alt+Q again closes it', closed, { closed });
  await ctx.close();
};

const reduced = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { reduced: true });
  await page.keyboard.press('Alt+KeyQ');
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  const running = await page.evaluate(() => (window.__perf ? window.__perf.running(true) : -1));
  record('reduced motion: no running animations after open and close', running === 0, { running });
  await ctx.close();
};

const offline = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  await page.waitForTimeout(2500);
  await ctx.setOffline(true);
  await page.reload();
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(1500);
  await page.keyboard.press('Alt+KeyQ');
  await page.waitForSelector('#lx-qr[open]');
  await page.waitForTimeout(450);
  const data = await decode(page);
  record('offline: QR still renders and decodes', !!data && data.startsWith(base), { data });
  await ctx.close();
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const steps = [core('en', false), core('ar', false), core('en', true), variants, palette, site, reduced, offline];
  for (const step of steps) {
    try { await step(browser, server.base); } catch (e) { record(step.name || 'step', false, { error: String(e.message || e).slice(0, 240) }); }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

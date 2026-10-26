import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };
const errors = [];
const FULL = process.env.STRESS === 'full';
const N = FULL ? { toggle: 31, reopen: 20, palette: 10, entry: 5 } : { toggle: 15, reopen: 10, palette: 5, entry: 3 };

const boot = async (browser, base, opts = {}) => {
  const ctx = await browser.newContext(opts.mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.route('https://**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'x' }));
  await ctx.addInitScript((v) => { try { localStorage.setItem('lx-view', v); localStorage.setItem('lx-lang', 'en'); } catch (e) {} }, opts.view || 'bento');
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|net::/.test(m.text())) errors.push(m.text()); });
  await page.goto(base + '/#core');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  return { ctx, page };
};

const settledOpen = (page) => page.waitForFunction(() => {
  const d = document.getElementById('lx-qr');
  return d.open && Number(getComputedStyle(d).opacity) >= 0.99 && !!d.querySelector('.qr-layer:not(.is-leaving) .qr-svg');
}, null, { timeout: 4000 }).then(() => true, () => false);
const settledClosed = (page) => page.waitForFunction(() => !document.getElementById('lx-qr').open && !document.body.classList.contains('qr-open'), null, { timeout: 4000 }).then(() => true, () => false);
const focusCard = async (page, n = 1) => { await page.locator('#appGrid .app-card').nth(n).locator('.card-link-overlay').focus(); };

const toggles = async (browser, base) => {
  const { ctx, page } = await boot(browser, base);
  for (const gap of [0, 16, 50, 120, 200]) {
    await focusCard(page);
    for (let i = 0; i < N.toggle; i++) {
      await page.keyboard.press('Alt+KeyQ');
      if (gap) await page.waitForTimeout(gap);
    }
    const open = await settledOpen(page);
    await page.keyboard.press('Alt+KeyQ');
    const closed = await settledClosed(page);
    record(`toggle x${N.toggle} with ${gap} ms gaps: ends open, then closes`, open && closed, { open, closed });
    await focusCard(page);
  }
  await ctx.close();
};

const reopenDuringClose = async (browser, base) => {
  const { ctx, page } = await boot(browser, base);
  let ok = 0;
  for (let i = 0; i < N.reopen; i++) {
    await focusCard(page, i % 4);
    await page.keyboard.press('Alt+KeyQ');
    await settledOpen(page);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(30 + (i % 5) * 20);
    await focusCard(page, i % 4);
    await page.keyboard.press('Alt+KeyQ');
    if (await settledOpen(page)) ok++;
    await page.keyboard.press('Escape');
    await settledClosed(page);
  }
  record(`close then reopen during the exit animation x${N.reopen}`, ok === N.reopen, { ok });
  await ctx.close();
};

const fromPalette = (mode) => async (browser, base) => {
  const mobile = mode === 'touch';
  const { ctx, page } = await boot(browser, base, { mobile });
  let ok = 0;
  const detail = [];
  for (let i = 0; i < N.palette; i++) {
    await page.evaluate(() => document.getElementById('lxBarSearch').click());
    await page.waitForSelector('#lx-palette[open]');
    await page.waitForTimeout(350);
    await page.keyboard.type('pa');
    await page.waitForTimeout(450);
    const row = page.locator('#lx-palette .palette-item').nth(1);
    if (mode === 'key') await page.keyboard.press('Alt+KeyQ');
    else {
      if (!mobile) await row.hover();
      const b = await row.locator('.palette-qr').boundingBox();
      if (mobile) await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
      else await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    }
    const open = await settledOpen(page);
    const st = await page.evaluate(() => ({ paletteOpen: document.getElementById('lx-palette').open, inQr: !!document.activeElement && !!document.activeElement.closest('#lx-qr'), onSearch: document.activeElement && document.activeElement.id === 'lxBarSearch' }));
    const pass = open && !st.paletteOpen && st.inQr && !st.onSearch;
    if (pass) ok++; else detail.push({ i, open, ...st });
    await page.keyboard.press('Escape');
    await settledClosed(page);
    await page.waitForTimeout(150);
  }
  record(`palette -> QR via ${mode} x${N.palette}: QR open, palette closed, focus inside the QR`, ok === N.palette, { ok, detail: detail.slice(0, 3) });
  await ctx.close();
};

const entryPoints = async (browser, base) => {
  for (const view of ['bento', 'list', 'icons']) {
    const { ctx, page } = await boot(browser, base, { view });
    let key = 0;
    let menu = 0;
    for (let i = 0; i < N.entry; i++) {
      await focusCard(page, i % 4);
      await page.keyboard.press('Alt+KeyQ');
      if (await settledOpen(page)) key++;
      await page.keyboard.press('Escape');
      await settledClosed(page);
      await page.locator('#appGrid .app-card').nth(i % 4).locator('.card-link-overlay').click({ button: 'right' });
      await page.waitForSelector('[data-action="qr"]');
      await page.locator('[data-action="qr"]').click();
      if (await settledOpen(page)) menu++;
      await page.keyboard.press('Escape');
      await settledClosed(page);
    }
    record(`${view}: Alt+Q and context menu open the QR x${N.entry} each`, key === N.entry && menu === N.entry, { key, menu });
    await ctx.close();
  }
};

const closers = async (browser, base) => {
  const { ctx, page } = await boot(browser, base);
  const way = {
    Escape: () => page.keyboard.press('Escape'),
    Close: () => page.locator('#qrClose').click(),
    Backdrop: async () => { await page.waitForTimeout(400); await page.mouse.click(8, 8); },
    AltQ: () => page.keyboard.press('Alt+KeyQ')
  };
  for (const [name, run] of Object.entries(way)) {
    await focusCard(page);
    await page.keyboard.press('Alt+KeyQ');
    await settledOpen(page);
    await run();
    const closed = await settledClosed(page);
    const back = await page.evaluate(() => !!document.activeElement && !!document.activeElement.closest('.app-card'));
    record(`${name} closes the QR and returns focus to the card`, closed && back, { closed, back });
  }
  await ctx.close();
};

const variantSwitch = async (browser, base) => {
  const { ctx, page } = await boot(browser, base);
  await page.locator('#appGrid .app-card').first().locator('.card-link-overlay').focus();
  await page.keyboard.press('Alt+KeyQ');
  await settledOpen(page);
  const before = await page.evaluate(() => ({ head: document.getElementById('qrTitle'), track: document.getElementById('qrVariants'), btn: document.querySelector('[data-qr-variant="0"]') }) && true);
  await page.evaluate(() => { window.__ids = { title: document.getElementById('qrTitle'), track: document.getElementById('qrVariants'), btn0: document.querySelector('[data-qr-variant="0"]') }; });
  await page.locator('[data-qr-variant="1"]').click();
  await page.waitForTimeout(500);
  const same = await page.evaluate(() => window.__ids.title === document.getElementById('qrTitle') && window.__ids.track === document.getElementById('qrVariants') && window.__ids.btn0 === document.querySelector('[data-qr-variant="0"]') && document.querySelectorAll('#qrStage .qr-layer').length === 1);
  record('variant switch keeps header and chip nodes and leaves a single code layer', before && same, { same });
  await ctx.close();
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const only = process.argv[2];
  const all = { toggles, reopenDuringClose, paletteKey: fromPalette('key'), paletteMouse: fromPalette('mouse'), paletteTouch: fromPalette('touch'), entryPoints, closers, variantSwitch };
  const steps = only ? only.split(',').map((k) => all[k]) : Object.values(all);
  for (const step of steps) {
    const browser = await chromium.launch();
    try { await step(browser, server.base); } catch (e) { record(step.name || 'step', false, { error: String(e.message || e).slice(0, 240) }); }
    await browser.close().catch(() => {});
  }
  record('no console errors or page errors', errors.length === 0, errors.slice(0, 3));
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

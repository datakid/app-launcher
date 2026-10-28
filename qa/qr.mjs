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
    await page.waitForFunction(() => window.__qrT.x !== undefined, null, { timeout: 1500 });
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
  await page.click('#lx-qr [data-qr-variant="1"]');
  await page.waitForTimeout(600);
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


const press = async (page, loc, mobile) => {
  const b = await loc.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  if (mobile) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
};

const cardButton = (view, mobile) => async (browser, base) => {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript((v) => { try { localStorage.setItem('lx-view', v); localStorage.setItem('lx-lang', 'en'); } catch (e) {} }, view);
  const page = await ctx.newPage();
  const popups = [];
  ctx.on('page', (p) => popups.push(p.url()));
  await page.goto(base + '/#core');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  const tag = `${view}${mobile ? ' phone' : ''}`;
  const card = page.locator('#appGrid .app-card').nth(1);
  const href = await card.locator('.card-link-overlay').evaluate((a) => a.href);
  if (!mobile) await card.hover();
  const btn = card.locator('.card-qr');
  const box = await btn.boundingBox();
  record(`${tag}: card shows a QR button of at least 24 px`, !!box && box.width >= 24 && box.height >= 24, box);
  await press(page, btn, mobile);
  await page.waitForSelector('#lx-qr[open]');
  await page.waitForTimeout(450);
  const data = await decode(page);
  record(`${tag}: QR button opens that card's QR without launching the app`, data === href && popups.length === 0, { data, href, popups });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('lx-qr').open, null, { timeout: 3000 });
  const back = await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('card-qr'));
  record(`${tag}: closing returns focus to the QR button`, back, { back });
  await ctx.close();
};

const paletteRow = (mobile) => async (browser, base) => {
  const ctx = await browser.newContext(mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
  await ctx.route('https://**/*', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: 'x' }));
  const page = await ctx.newPage();
  const popups = [];
  ctx.on('page', (p) => popups.push(p.url()));
  await page.goto(base + '/');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  await page.evaluate(() => document.getElementById('lxBarSearch').click());
  await page.waitForSelector('#lx-palette[open]');
  await page.waitForTimeout(500);
  await page.keyboard.type('pa');
  await page.waitForTimeout(700);
  const key = await page.evaluate(() => document.querySelectorAll('#lx-palette .palette-item')[2].dataset.key);
  const row = page.locator('#lx-palette .palette-item').nth(2);
  if (!mobile) await row.hover();
  const btn = row.locator('.palette-qr');
  await press(page, btn, mobile);
  await page.waitForSelector('#lx-qr[open]');
  await page.waitForTimeout(450);
  const title = await page.evaluate(() => document.getElementById('qrTitle').textContent);
  const data = await decode(page);
  const wantUrl = await (await fetch(base + '/links.json')).json().then((l) => { const [id, v] = key.split('::'); const a = l.categories.flatMap((c) => c.apps).find((x) => x.id === id); return v ? a.variants.find((x) => x.id === v).url : a.url; });
  record(`palette${mobile ? ' phone' : ''}: QR button on the third result opens that result's QR without launching it`, data === wantUrl && popups.length === 0, { key, title, data, wantUrl, popups });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('lx-qr').open, null, { timeout: 3000 });
  const focusOnInput = await page.evaluate(() => document.activeElement && document.activeElement.id === 'lxBarSearch');
  record(`palette${mobile ? ' phone' : ''}: closing the QR does not refocus the search field`, !focusOnInput, { focusOnInput });
  await ctx.close();
};

const iconsNoBadge = async (browser, base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('lx-view', 'icons'); localStorage.setItem('lx-lang', 'en'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(base + '/#tools');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  const r = await page.evaluate(() => {
    const items = [...document.querySelectorAll('#appGrid .app-card--icon')].map((c) => c.querySelector('.app-icon-wrapper').getBoundingClientRect());
    let overlaps = 0;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j]; if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) overlaps++; }
    return { badges: document.querySelectorAll('#appGrid .app-card--icon .card-qr').length, rest: Math.max(...[...document.querySelectorAll('#appGrid .app-card--icon .card-qr')].map((b) => Number(getComputedStyle(b).opacity))), overlaps, tiles: items.length };
  });
  record('icons view: one hidden QR chip per tile at rest and no overlapping tiles', r.badges === r.tiles && r.rest === 0 && r.overlaps === 0 && r.tiles > 0, r);
  const flat = await page.evaluate(() => {
    const plates = [...document.querySelectorAll('#appGrid .icon-plate')];
    const vertical = plates.filter((p) => { const k = [...p.querySelectorAll('.app-card--icon .app-icon-wrapper')].map((w) => w.getBoundingClientRect()); return k.length > 1 && Math.abs(k[0].top - k[1].top) > 4; }).length;
    return { plates: plates.length, vertical };
  });
  record('icons view: icons of one app sit side by side inside their plate', flat.plates > 0 && flat.vertical === 0, flat);
  await page.keyboard.press('Alt+KeyQ');
  await page.waitForTimeout(600);
  const open = await page.evaluate(() => document.getElementById('lx-qr').open);
  record('icons view: QR still reachable from the keyboard', open, { open });
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('lx-qr').open, null, { timeout: 3000 });
  const tile = page.locator('#appGrid .app-card--icon').nth(2);
  const tileHref = await tile.locator('.card-link-overlay').evaluate((a) => a.href);
  await tile.hover();
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('#appGrid .app-card--icon:hover .card-qr--icon')).opacity) === 1, null, { timeout: 2000 });
  await tile.locator('.card-qr--icon').click();
  await page.waitForSelector('#lx-qr[open]');
  await page.waitForTimeout(800);
  const chipData = await decode(page);
  record('icons view: hover reveals a QR chip that opens that tile\'s QR', chipData === tileHref, { chipData, tileHref });
  await ctx.close();
};

const bentoVisible = async (browser, base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await ctx.addInitScript(() => { try { localStorage.setItem('lx-view', 'bento'); localStorage.setItem('lx-lang', 'en'); } catch (e) {} });
  const page = await ctx.newPage();
  await page.goto(base + '/#tools');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  await page.mouse.move(5, 5);
  const r = await page.evaluate(() => {
    const cards = [...document.querySelectorAll('#appGrid .app-card')];
    const hidden = cards.filter((c) => { const b = c.querySelector('.card-qr'); if (!b) return true; const cs = getComputedStyle(b); const r = b.getBoundingClientRect(); return cs.opacity !== '1' || cs.visibility === 'hidden' || r.width < 24 || r.height < 24; }).length;
    const stray = cards.filter((c) => { const b = c.querySelector('.card-qr'); const cr = c.getBoundingClientRect(); const br = b.getBoundingClientRect(); return br.left < cr.left || br.right > cr.right || br.top < cr.top || br.bottom > cr.bottom; }).length;
    return { cards: cards.length, hidden, stray };
  });
  record('bento: every card shows its QR chip without hovering and inside the card', r.cards > 0 && r.hidden === 0 && r.stray === 0, r);
  await ctx.close();
};

const watch = (page) => page.evaluate(() => new Promise((res) => {
  const d = document.getElementById('lx-qr');
  const t0 = performance.now();
  let opened = false;
  let closedAfter = false;
  let peak = 0;
  let dropped = false;
  const tick = () => {
    const o = d.open;
    if (o) {
      opened = true;
      const op = parseFloat(getComputedStyle(d).opacity);
      if (op > peak) peak = op;
      if (peak >= 0.95 && op < 0.9) dropped = true;
    } else if (opened) closedAfter = true;
    if (performance.now() - t0 < 2200) requestAnimationFrame(tick);
    else res({ opened, closedAfter, peak: Math.round(peak * 100) / 100, dropped });
  };
  tick();
}));

const realPress = async (page, loc) => {
  const b = await loc.boundingBox();
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x - 90, y + 50, { steps: 6 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.waitForTimeout(120);
  const w = watch(page);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  return w;
};

const stable = async (browser, base) => {
  for (const view of ['bento', 'list']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((v) => { try { localStorage.setItem('lx-view', v); localStorage.setItem('lx-lang', 'en'); } catch (e) {} }, view);
    const page = await ctx.newPage();
    await page.goto(base + '/#tools');
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(2200);
    const r = await realPress(page, page.locator('#appGrid .app-card').nth(2).locator('.card-qr'));
    record(`${view}: real mouse press opens the QR and it stays open`, r.opened && !r.closedAfter && !r.dropped && r.peak >= 0.95, r);
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2200);
  await page.mouse.click(700, 190);
  await page.waitForSelector('#lx-palette[open]');
  await page.keyboard.type('pa');
  await page.waitForTimeout(800);
  const row = page.locator('#lx-palette .palette-item').nth(1);
  const rb = await row.boundingBox();
  await page.mouse.move(rb.x + 120, rb.y + 12, { steps: 6 });
  await page.waitForTimeout(300);
  const r = await realPress(page, row.locator('.palette-qr'));
  record('palette: real mouse press on the hovered row opens the QR and it stays open', r.opened && !r.closedAfter && !r.dropped && r.peak >= 0.95, r);
  await ctx.close();
};


const matrix = async (browser, base) => {
  const combos = [];
  for (const palette of ['vivid', 'curated', 'muted', 'mono']) for (const theme of ['light', 'dark']) for (const lang of ['en', 'ar']) combos.push({ palette, theme, lang, mobile: false });
  for (const palette of ['vivid', 'mono']) for (const theme of ['light', 'dark']) combos.push({ palette, theme, lang: 'ar', mobile: true });
  let ok = 0;
  const bad = [];
  for (const c of combos) {
    const ctx = await browser.newContext(c.mobile ? { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true } : { viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript((o) => { try { localStorage.setItem('lx-palette', o.palette); localStorage.setItem('lx-theme', o.theme); localStorage.setItem('lx-lang', o.lang); } catch (e) {} }, c);
    const page = await ctx.newPage();
    await page.goto(base + '/#core');
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(1600);
    const link = page.locator('#appGrid .app-card').nth(2).locator('.card-link-overlay');
    const href = await link.evaluate((a) => a.href);
    await link.focus();
    await page.keyboard.press('Alt+KeyQ');
    await page.waitForFunction(() => { const d = document.getElementById('lx-qr'); return d.open && Number(getComputedStyle(d).opacity) >= 0.99 && !!d.querySelector('.qr-layer .qr-svg'); }, null, { timeout: 4000 });
    await page.waitForTimeout(1500);
    const data = await decode(page);
    if (data === href) ok++; else bad.push({ ...c, data });
    await ctx.close();
  }
  record('decode: every palette x theme x direction, desktop and phone sheet', ok === combos.length, { ok, total: combos.length, bad: bad.slice(0, 3) });
};

const bentoChipDrift = async (browser, base) => {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await boost(ctx);
  await ctx.addInitScript(() => { try { localStorage.setItem('lx-view', 'bento'); localStorage.setItem('lx-lang', 'en'); } catch (e) {} });
  const page = await ctx.newPage();
  let found = null;
  for (const tab of ['tools', 'core', 'experimental']) {
    await page.goto(`${base}/#${tab}`);
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(2200);
    const idx = await page.evaluate(() => [...document.querySelectorAll('#appGrid .app-card')].findIndex((c) => c.querySelector('.header-end .badges') && c.querySelector('.card-qr')));
    if (idx >= 0) { found = { tab, idx }; break; }
  }
  if (!found) {
    record('bento: the QR chip drifts with the badges beside it', false, { error: 'no card with a badge' });
    await ctx.close();
    return;
  }
  const measure = () => page.evaluate((i) => {
    const c = document.querySelectorAll('#appGrid .app-card')[i];
    const q = c.querySelector('.card-qr').getBoundingClientRect();
    const b = c.querySelector('.header-end .badges').getBoundingClientRect();
    const cr = c.getBoundingClientRect();
    return { qx: q.left, qy: q.top, bx: b.left, by: b.top, cx: cr.left, cy: cr.top, cw: cr.width };
  }, found.idx);
  await page.mouse.move(5, 5);
  await page.waitForTimeout(500);
  const rest = await measure();
  await page.mouse.move(rest.cx + 6, rest.cy + 6, { steps: 10 });
  await page.waitForTimeout(500);
  const hov = await measure();
  const sc = hov.cw / rest.cw;
  const drift = (px, py) => ({ x: (hov[px] - hov.cx) - (rest[px] - rest.cx) * sc, y: (hov[py] - hov.cy) - (rest[py] - rest.cy) * sc });
  const dq = drift('qx', 'qy');
  const db = drift('bx', 'by');
  const together = Math.abs(dq.x - db.x) < 0.5 && Math.abs(dq.y - db.y) < 0.5;
  const moved = Math.hypot(dq.x, dq.y) > 0.5;
  record('bento: the QR chip drifts with the badges beside it (same shift, and it does move)', together && moved, { dq, db, ...found });
  await ctx.close();
};

const iconsChipAnchor = async (browser, base) => {
  const bad = [];
  const cases = [['en', '0', 1440], ['ar', '0', 1440], ['en', '1', 1440], ['ar', '1', 1440], ['en', '0', 360], ['ar', '0', 360]];
  for (const [lang, zen, width] of cases) {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await boost(ctx);
    await ctx.addInitScript((o) => { try { localStorage.setItem('lx-view', 'icons'); localStorage.setItem('lx-lang', o.lang); localStorage.setItem('lx-zen', o.zen); } catch (e) {} }, { lang, zen });
    const page = await ctx.newPage();
    await page.goto(`${base}/#core`);
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(2200);
    for (const sel of ['#appGrid > .app-card--icon', '#appGrid .icon-plate > .app-card--icon']) {
      const tile = page.locator(sel).first();
      if (!(await tile.count())) { bad.push({ lang, zen, width, sel, error: 'no tile' }); continue; }
      await tile.scrollIntoViewIfNeeded();
      await tile.locator('.card-link-overlay').hover();
      await page.waitForTimeout(600);
      const r = await tile.evaluate((el) => {
        const w = el.querySelector('.app-icon-wrapper').getBoundingClientRect();
        const q = el.querySelector('.card-qr--icon').getBoundingClientRect();
        const rtl = getComputedStyle(el).direction === 'rtl';
        const corner = { x: rtl ? w.left : w.right, y: w.top };
        return { dist: Math.hypot(q.left + q.width / 2 - corner.x, q.top + q.height / 2 - corner.y), opacity: Number(getComputedStyle(el.querySelector('.card-qr--icon')).opacity), rtl };
      });
      if (r.dist > 10 || r.opacity < 0.99) bad.push({ lang, zen, width, sel, ...r });
    }
    await ctx.close();
  }
  record('icons view: on hover the QR chip sits within 10 px of the tile corner (LTR and RTL, normal, Zen and 360 px)', bad.length === 0, bad.slice(0, 4));
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const steps = [core('en', false), core('ar', false), core('en', true), variants, palette, site, reduced, offline, cardButton('bento', false), cardButton('bento', true), cardButton('list', true), iconsNoBadge, bentoVisible, stable, paletteRow(false), paletteRow(true), matrix, bentoChipDrift, iconsChipAnchor];
  for (const step of steps) {
    try { await step(browser, server.base); } catch (e) { record(step.name || 'step', false, { error: String(e.message || e).slice(0, 240) }); }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

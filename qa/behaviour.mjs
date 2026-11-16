import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { collectorInit } from '../perf/collector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TIMING = process.argv.includes('--timing');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const boost = (ctx) => ctx.addInitScript(() => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
});

const open = async (browser, base, opts = {}, url = '/') => {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1440, height: 900 }, hasTouch: !!opts.mobile, isMobile: !!opts.mobile, reducedMotion: opts.reduced ? 'reduce' : 'no-preference', ...(opts.scheme ? { colorScheme: opts.scheme } : {}), serviceWorkers: opts.noSw ? 'block' : 'allow' });
  await boost(ctx);
  await ctx.addInitScript(collectorInit);
  if (opts.setup) await opts.setup(ctx);
  const page = await ctx.newPage();
  await page.goto(base + url);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2500);
  return { ctx, page };
};

const versionSwitches = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'blink.user_timing'] });
  const r = await page.evaluate(async () => {
    const cards = [...document.querySelectorAll('#appGrid .app-card')].filter((c) => c.querySelectorAll('.variant-chip').length > 1);
    const card = cards.find((c) => !c.querySelector('[data-ms^="g:"], [data-ms^="f:"]')) || cards[0];
    const t0 = performance.now();
    performance.mark('lx-in');
    const gaps = [];
    let last = performance.now();
    let stop = false;
    const loop = (ts) => { gaps.push(ts - last); last = ts; if (!stop) requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
    for (let i = 0; i < 20; i++) {
      const chips = [...card.querySelectorAll('.variant-chip')];
      (chips.find((c) => c.getAttribute('aria-checked') !== 'true') || chips[0]).click();
      await new Promise((res) => setTimeout(res, 140));
    }
    stop = true;
    performance.mark('lx-out');
    const reqs = performance.getEntriesByType('resource').filter((e) => e.startTime >= t0 && (e.initiatorType === 'img' || e.initiatorType === 'css' || /\.(png|jpe?g|webp|avif|svg|ico)(\?|$)/i.test(e.name))).length;
    return { reqs, worstGap: Math.max(...gaps.slice(2)) };
  });
  const trace = JSON.parse((await browser.stopTracing()).toString('utf8')).traceEvents;
  const a = trace.find((e) => e.name === 'lx-in');
  const b = trace.find((e) => e.name === 'lx-out');
  const decodes = a && b ? trace.filter((e) => (e.name === 'Decode Image' || e.name === 'ImageDecodeTask') && e.ts >= a.ts && e.ts <= b.ts).length : null;
  record('20 version switches: no image requests', r.reqs === 0, { requests: r.reqs });
  record('20 version switches: no image decodes', decodes === 0, { decodes });
  if (TIMING) record('20 version switches: no frame over 32 ms (desktop)', r.worstGap <= 32, { worstFrameMs: Math.round(r.worstGap) });
  await ctx.close();
};

const legacyMotion = async (browser, base) => {
  const probe = async (query) => {
    const { ctx, page } = await open(browser, base, {}, '/' + query);
    const info = await page.evaluate(() => ({
      motion: document.documentElement.dataset.motion || null,
      version: getComputedStyle(document.documentElement).getPropertyValue('--lx-version-ms').trim(),
      boot: getComputedStyle(document.documentElement).getPropertyValue('--lx-boot-ms').trim(),
      saved: Object.keys(localStorage).filter((k) => /motion/i.test(k))
    }));
    const outMs = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll('.tab-btn')];
      const i = tabs.findIndex((t) => t.getAttribute('aria-selected') === 'true');
      tabs[(i + 1) % tabs.length].click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const out = document.getAnimations().filter((a) => { const t = a.effect && a.effect.target; return t && t.closest && t.closest('.grid-ghost'); }).map((a) => a.effect.getComputedTiming().duration);
      return out.length ? Math.max(...out) : null;
    });
    await ctx.close();
    return { ...info, outMs };
  };
  const legacy = await probe('?motion=legacy');
  const current = await probe('');
  record('?motion=legacy sets data-motion and the legacy timings', legacy.motion === 'legacy' && legacy.version === '240ms' && legacy.boot === '' && legacy.outMs === 120 && legacy.saved.length === 0, legacy);
  record('default motion uses the new timings', current.motion === null && current.version === '120ms' && current.boot === '360ms' && current.outMs === 120, current);
};

const manifestRefresh = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { mobile: true, noSw: true, viewport: { width: 390, height: 844 } });
  await page.evaluate(() => { const m = JSON.parse(localStorage.getItem('lx-icons')); m.hash = '00000000'; localStorage.setItem('lx-icons', JSON.stringify(m)); });
  const manifestUrl = /icons\/manifest\.v2\.json$/;
  await page.route(manifestUrl, async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue(); });
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => {
    const link = document.querySelectorAll('#appGrid .card-link-overlay')[2];
    link.focus();
    window.scrollTo(0, 120);
    return { focusId: link.href, y: Math.round(window.scrollY), sig: JSON.parse(localStorage.getItem('lx-icons')).hash };
  });
  await page.waitForTimeout(2600);
  const after = await page.evaluate(() => ({ focusId: document.activeElement && document.activeElement.href, y: Math.round(window.scrollY), sig: JSON.parse(localStorage.getItem('lx-icons')).hash }));
  const changed = before.sig === '00000000' && after.sig !== '00000000';
  record('focus and scroll are kept after a manifest hash change', changed && after.focusId === before.focusId && Math.abs(after.y - before.y) <= 1, { before, after });
  await ctx.close();
};

const reducedMotion = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { reduced: true });
  const quiet = () => page.evaluate(async () => { await new Promise((r) => setTimeout(r, 450)); return window.__perf.running(true); });
  const left = {};
  await page.evaluate(() => { const t = [...document.querySelectorAll('.tab-btn')]; const i = t.findIndex((x) => x.getAttribute('aria-selected') === 'true'); t[(i + 1) % t.length].click(); });
  left.tab = await quiet();
  await page.keyboard.press('Alt+KeyV');
  left.view = await quiet();
  await page.evaluate(() => { const c = [...document.querySelectorAll('#appGrid .app-card')].find((x) => x.querySelectorAll('.variant-chip').length > 1); if (c) [...c.querySelectorAll('.variant-chip')].find((x) => x.getAttribute('aria-checked') !== 'true').click(); });
  left.version = await quiet();
  await page.keyboard.press('Alt+KeyP');
  left.colors = await quiet();
  await page.keyboard.press('Control+KeyK');
  left.paletteOpen = await quiet();
  await page.keyboard.press('Escape');
  left.paletteClose = await quiet();
  record('reduced motion leaves no running animations after any interaction', Object.values(left).every((n) => n === 0), left);
  await ctx.close();
};


const versionColour = async (browser, base) => {
  const { ctx, page } = await open(browser, base);
  const read = () => page.evaluate(() => getComputedStyle(document.querySelector('#appGrid .app-card[data-app-id="ledger-form"]')).getPropertyValue('--c1').trim());
  const click = (i) => page.evaluate((n) => document.querySelectorAll('#appGrid .app-card[data-app-id="ledger-form"] .variant-chip')[n].click(), i);
  const first = await read();
  await click(1);
  await page.waitForTimeout(250);
  const second = await read();
  await click(0);
  await page.waitForTimeout(250);
  const back = await read();
  record('ledger-form: each version has its own colour and switching back restores it', !!first && !!second && first !== second && back === first, { first, second, back });
  await ctx.close();
};

const iconFallback = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { noSw: true, setup: (c) => c.route('**/icons/**', (r) => r.abort()) });
  const r = await page.evaluate(() => {
    const wraps = [...document.querySelectorAll('#appGrid .app-icon-wrapper')];
    const empty = wraps.filter((w) => {
      const m = w.querySelector('svg, .lx-glyph, .lx-fav');
      if (!m) return true;
      const b = m.getBoundingClientRect();
      return b.width === 0 || b.height === 0;
    }).length;
    return { tiles: wraps.length, empty };
  });
  record('icons blocked: every tile still renders a mark', r.tiles > 0 && r.empty === 0, r);
  await ctx.close();
};

const harvestEntry = async (browser, base) => {
  const { ctx, page } = await open(browser, base, { setup: (c) => c.route('https://harvest-studio-phi.vercel.app/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>ok</title>' })) });
  await page.keyboard.press('Control+KeyK');
  await page.waitForTimeout(400);
  await page.keyboard.type('harvest');
  await page.waitForTimeout(500);
  const active = await page.evaluate(() => { const a = document.querySelector('.palette-item.is-active'); return a ? a.dataset.key : null; });
  const popup = ctx.waitForEvent('page', { timeout: 4000 }).catch(() => null);
  await page.keyboard.press('Enter');
  const opened = await popup;
  if (opened) await opened.waitForURL(/^https:\/\/harvest-studio-phi\.vercel\.app\//, { timeout: 4000 }).catch(() => null);
  const url = opened ? opened.url() : null;
  record('palette Harvest entry opens Harvest Studio', active === 'harvest' && !!url && url.startsWith('https://harvest-studio-phi.vercel.app/'), { active, url });
  await ctx.close();
};

const confirmationDialogs = async (browser, base) => {
  for (const lang of ['en', 'ar']) {
    const original = JSON.stringify([{ title: { en: 'Original', ar: 'الأصلي' }, url: 'https://example.com/original', icon: 'fa-link' }]);
    const { ctx, page } = await open(browser, base, { setup: c => c.addInitScript(({ lang, original }) => {
      localStorage.setItem('lx-lang', lang);
      localStorage.setItem('lx-user-links', original);
    }, { lang, original }) });
    let nativeDialogs = 0;
    page.on('dialog', async d => { nativeDialogs += 1; await d.dismiss(); });
    const stored = () => page.evaluate(() => localStorage.getItem('lx-user-links'));
    const menu = async action => {
      await page.locator('#dataToggle').click();
      await page.locator(`[data-data-action="${action}"]`).click();
    };
    const dialog = page.locator('#lx-confirm');
    const cancel = page.locator('[data-confirm-action="cancel"]');
    const confirm = page.locator('[data-confirm-action="confirm"]');
    const upload = async () => {
      const chooser = page.waitForEvent('filechooser');
      await menu('import');
      await (await chooser).setFiles({ name: 'links.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ title: 'Replacement', url: 'https://example.com/replacement', icon: 'fa-link' }])) });
      await dialog.waitFor({ state: 'visible' });
    };
    await menu('reset');
    await dialog.waitFor({ state: 'visible' });
    record(`confirm ${lang}: safe action receives focus`, await cancel.evaluate(el => el === document.activeElement), {});
    await page.keyboard.press('Shift+Tab');
    record(`confirm ${lang}: reverse Tab stays in modal`, await confirm.evaluate(el => el === document.activeElement), {});
    await page.keyboard.press('Tab');
    record(`confirm ${lang}: Tab wraps to safe action`, await cancel.evaluate(el => el === document.activeElement), {});
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    record(`confirm ${lang}: Escape preserves records`, await stored() === original, {});
    await menu('reset');
    await dialog.waitFor({ state: 'visible' });
    await page.mouse.click(0, 0);
    await dialog.waitFor({ state: 'detached' });
    record(`confirm ${lang}: backdrop preserves records`, await stored() === original, {});
    await upload();
    await cancel.click();
    await dialog.waitFor({ state: 'detached' });
    record(`confirm ${lang}: import cancel preserves records`, await stored() === original, {});
    await upload();
    await confirm.click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('lx-user-links') || '[]').some(a => a.url === 'https://example.com/replacement'));
    const imported = JSON.parse(await stored());
    record(`confirm ${lang}: explicit import keeps existing replacement contract`, imported.length === 1 && imported[0].url === 'https://example.com/replacement', {});
    await menu('reset');
    await dialog.waitFor({ state: 'visible' });
    await confirm.click();
    await page.waitForFunction(() => localStorage.getItem('lx-user-links') === null);
    record(`confirm ${lang}: explicit reset removes imported records`, await stored() === null, {});
    record(`confirm ${lang}: no native dialogs`, nativeDialogs === 0, { nativeDialogs });
    await ctx.close();
  }
};

const confirmationEdges = async (browser, base) => {
  for (const lang of ['en', 'ar']) {
    const original = JSON.stringify([{ title: { en: 'Original', ar: 'الأصلي' }, url: 'https://example.com/original', icon: 'fa-link' }]);
    const changed = JSON.stringify([{ title: { en: 'Changed elsewhere', ar: 'تغير' }, url: 'https://example.com/changed', icon: 'fa-link' }]);
    const { ctx, page } = await open(browser, base, { setup: c => c.addInitScript(({ lang, original }) => {
      if (!sessionStorage.getItem('lx-seeded')) {
        sessionStorage.setItem('lx-seeded', '1');
        localStorage.setItem('lx-lang', lang);
        localStorage.setItem('lx-user-links', original);
      }
    }, { lang, original }) });
    const stored = () => page.evaluate(() => localStorage.getItem('lx-user-links'));
    const menu = async action => {
      await page.locator('#dataToggle').click();
      await page.locator(`[data-data-action="${action}"]`).click();
    };
    const dialog = page.locator('#lx-confirm');
    const confirm = page.locator('[data-confirm-action="confirm"]');
    const upload = async payload => {
      const chooser = page.waitForEvent('filechooser');
      await menu('import');
      await (await chooser).setFiles({ name: 'data.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(payload)) });
    };
    await menu('reset');
    await dialog.waitFor({ state: 'visible' });
    await page.evaluate(v => localStorage.setItem('lx-user-links', v), changed);
    await confirm.click();
    await dialog.waitFor({ state: 'detached' });
    await page.locator('.lx-toast').first().waitFor({ state: 'visible' });
    record(`confirm ${lang}: reset aborts when links changed while confirming`, await stored() === changed, {});
    await upload([{ title: 'Replacement', url: 'https://example.com/replacement', icon: 'fa-link' }]);
    await dialog.waitFor({ state: 'visible' });
    await page.evaluate(v => localStorage.setItem('lx-user-links', v), original);
    await confirm.click();
    await dialog.waitFor({ state: 'detached' });
    record(`confirm ${lang}: import aborts when links changed while confirming`, await stored() === original, {});
    await upload({ app: 'linkexpress', version: 1, links: [], prefs: { sound: '0' } });
    await page.waitForFunction(() => localStorage.getItem('lx-sound') === '0');
    record(`confirm ${lang}: prefs-only import shows no dialog and keeps links`, await dialog.count() === 0 && await stored() === original, {});
    await ctx.close();
  }
  for (const scheme of ['light', 'dark']) for (const lang of ['en', 'ar']) {
    const { ctx, page } = await open(browser, base, { mobile: true, scheme, viewport: { width: 390, height: 780 }, setup: c => c.addInitScript(({ lang }) => {
      localStorage.setItem('lx-lang', lang);
      localStorage.setItem('lx-user-links', JSON.stringify([{ title: { en: 'Original', ar: 'الأصلي' }, url: 'https://example.com/original', icon: 'fa-link' }]));
    }, { lang }) });
    await page.locator('#dataToggle').click();
    await page.locator('[data-data-action="reset"]').click();
    const dialog = page.locator('#lx-confirm');
    await dialog.waitFor({ state: 'visible' });
    await page.waitForTimeout(500);
    const m = await page.evaluate(() => {
      const d = document.querySelector('#lx-confirm');
      const r = d.getBoundingClientRect();
      const bs = [...d.querySelectorAll('button')].map(b => b.getBoundingClientRect());
      const bg = getComputedStyle(d).backgroundColor;
      const alpha = /\/\s*([\d.]+)\s*\)|rgba\([^)]*,\s*([\d.]+)\)/.exec(bg);
      return { inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, buttonsInside: bs.every(b => b.left >= r.left - 1 && b.right <= r.right + 1 && b.top >= r.top - 1 && b.bottom <= r.bottom + 1), tall: bs.every(b => b.height >= 44), rtl: getComputedStyle(d).direction, alpha: alpha ? Number(alpha[1] ?? alpha[2]) : 1 };
    });
    record(`confirm ${scheme} ${lang} phone: dialog and buttons fit the viewport`, m.inside && m.buttonsInside, m);
    record(`confirm ${scheme} ${lang} phone: buttons are at least 44px tall`, m.tall, m);
    record(`confirm ${scheme} ${lang} phone: fill is opaque and direction matches`, m.alpha === 1 && m.rtl === (lang === 'ar' ? 'rtl' : 'ltr'), m);
    await page.keyboard.press('Escape');
    await ctx.close();
  }
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  for (const step of [versionSwitches, legacyMotion, manifestRefresh, reducedMotion, versionColour, iconFallback, harvestEntry, confirmationDialogs, confirmationEdges]) {
    try { await step(browser, server.base); } catch (e) { record(step.name, false, { error: String(e.message || e).slice(0, 200) }); }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.argv[2];
const imp = (p) => import(pathToFileURL(path.join(root, p)).href);
const { launchBrowser } = await imp('perf/browser.mjs');
const { startServer } = await imp('perf/server.mjs');
const { siteRoot } = await imp('perf/site-root.mjs');
const results = [];
const rec = (n, p, d) => { results.push({ n, p, d }); };

const sig = (page) => page.evaluate(() => [...document.querySelectorAll('#appGrid > .app-card, #appGrid > .icon-plate, #appGrid .icon-row > *')].map((c) => {
  const a = c.querySelector('.card-link-overlay, a');
  return [c.dataset.appId || '', (c.textContent || '').replace(/\s+/g, ' ').trim(), a ? a.getAttribute('href') : '', a ? a.getAttribute('aria-label') : ''].join('|');
}).join('\n') + '\nlayout=' + document.getElementById('appGrid').dataset.layout + '\nlabel=' + document.getElementById('appGrid').getAttribute('aria-labelledby'));
const tabIds = (page) => page.evaluate(() => [...document.querySelectorAll('.tab-btn')].map((b) => b.id));
const go = async (page, id) => { await page.locator('#' + id).click(); await page.waitForTimeout(700); };
const open = async (browser, base, init, opts = {}) => {
  const ctx = await browser.newContext({ viewport: opts.viewport || { width: 1280, height: 900 }, reducedMotion: opts.reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(init || (() => {}));
  const page = await ctx.newPage();
  await page.goto(base + '/');
  await page.waitForSelector('#appGrid .app-card, #appGrid .icon-plate');
  await page.waitForTimeout(1800);
  return { ctx, page };
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  for (const lang of ['en', 'ar']) {
    const { ctx, page } = await open(browser, server.base, (l) => { localStorage.setItem('lx-lang', l); }, {});
    await page.close(); await ctx.close();
  }
  for (const lang of ['en', 'ar']) {
    const init = `localStorage.setItem('lx-lang','${lang}')`;
    const { ctx, page } = await open(browser, server.base, new Function(init));
    const ids = (await tabIds(page)).filter((i) => i.startsWith('tab-'));
    const first = {};
    for (const id of ids) { await go(page, id); first[id] = await sig(page); }
    rec(`${lang}: tabs found`, ids.length >= 3, ids);
    await page.evaluate(() => { window.__mark = new Map(); });
    for (const id of ids) { await go(page, id); await page.evaluate((i) => { document.querySelectorAll('#appGrid > .app-card').forEach((c, k) => { c.__m = i + k; }); }, id); }
    let allSame = true; let reused = true; let hitFlag = true;
    for (let r = 0; r < 3; r++) for (const id of ids) {
      await go(page, id);
      if ((await sig(page)) !== first[id]) allSame = false;
      const info = await page.evaluate((i) => ({ hit: document.getElementById('appGrid')._cacheHit, marks: [...document.querySelectorAll('#appGrid > .app-card')].every((c, k) => c.__m === i + k) }), id);
      if (!info.marks) reused = false;
      if (!info.hit) hitFlag = false;
    }
    rec(`${lang}: A->B->C->A content identical across 3 laps`, allSame, {});
    rec(`${lang}: returning tab reuses the same DOM nodes`, reused, {});
    rec(`${lang}: returning tab reports cache hit`, hitFlag, {});

    const other = lang === 'en' ? 'ar' : 'en';
    await go(page, ids[0]);
    await page.locator('#langToggle').click();
    await page.waitForTimeout(1200);
    const expectedAfter = {};
    {
      const fresh = await open(browser, server.base, new Function(`localStorage.setItem('lx-lang','${other}')`));
      for (const id of ids) { await go(fresh.page, id); expectedAfter[id] = await sig(fresh.page); }
      await fresh.page.close(); await fresh.ctx.close();
    }
    let langOk = true; const bad = [];
    for (const id of ids) { await go(page, id); const s = await sig(page); if (s !== expectedAfter[id]) { langOk = false; bad.push(id); } }
    rec(`${lang}->${other}: every tab shows fresh-language cards (no stale cache)`, langOk, bad);
    await page.locator('#langToggle').click();
    await page.waitForTimeout(1200);
    let backOk = true;
    for (const id of ids) { await go(page, id); if ((await sig(page)) !== first[id]) backOk = false; }
    rec(`${other}->${lang}: back to original identical`, backOk, {});

    for (const view of ['list', 'icons', 'bento']) {
      await page.locator('#lookToggle').click();
      await page.waitForTimeout(300);
      await page.locator(`[data-look-view="${view}"]`).click();
      await page.waitForTimeout(900);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      let ok = true; const det = [];
      for (let lap = 0; lap < 2; lap++) for (const id of ids) {
        await go(page, id);
        const st = await page.evaluate(() => ({ v: document.documentElement.dataset.view, l: document.getElementById('appGrid').dataset.layout || 'bento', n: document.querySelectorAll('#appGrid > .app-card, #appGrid .icon-plate').length }));
        const expect = view;
        if (st.v !== view || st.l !== expect || st.n === 0) { ok = false; det.push({ id, st }); }
      }
      rec(`${lang}: view ${view} holds across tab switches`, ok, det);
    }
    {
      const base = {};
      for (const id of ids) { await go(page, id); base[id] = await sig(page); }
      const fresh = await open(browser, server.base, new Function(init));
      let eq = true;
      for (const id of ids) { await go(fresh.page, id); if ((await sig(fresh.page)).replace(/layout=.*\n?/, '') !== base[id].replace(/layout=.*\n?/, '')) eq = false; }
      rec(`${lang}: bento after view round-trip equals a fresh load`, eq, {});
      await fresh.page.close(); await fresh.ctx.close();
    }

    await go(page, ids[0]);
    const variantTest = await page.evaluate(() => {
      const card = [...document.querySelectorAll('#appGrid > .app-card')].find((c) => c.querySelectorAll('.variant-chip').length > 1);
      if (!card) return null;
      const chips = [...card.querySelectorAll('.variant-chip')];
      const target = chips.find((c) => c.getAttribute('aria-checked') !== 'true') || chips[1];
      target.click();
      return { id: card.dataset.appId, label: target.textContent.trim() };
    });
    await page.waitForTimeout(700);
    if (variantTest) {
      const before = await page.evaluate((id) => { const c = document.querySelector(`#appGrid > .app-card[data-app-id="${id}"]`); return c.querySelector('.card-link-overlay, a')?.getAttribute('href'); }, variantTest.id);
      await go(page, ids[1]); await go(page, ids[0]);
      const after = await page.evaluate((id) => { const c = document.querySelector(`#appGrid > .app-card[data-app-id="${id}"]`); return c.querySelector('.card-link-overlay, a')?.getAttribute('href'); }, variantTest.id);
      rec(`${lang}: chosen variant survives leaving and returning`, before === after, { before, after });
    }

    let clean = true; const counts = {};
    for (const id of ids) { await go(page, id); counts[id] = await page.evaluate(() => document.querySelectorAll('#appGrid > .app-card, #appGrid .icon-plate').length); }
    const burst = await page.evaluate(async (list) => {
      for (let i = 0; i < 60; i++) { document.getElementById(list[i % list.length]).click(); await new Promise((r) => setTimeout(r, 25 + (i % 5) * 20)); }
      return true;
    }, ids);
    await page.waitForTimeout(1500);
    const finalState = await page.evaluate(() => {
      const g = document.getElementById('appGrid');
      const sel = document.querySelector('.tab-btn[aria-selected="true"]');
      const cards = [...g.querySelectorAll('.app-card, .icon-plate')];
      const idsList = cards.map((c) => c.dataset.appId);
      return { sel: sel && sel.id, label: g.getAttribute('aria-labelledby'), n: cards.length, dupes: idsList.length - new Set(idsList).size, opacity: getComputedStyle(g).opacity };
    });
    rec(`${lang}: 60-click tab burst ends consistent`, finalState.dupes === 0 && finalState.label === finalState.sel && finalState.n === counts[finalState.sel] && finalState.opacity === '1', { finalState, expected: counts[finalState.sel] });
    await page.close(); await ctx.close();
  }

  {
    const links = JSON.stringify([{ title: { en: 'Original One', ar: 'الأول' }, url: 'https://example.com/one', icon: 'fa-link' }, { title: { en: 'Original Two', ar: 'الثاني' }, url: 'https://example.com/two', icon: 'fa-link' }]);
    const { ctx, page } = await open(browser, server.base, new Function(`localStorage.setItem('lx-lang','en');localStorage.setItem('lx-user-links', ${JSON.stringify(links)})`));
    const ids = (await tabIds(page)).filter((i) => i.startsWith('tab-'));
    for (const id of ids) await go(page, id);
    const texts = async () => page.evaluate(() => document.body.innerText.includes('Replacement') + ':' + document.body.innerText.includes('Original One'));
    const tabsWithOriginal = [];
    for (const id of ids) { await go(page, id); if ((await texts()).endsWith(':true')) tabsWithOriginal.push(id); }
    rec('import: personal links present before import', tabsWithOriginal.length >= 1, tabsWithOriginal);
    await page.locator('#dataToggle').click();
    const chooser = page.waitForEvent('filechooser');
    await page.locator('[data-data-action="import"]').click();
    await (await chooser).setFiles({ name: 'links.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify([{ title: 'Replacement', url: 'https://example.com/replacement', icon: 'fa-link' }])) });
    await page.locator('#lx-confirm').waitFor({ state: 'visible' });
    await page.locator('[data-confirm-action="confirm"]').click();
    await page.waitForTimeout(1500);
    let stale = [];
    for (const id of ids) { await go(page, id); const r = await texts(); if (r.endsWith(':true')) stale.push(id); }
    rec('import: no stale original card on any tab afterwards', stale.length === 0, stale);
    let found = false;
    for (const id of ids) { await go(page, id); if ((await texts()).startsWith('true')) found = true; }
    rec('import: replacement card appears', found, {});
    await page.close(); await ctx.close();
  }

  for (const reduced of [true]) {
    const { ctx, page } = await open(browser, server.base, new Function(`localStorage.setItem('lx-lang','en')`), { reduced });
    const ids = (await tabIds(page)).filter((i) => i.startsWith('tab-'));
    for (const id of ids) await go(page, id);
    let ok = true;
    for (let i = 0; i < 12; i++) { await go(page, ids[i % ids.length]); const op = await page.evaluate(() => getComputedStyle(document.getElementById('appGrid')).opacity); if (op !== '1') ok = false; }
    rec('reduced motion: tab switching leaves grid fully visible', ok, {});
    await page.close(); await ctx.close();
  }

  await browser.close();
  await server.close();
  let failed = 0;
  for (const r of results) { if (!r.p) failed++; console.log(`${r.p ? 'PASS' : 'FAIL'}  ${r.n}  ${JSON.stringify(r.d).slice(0, 300)}`); }
  console.log(JSON.stringify({ total: results.length, failed }));
  process.exit(failed ? 1 : 0);
};
main().catch((e) => { console.error(e); process.exit(2); });

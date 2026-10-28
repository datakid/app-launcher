import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { collectorInit } from '../perf/collector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const open = async (browser, base, { view = 'icons', lang = 'en', width = 1280, height = 900, tab = 'core', zen = '0', reduced = false } = {}) => {
  const ctx = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
  });
  await ctx.addInitScript(collectorInit);
  await ctx.addInitScript(([v, l, z]) => {
    try { localStorage.setItem('lx-view', v); localStorage.setItem('lx-lang', l); localStorage.setItem('lx-zen', z); } catch (e) {}
  }, [view, lang, zen]);
  const page = await ctx.newPage();
  await page.goto(`${base}/#${tab}`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(1200);
  await settle(page);
  return { ctx, page };
};

const settle = async (page) => {
  await page.waitForFunction(() => window.__perf.running(true) === 0 && !document.querySelector('.grid-ghost'), null, { timeout: 15000, polling: 50 }).catch(() => {});
  await page.waitForTimeout(150);
};

const openLook = async (page) => {
  const expanded = await page.getAttribute('#lookToggle', 'aria-expanded');
  if (expanded !== 'true') await page.click('#lookToggle');
  await page.waitForSelector('[data-look-view]', { state: 'attached' });
};

const TRIGGERS = {
  tab: (id) => `document.getElementById('tab-${id}').click()`,
  view: (id) => `document.querySelector('[data-look-view="${id}"]').click()`
};

const popIn = (browser, base) => async () => {
  const cases = [
    { label: 'tab core to tools', view: 'icons', tab: 'core', trigger: TRIGGERS.tab('tools') },
    { label: 'tab core to experimental', view: 'icons', tab: 'core', trigger: TRIGGERS.tab('experimental') },
    { label: 'view bento to icons', view: 'bento', tab: 'tools', trigger: TRIGGERS.view('icons'), look: true },
    { label: 'view list to icons', view: 'list', tab: 'experimental', trigger: TRIGGERS.view('icons'), look: true }
  ];
  const bad = [];
  let plates = 0;
  let units = 0;
  for (const c of cases) {
    const { ctx, page } = await open(browser, base, { view: c.view, tab: c.tab });
    if (c.look) await openLook(page);
    const r = await page.evaluate(async (trigger) => {
      const before = document.getElementById('appGrid');
      new Function(trigger)();
      await new Promise((res) => setTimeout(res, 16));
      const grid = document.getElementById('appGrid');
      const out = [...grid.children].map((el) => ({ cls: el.className, opacity: Number(getComputedStyle(el).opacity), plate: el.classList.contains('icon-plate') }));
      return { same: grid === before, out, layout: grid.dataset.layout };
    }, c.trigger);
    const hot = r.out.filter((o) => o.opacity > 0.05);
    plates += r.out.filter((o) => o.plate).length;
    units += r.out.length;
    if (r.layout !== 'icons' || hot.length) bad.push({ case: c.label, layout: r.layout, visible: hot.map((h) => h.cls.slice(0, 40)) });
    await ctx.close();
  }
  if (!plates) bad.push({ error: 'no plate was exercised' });
  record('icons switch: no unit of the incoming grid is visible 16 ms after the trigger', bad.length === 0, bad.length ? bad : { units, plates });
};

const noSnap = (browser, base) => async () => {
  const cases = [
    { label: 'tab core to experimental', view: 'icons', tab: 'core', trigger: TRIGGERS.tab('experimental') },
    { label: 'tab experimental to tools', view: 'icons', tab: 'experimental', trigger: TRIGGERS.tab('tools') },
    { label: 'view list to icons', view: 'list', tab: 'experimental', trigger: TRIGGERS.view('icons'), look: true }
  ];
  const bad = [];
  let halves = 0;
  let animated = 0;
  for (const lang of ['en', 'ar']) {
    for (const c of cases) {
      const { ctx, page } = await open(browser, base, { view: c.view, tab: c.tab, lang });
      if (c.look) await openLook(page);
      const r = await page.evaluate(async (trigger) => {
        const grid = document.getElementById('appGrid');
        const centres = () => [...grid.children].map((el) => {
          const b = el.getBoundingClientRect();
          return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
        });
        new Function(trigger)();
        const tracked = () => document.getAnimations().filter((a) => {
          const t = a.effect && a.effect.target;
          if (a.constructor.name !== 'Animation' || !t || !t.closest || !t.closest('#appGrid')) return false;
          return Number.isFinite(a.effect.getComputedTiming().endTime);
        });
        let anims = [];
        const t0 = performance.now();
        while (!anims.length && performance.now() - t0 < 1500) {
          await new Promise((res) => requestAnimationFrame(res));
          anims = tracked();
        }
        anims.forEach((a) => { a.pause(); a.currentTime = a.effect.getComputedTiming().endTime - 1; });
        await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
        const late = centres();
        anims.forEach((a) => a.finish());
        await Promise.allSettled(anims.map((a) => a.finished));
        await new Promise((res) => setTimeout(res, 150));
        const settled = centres();
        const g = document.getElementById('appGrid');
        let drift = 0;
        const n = Math.min(late.length, settled.length);
        for (let i = 0; i < n; i++) drift = Math.max(drift, Math.abs(late[i].x - settled[i].x), Math.abs(late[i].y - settled[i].y));
        return { drift: Math.round(drift * 10) / 10, units: n, animated: anims.length, halves: g.querySelectorAll('.ic-half').length };
      }, c.trigger);
      animated += r.animated;
      halves += r.halves;
      if (!r.animated || r.drift >= 0.5) bad.push({ lang, case: c.label, ...r });
      await ctx.close();
    }
  }
  record('icons switch: units do not move sideways when the entrance animation ends (LTR and RTL)', bad.length === 0, bad.length ? bad : { animated, halves });
};

const rowsCentred = (browser, base) => async () => {
  const bad = [];
  let rowsSeen = 0;
  for (const lang of ['en', 'ar']) {
    for (const tab of ['core', 'tools', 'experimental']) {
      const { ctx, page } = await open(browser, base, { view: 'icons', tab, lang });
      const r = await page.evaluate(() => {
        const grid = document.getElementById('appGrid');
        const probe = document.createElement('div');
        probe.style.cssText = 'grid-column:1/-1;block-size:0;visibility:hidden';
        grid.appendChild(probe);
        const pb = probe.getBoundingClientRect();
        const mid = pb.left + pb.width / 2;
        probe.remove();
        const rows = new Map();
        [...grid.children].forEach((el) => {
          const b = el.getBoundingClientRect();
          const key = Math.round(b.top / 3);
          const row = rows.get(key) || { l: Infinity, r: -Infinity };
          row.l = Math.min(row.l, b.left);
          row.r = Math.max(row.r, b.right);
          rows.set(key, row);
        });
        return [...rows.values()].map((row) => Math.abs((row.l + row.r) / 2 - mid));
      });
      rowsSeen += r.length;
      const off = r.filter((d) => d > 1);
      if (off.length) bad.push({ lang, tab, off: off.map((d) => Math.round(d * 10) / 10) });
      await ctx.close();
    }
  }
  record('icons switch: every settled row stays centred on the grid after a switch', bad.length === 0, bad.length ? bad : { rowsSeen });
};

const ghostGone = (browser, base) => async () => {
  const bad = [];
  for (const [view, tab, trigger, look] of [['icons', 'core', TRIGGERS.tab('tools'), false], ['list', 'tools', TRIGGERS.view('icons'), true], ['bento', 'core', TRIGGERS.view('icons'), true]]) {
    const { ctx, page } = await open(browser, base, { view, tab });
    if (look) await openLook(page);
    await page.evaluate((t) => { new Function(t)(); }, trigger);
    await page.waitForTimeout(100);
    const during = await page.evaluate(() => document.querySelectorAll('.grid-ghost').length);
    await settle(page);
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ ghosts: document.querySelectorAll('.grid-ghost').length, grids: document.querySelectorAll('#appGrid').length, running: window.__perf.running(true) }));
    if (!during || after.ghosts !== 0 || after.grids !== 1 || after.running !== 0) bad.push({ view, tab, during, ...after });
    await ctx.close();
  }
  record('icons switch: the outgoing ghost exists during the switch and is gone afterwards', bad.length === 0, bad);
};

const rapid = (browser, base) => async () => {
  const bad = [];
  for (const start of ['icons', 'list', 'bento']) {
    const { ctx, page } = await open(browser, base, { view: start });
    const order = ['bento', 'list', 'icons'];
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press('Alt+KeyV');
      await page.waitForTimeout(40);
    }
    const expected = order[(order.indexOf(start) + 10) % 3];
    await settle(page);
    await page.waitForTimeout(500);
    const r = await page.evaluate(() => ({
      view: document.documentElement.dataset.view,
      layout: document.getElementById('appGrid').dataset.layout || 'bento',
      grids: document.querySelectorAll('#appGrid').length,
      ghosts: document.querySelectorAll('.grid-ghost').length,
      running: window.__perf.running(true),
      cards: document.querySelectorAll('#appGrid .app-card').length
    }));
    if (r.view !== expected || r.layout !== expected || r.grids !== 1 || r.ghosts !== 0 || r.running !== 0 || !r.cards) bad.push({ start, expected, ...r });
    await ctx.close();
  }
  record('icons switch: 10 rapid view toggles end with one grid, no ghost and the right view', bad.length === 0, bad);
};

const reduced = (browser, base) => async () => {
  const bad = [];
  for (const [view, tab, trigger, look] of [['list', 'core', TRIGGERS.view('icons'), true], ['icons', 'core', TRIGGERS.tab('tools'), false]]) {
    const { ctx, page } = await open(browser, base, { view, tab, reduced: true });
    if (look) await openLook(page);
    const r = await page.evaluate(async (t) => {
      new Function(t)();
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      return { running: document.getAnimations().filter((a) => a.constructor.name !== 'CSSTransition' && a.playState === 'running' && a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('#appGrid, .grid-ghost')).length, ghosts: document.querySelectorAll('.grid-ghost').length, layout: document.getElementById('appGrid').dataset.layout, opacities: [...document.getElementById('appGrid').children].filter((el) => Number(getComputedStyle(el).opacity) < 0.05).length };
    }, trigger);
    if (r.running !== 0 || r.ghosts !== 0 || r.layout !== 'icons' || r.opacities !== 0) bad.push({ view, tab, ...r });
    await ctx.close();
  }
  record('icons switch: reduced motion switches instantly and leaves nothing running', bad.length === 0, bad);
};

const narrow = (browser, base) => async () => {
  const bad = [];
  for (const lang of ['en', 'ar']) {
    for (const tab of ['core', 'tools', 'experimental']) {
      const { ctx, page } = await open(browser, base, { view: 'icons', tab, lang, width: 390, height: 844 });
      await page.evaluate((t) => document.getElementById('tab-' + (t === 'core' ? 'tools' : 'core')).click(), tab);
      await settle(page);
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const vh = window.innerHeight;
        const units = [...document.getElementById('appGrid').children];
        const seen = units.filter((el) => {
          const b = el.getBoundingClientRect();
          return b.top >= 0 && b.bottom <= vh;
        });
        return { total: units.length, seen: seen.length, hidden: seen.filter((el) => !el.classList.contains('is-closed') && !el.classList.contains('status-closed') && Number(getComputedStyle(el).opacity) < 0.9).length, sideways: document.documentElement.scrollWidth > window.innerWidth + 1 };
      });
      if (!r.total || r.hidden || r.sideways) bad.push({ lang, tab, ...r });
      await ctx.close();
    }
  }
  record('icons switch: at 390 px no visible unit stays hidden after a tab switch and nothing scrolls sideways', bad.length === 0, bad);
};

const spacing = (browser, base) => async () => {
  const bad = [];
  let pairs = 0;
  for (const lang of ['en', 'ar']) {
    for (const zen of ['0', '1']) {
      for (const width of [1280, 1707]) {
        for (const tab of ['core', 'tools', 'experimental']) {
          const { ctx, page } = await open(browser, base, { view: 'icons', tab, lang, width, zen });
          const r = await page.evaluate(() => {
            const g = document.getElementById('appGrid');
            const units = [...g.children].filter((el) => el.matches('.icon-plate, .app-card--icon')).map((el) => {
              const b = el.getBoundingClientRect();
              const plate = el.classList.contains('icon-plate');
              const cs = plate ? getComputedStyle(el, '::before') : null;
              const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);
              return {
                plate,
                top: Math.round(b.top),
                l: plate ? b.left + num(cs.left) : b.left,
                r: plate ? b.right - num(cs.right) : b.right,
                t: plate ? b.top + num(cs.top) : b.top,
                b: plate ? b.bottom - num(cs.bottom) : b.bottom
              };
            });
            const rows = new Map();
            units.forEach((u) => rows.set(u.top, (rows.get(u.top) || 0) + 1));
            let overlaps = 0;
            let minGap = Infinity;
            let pairs = 0;
            for (let i = 0; i < units.length; i++) {
              for (let j = i + 1; j < units.length; j++) {
                const a = units[i];
                const c = units[j];
                const vert = a.t < c.b - 0.5 && c.t < a.b - 0.5;
                const horiz = a.l < c.r - 0.5 && c.l < a.r - 0.5;
                if (vert && horiz) overlaps++;
                if (a.plate && c.plate && vert) {
                  pairs++;
                  minGap = Math.min(minGap, Math.max(a.l - c.r, c.l - a.r));
                }
              }
            }
            return { rows: rows.size, single: [...rows.values()].filter((n) => n === 1).length, overlaps, minGap: Number.isFinite(minGap) ? Math.round(minGap * 10) / 10 : null, pairs, cols: g.style.getPropertyValue('--ic-cols') };
          });
          pairs += r.pairs;
          if (r.rows !== 2 || r.single || r.overlaps || (r.minGap !== null && r.minGap < 11.5)) bad.push({ lang, zen, width, tab, ...r });
          await ctx.close();
        }
      }
    }
  }
  record('icons layout: two balanced rows per tab, no overlaps and at least 12 px between adjacent plate panels (1280 and 1707 px, normal and Zen, LTR and RTL)', bad.length === 0, bad.length ? bad.slice(0, 4) : { pairs });
};

const closedPlate = (browser, base) => async () => {
  const bad = [];
  for (const lang of ['en', 'ar']) {
    const { ctx, page } = await open(browser, base, { view: 'icons', tab: 'core', lang });
    const r = await page.evaluate(() => {
      const op = (el) => (el ? Number(getComputedStyle(el).opacity) : -1);
      const plate = document.querySelector('#appGrid .icon-plate.is-closed');
      if (!plate) return null;
      const cards = [...plate.querySelectorAll('.app-card--icon')];
      const open = [...document.querySelectorAll('#appGrid .icon-plate:not(.is-closed)')];
      return {
        plate: op(plate),
        filter: getComputedStyle(plate).filter,
        panel: Number(getComputedStyle(plate, '::before').opacity),
        icons: cards.map((c) => op(c.querySelector('.app-icon-wrapper'))),
        gray: cards.map((c) => { const w = c.querySelector('.app-icon-wrapper'); return !!w && getComputedStyle(w).filter.includes('grayscale'); }),
        labels: cards.map((c) => op(c.querySelector('.icon-label'))),
        capText: op(plate.querySelector('.icon-plate-cap-text')),
        tag: (plate.querySelector('.icon-plate-tag') || {}).textContent || '',
        title: plate.title,
        openTags: open.filter((p) => p.querySelector('.icon-plate-tag')).length,
        openDim: open.filter((p) => op(p.querySelector('.icon-plate-cap-text')) < 1 || op(p.querySelector('.app-icon-wrapper')) < 1).length
      };
    });
    const want = lang === 'ar' ? 'مغلق' : 'Closed';
    const ok = r && r.plate === 1 && r.filter === 'none' && r.panel === 1 && r.icons.length > 0 && r.icons.every((v) => v === 0.5) && r.gray.every(Boolean) && r.labels.every((v) => v === 0.5) && r.capText === 0.5 && r.tag === want && r.title.includes(want) && r.openTags === 0 && r.openDim === 0;
    if (!ok) bad.push({ lang, ...r });
    await ctx.close();
  }
  record('icons view: a closed plate keeps its panel at full strength, dims only its icons, labels and caption, and shows a Closed tag', bad.length === 0, bad);
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await chromium.launch();
  const steps = [popIn, noSnap, rowsCentred, ghostGone, rapid, reduced, narrow, spacing, closedPlate].map((make) => ({ name: make.name, run: make(browser, server.base) }));
  for (const step of steps) {
    try { await step.run(); } catch (e) { record(step.name, false, { error: String(e.message || e).slice(0, 240) }); }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

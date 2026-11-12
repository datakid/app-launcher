import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

const mulberry = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const snap = (page) => page.evaluate(() => {
  const list = document.getElementById('paletteResults');
  const input = document.getElementById('paletteInput');
  const rows = [...list.querySelectorAll('.palette-item')];
  const active = rows.filter((li) => li.classList.contains('is-active'));
  const selected = rows.filter((li) => li.getAttribute('aria-selected') === 'true');
  const cursor = list.querySelector('.palette-cursor');
  const a = active[0];
  const cr = cursor ? cursor.getBoundingClientRect() : null;
  const ar = a ? a.getBoundingClientRect() : null;
  const lr = list.getBoundingClientRect();
  const detail = document.querySelector('#paletteDetail .palette-detail-title');
  return {
    q: input.value,
    rows: rows.length,
    firstKey: rows[0] ? rows[0].dataset.key : null,
    activeKeys: active.map((li) => li.dataset.key),
    activeIndex: a ? Number(a.dataset.index) : -1,
    domIndex: a ? rows.indexOf(a) : -1,
    selected: selected.length,
    descendantOk: !a || input.getAttribute('aria-activedescendant') === a.id,
    cursorVisible: !!cursor && cursor.classList.contains('is-visible'),
    dy: cr && ar ? cr.top - ar.top : null,
    dh: cr && ar ? cr.height - ar.height : null,
    styleY: cursor ? (/translate3d\(0px, ([\d.-]+)px/.exec(cursor.style.transform || '') || [])[1] * 1 : null,
    offsetY: a ? a.offsetTop : null,
    inView: ar ? ar.top >= lr.top - 1 && ar.bottom <= lr.bottom + 1 : null,
    scrollTop: list.scrollTop,
    detailTitle: detail ? detail.textContent.trim() : null,
    activeTitle: a ? (a.querySelector('.palette-item-title') || {}).textContent : null
  };
});

const sound = (s) => {
  const problems = [];
  if (s.rows === 0) return problems;
  if (s.activeKeys.length !== 1) problems.push(`${s.activeKeys.length} active rows`);
  if (s.selected !== 1) problems.push(`${s.selected} aria-selected rows`);
  if (!s.descendantOk) problems.push('aria-activedescendant is not the active row');
  if (!s.cursorVisible) problems.push('cursor hidden');
  return problems;
};
const aligned = (s) => {
  const problems = [];
  if (s.rows === 0) return problems;
  if (s.dy === null || Math.abs(s.dy) > 1) problems.push(`cursor ${s.dy}px off the active row`);
  if (s.dh === null || Math.abs(s.dh) > 1) problems.push(`cursor ${s.dh}px taller than the active row`);
  if (s.styleY !== s.offsetY) problems.push(`cursor y ${s.styleY} vs row ${s.offsetY}`);
  return problems;
};

const newPage = async (browser, base, lang, viewport) => {
  const ctx = await browser.newContext({ viewport, reducedMotion: 'no-preference', serviceWorkers: 'block' });
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem('lx-lang', l);
      localStorage.setItem('lx-zen', '0');
      localStorage.setItem('lx-theme', 'light');
      localStorage.setItem('lx-view', 'bento');
    } catch (e) {}
  }, lang);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}/#core`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(900);
  return { ctx, page, errors };
};

const openPalette = async (page, wait = 1300) => {
  await page.keyboard.press('Control+KeyK');
  await page.waitForSelector('#lx-palette[open] #paletteResults .palette-item');
  await page.waitForTimeout(wait);
};
const closePalette = async (page) => {
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => !document.getElementById('lx-palette').open, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
};
const frames = (page, n = 2) => page.evaluate((count) => new Promise((resolve) => {
  let left = count;
  const tick = () => { left -= 1; if (left <= 0) resolve(); else requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}), n);
const settle = async (page, ms = 160) => {
  await frames(page, 2);
  await page.waitForTimeout(ms);
};
const settleCursor = async (page) => {
  await frames(page, 2);
  await page.waitForTimeout(140);
  await page.waitForFunction(() => {
    const list = document.getElementById('paletteResults');
    const c = list.querySelector('.palette-cursor');
    if (c && c.getAnimations().length) return false;
    return ![...list.querySelectorAll('.palette-item')].some((li) => li.getAnimations().length);
  }, null, { timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(60);
};

const run = async (browser, base, lang, steps) => {
  const L = (name) => `${lang}: ${name}`;
  const { ctx, page, errors } = await newPage(browser, base, lang, { width: 1440, height: 900 });

  await page.evaluate(() => {
    window.__open = [];
    const f = () => {
      const li = document.querySelector('#lx-palette[open] #paletteResults .palette-item');
      const c = document.querySelector('#paletteResults .palette-cursor');
      if (li) window.__open.push({ h: li.offsetHeight, c: c ? parseFloat(c.style.height) || 0 : 0 });
      window.__rafOpen = requestAnimationFrame(f);
    };
    f();
  });
  await page.keyboard.press('Control+KeyK');
  await page.waitForSelector('#lx-palette[open] #paletteResults .palette-item');
  await page.waitForTimeout(1500);
  const openFrames = await page.evaluate(() => { cancelAnimationFrame(window.__rafOpen); return window.__open; });
  const hs = openFrames.map((f) => f.h);
  const cs = openFrames.filter((f) => f.c).map((f) => f.c);
  const drift = hs.length ? Math.max(...hs) - Math.min(...hs) : 999;
  const cursorDrift = cs.length ? Math.max(...cs) - Math.min(...cs) : 999;
  record(L('the first palette row has one height from the first frame it opens'), hs.length >= 3 && drift <= 0.5, `heights ${Math.min(...hs)}..${Math.max(...hs)} over ${hs.length} frames`);
  record(L('the highlight is never sized for a different row height while the palette opens'), cs.length > 0 && cursorDrift <= 0.5, `heights ${Math.min(...cs)}..${Math.max(...cs)}`);
  let s = await snap(page);
  record(L('the first row is highlighted when the palette opens'), s.activeIndex === 0 && s.domIndex === 0 && sound(s).length === 0, JSON.stringify({ a: s.activeKeys, p: sound(s) }));
  record(L('the highlight sits exactly on the row when the palette opens'), aligned(s).length === 0, aligned(s).join('; '));

  const word = lang === 'en' ? 'alt' : 'alt';
  let bad = [];
  for (const ch of word) {
    await page.keyboard.type(ch);
    await settle(page);
    const t = await snap(page);
    if (t.rows && (t.activeIndex !== 0 || t.domIndex !== 0)) bad.push(`${JSON.stringify(t.q)} -> ${t.activeKeys.join(',')}@${t.activeIndex}`);
    bad.push(...sound(t));
  }
  s = await snap(page);
  record(L('typing "alt" highlights the first result at every keystroke'), bad.length === 0 && s.firstKey === 'alt' && s.activeKeys[0] === 'alt', bad.join(' | ') || `first ${s.firstKey}, active ${s.activeKeys}`);
  await settleCursor(page);
  record(L('the highlight stays on the row after typing settles'), aligned(await snap(page)).length === 0, aligned(await snap(page)).join('; '));

  await page.keyboard.press('Control+KeyA');
  await page.keyboard.type('harv');
  await settle(page);
  const harv = await snap(page);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.type('alt');
  await settle(page);
  s = await snap(page);
  record(L('replacing "harv" with "alt" moves the highlight off Harvest'), harv.activeKeys[0] === 'harvest' && s.activeKeys[0] === 'alt' && s.activeIndex === 0, `harv->${harv.activeKeys}, alt->${s.activeKeys}`);

  await page.keyboard.press('ArrowDown');
  await settleCursor(page);
  s = await snap(page);
  record(L('ArrowDown moves the highlight to the second result and the cursor follows'), s.activeIndex === 1 && sound(s).length === 0 && aligned(s).length === 0, JSON.stringify({ i: s.activeIndex, p: [...sound(s), ...aligned(s)] }));
  await closePalette(page);
  await openPalette(page);
  s = await snap(page);
  record(L('a reopened palette starts on its first row, not the row left highlighted before'), s.activeIndex === 0 && s.scrollTop === 0 && aligned(s).length === 0, JSON.stringify({ i: s.activeIndex, top: s.scrollTop, p: aligned(s) }));
  await page.keyboard.type('alt');
  await settleCursor(page);
  s = await snap(page);
  record(L('typing "alt" in a reopened palette highlights Alt, not Harvest'), s.activeKeys[0] === 'alt' && aligned(s).length === 0, JSON.stringify({ a: s.activeKeys, p: aligned(s) }));
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Backspace');
  await settleCursor(page);

  for (let i = 0; i < 6; i++) await page.keyboard.press('ArrowDown');
  await settleCursor(page);
  s = await snap(page);
  const deep = s.activeIndex;
  await page.evaluate(() => {
    window.__dy = [];
    const f = () => {
      const list = document.getElementById('paletteResults');
      const c = list.querySelector('.palette-cursor');
      const a = list.querySelector('.palette-item.is-active');
      if (c && a) window.__dy.push({ dy: c.getBoundingClientRect().top - a.getBoundingClientRect().top, t: performance.now() });
      window.__raf = requestAnimationFrame(f);
    };
    window.__t0 = performance.now();
    f();
  });
  await page.keyboard.type('a');
  await page.waitForTimeout(700);
  await page.waitForFunction(() => window.__dy.filter((f) => f.t - window.__t0 > 40).length >= 4, null, { timeout: 8000 }).catch(() => {});
  const sampled = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__dy.filter((f) => f.t - window.__t0 > 40); });
  s = await snap(page);
  const worst = sampled.reduce((m, f) => Math.max(m, Math.abs(f.dy)), 0);
  record(L('after arrowing down, typing resets the highlight to the top result'), deep >= 5 && s.activeIndex === 0 && s.scrollTop === 0, JSON.stringify({ deep, i: s.activeIndex, top: s.scrollTop }));
  record(L('the highlight jumps to the top result instead of sliding across the list'), sampled.length >= 3 && worst <= 1.5, `worst ${Math.round(worst * 10) / 10}px over ${sampled.length} frames`);
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Backspace');
  await settleCursor(page);

  for (let i = 0; i < 28; i++) await page.keyboard.press('ArrowDown');
  await settleCursor(page);
  s = await snap(page);
  record(L('the highlight stays on its row while arrowing through a long list'), s.activeIndex === 28 && s.inView && aligned(s).length === 0, JSON.stringify({ i: s.activeIndex, inView: s.inView, p: aligned(s) }));
  for (let i = 0; i < 28; i++) await page.keyboard.press('ArrowUp');
  await settleCursor(page);
  s = await snap(page);
  record(L('and back to the top'), s.activeIndex === 0 && s.inView && aligned(s).length === 0, JSON.stringify({ i: s.activeIndex, inView: s.inView, p: aligned(s) }));

  await page.keyboard.type('alt');
  await settleCursor(page);
  const target = await page.evaluate(() => {
    const li = document.querySelectorAll('#paletteResults .palette-item')[1];
    const r = li.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, key: li.dataset.key };
  });
  await page.mouse.move(target.x, target.y);
  await page.mouse.move(target.x + 3, target.y + 1);
  await settleCursor(page);
  s = await snap(page);
  record(L('moving the pointer over a row highlights it'), s.activeKeys[0] === target.key && s.activeIndex === 1, JSON.stringify({ a: s.activeKeys, want: target.key }));
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.type('harv');
  await settleCursor(page);
  await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const row = el && el.closest('.palette-item');
    (row || el).dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y + 0, pointerType: 'mouse' }));
  }, { x: target.x + 3, y: target.y + 1 });
  await settle(page, 200);
  s = await snap(page);
  record(L('results re-ranking under a still pointer do not steal the highlight'), s.activeIndex === 0 && s.activeKeys[0] === s.firstKey, JSON.stringify({ a: s.activeKeys, first: s.firstKey }));
  await page.mouse.move(target.x + 40, target.y + 40);
  await settleCursor(page);
  s = await snap(page);
  record(L('a real pointer movement still highlights the hovered row'), sound(s).length === 0 && aligned(s).length === 0, JSON.stringify([...sound(s), ...aligned(s)]));
  await page.keyboard.press('Control+KeyA');
  await page.keyboard.press('Backspace');
  await settleCursor(page);

  const rng = mulberry(lang === 'en' ? 20261112 : 7);
  const pool = lang === 'en' ? ['a', 'l', 't', 'h', 'r', 'd', 'x', 'p', 'q', ' '] : ['ا', 'ل', 'ت', 'ب', 'ر', 'د', 'ع', 'a', 'd'];
  const log = [];
  const failures = [];
  const check = async (action, mustBeTop) => {
    await settle(page, 170);
    const t = await snap(page);
    const issues = [...sound(t)];
    if (mustBeTop && t.rows && t.activeIndex !== 0) issues.push(`highlight on row ${t.activeIndex}, not the first`);
    if (t.rows && t.detailTitle && t.activeTitle && t.detailTitle !== t.activeTitle.trim()) issues.push(`detail pane shows "${t.detailTitle}" but the highlight is "${t.activeTitle.trim()}"`);
    if (issues.length) failures.push(`${log.length}. ${action} [${JSON.stringify(t.q)}]: ${issues.join('; ')}`);
    return t;
  };
  for (let i = 0; i < steps; i++) {
    const r = rng();
    const before = (await snap(page)).q;
    let action;
    let top = false;
    if (r < 0.4) {
      const ch = pool[Math.floor(rng() * pool.length)];
      action = `type ${ch}`;
      await page.keyboard.type(ch);
      top = true;
    } else if (r < 0.55) {
      action = 'Backspace';
      await page.keyboard.press('Backspace');
      top = before.length > 0;
    } else if (r < 0.7) {
      action = 'ArrowDown';
      await page.keyboard.press('ArrowDown');
    } else if (r < 0.8) {
      action = 'ArrowUp';
      await page.keyboard.press('ArrowUp');
    } else if (r < 0.88) {
      action = 'Shift+Tab (scope)';
      await page.keyboard.press('Shift+Tab');
      top = true;
    } else if (r < 0.94) {
      const pos = await page.evaluate(() => {
        const rows = [...document.querySelectorAll('#paletteResults .palette-item')];
        const li = rows[Math.min(rows.length - 1, 2)];
        if (!li) return null;
        const b = li.getBoundingClientRect();
        return { x: b.left + b.width * 0.5 + Math.random() * 10, y: b.top + b.height / 2 };
      });
      action = 'pointer over a row';
      if (pos) await page.mouse.move(pos.x, pos.y);
    } else {
      action = 'select all and clear';
      await page.keyboard.press('Control+KeyA');
      await page.keyboard.press('Backspace');
      top = before.length > 0;
    }
    log.push(action);
    const t = await check(action, top);
    if (i % 5 === 4) {
      await settleCursor(page);
      const u = await snap(page);
      const a = aligned(u);
      if (a.length) failures.push(`${log.length}. after ${action} settled [${JSON.stringify(u.q)}]: ${a.join('; ')}`);
    }
  }
  record(L(`${steps} random keystrokes, arrows, scope changes and pointer moves keep one highlighted row, a matching detail pane and an aligned cursor`), failures.length === 0, failures.slice(0, 4).join(' || '));
  record(L('no page errors'), errors.length === 0, errors.join(' | '));
  await ctx.close();
};

const runPhone = async (browser, base) => {
  const { ctx, page, errors } = await newPage(browser, base, 'en', { width: 390, height: 844 });
  await openPalette(page, 1500);
  let s = await snap(page);
  const bad = [];
  if (s.activeIndex !== 0) bad.push('open not on first row');
  bad.push(...aligned(s));
  for (const ch of 'alt') {
    await page.keyboard.type(ch);
    await settle(page);
    const t = await snap(page);
    if (t.rows && t.activeIndex !== 0) bad.push(`${t.q} -> ${t.activeKeys}`);
  }
  await settleCursor(page);
  s = await snap(page);
  bad.push(...aligned(s));
  record('phone: the highlight starts on the first row, follows typing and stays aligned', bad.length === 0 && s.activeKeys[0] === 'alt', bad.join(' | ') || s.activeKeys.join(','));
  record('phone: no page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  await run(browser, server.base, 'en', 70);
  await run(browser, server.base, 'ar', 30);
  await runPhone(browser, server.base);
  await browser.close();
  await server.close();
  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` ${JSON.stringify(r.detail)}`}`));
  console.log(JSON.stringify({ total: results.length, failed: failed.length }));
  if (failed.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

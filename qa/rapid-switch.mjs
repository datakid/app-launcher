import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { collectorInit } from '../perf/collector.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');


const reversalProbe = async ({ name, frac, dir }) => {
  const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
  const matrix = (v) => { if (!v || v === 'none') return [1, 0, 0, 1, 0, 0]; const m = /matrix\(([^)]+)\)/.exec(v); return m ? m[1].split(',').map(Number) : [1, 0, 0, 1, 0, 0]; };
  const pair = (v) => { if (!v || v === 'none') return [0, 0]; const p = v.split(/\s+/).map(num); return [p[0] || 0, p[1] || 0]; };
  const scl = (v) => { if (!v || v === 'none') return 1; return num(v.split(/\s+/)[0]) || 1; };
  const inset = (v) => {
    const m = /inset\(([^)]*)\)/.exec(v || '');
    if (!m) return [0, 0, 0, 0, 20];
    const [a, r] = m[1].split('round');
    const n = a.trim().split(/\s+/).map(parseFloat);
    const q = n.length === 1 ? [n[0], n[0], n[0], n[0]] : n.length === 2 ? [n[0], n[1], n[0], n[1]] : n.length === 3 ? [n[0], n[1], n[2], n[1]] : n;
    return [...q, parseFloat(r) || 20];
  };
  const el = (s) => document.querySelector(s);
  const box = (e) => {
    const cs = getComputedStyle(e);
    const m = matrix(cs.transform);
    const t = pair(cs.translate);
    return [cs.opacity * 60, m[4] + t[0], m[5] + t[1], m[0] * 300 * scl(cs.scale), m[3] * 300];
  };
  const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const card = () => document.querySelector('#appGrid .app-card');
  const pointer = () => {
    const l = card().querySelector('.card-link-overlay');
    const r = l.getBoundingClientRect();
    l.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
  };
  const withVariants = () => [...document.querySelectorAll('#appGrid .app-card')].find((c) => c.querySelectorAll('.variant-chip').length > 1);
  const menuSample = () => { const m = el('.lx-context-menu'); return [...box(m), ...box(m.querySelector('button'))]; };
  const S = {
    tab: {
      dur: 220,
      durBack: 220,
      fwd: () => { const t = [...document.querySelectorAll('.tab-btn')]; const i = t.findIndex((b) => b.getAttribute('aria-selected') === 'true'); S.tab.from = t[i]; t[(i + 2) % t.length].click(); },
      back: () => S.tab.from.click(),
      sample: () => { const cs = getComputedStyle(el('#tabIndicator')); return [num(cs.left), num(cs.right)]; }
    },
    palette: {
      dur: 200,
      durBack: 140,
      fwd: () => el('#lxBarSearch').click(),
      back: () => el('#paletteClose').click(),
      sample: () => {
        const d = el('#lx-palette');
        const cs = getComputedStyle(d);
        const c = inset(cs.clipPath);
        return [matrix(cs.transform)[5], c[2], c[4] / 8, num(getComputedStyle(d.querySelector('.palette-body')).opacity) * 60];
      }
    },
    chip: {
      dur: 620,
      durBack: 620,
      prep: async () => { S.chip.card = withVariants(); S.chip.card.scrollIntoView({ block: 'center' }); await wait(200); },
      fwd: () => { const b = [...S.chip.card.querySelectorAll('.variant-chip')]; S.chip.a = b.find((x) => x.classList.contains('is-active')); S.chip.b = b.find((x) => x !== S.chip.a); S.chip.b.click(); },
      back: () => S.chip.a.click(),
      sample: () => { const r = S.chip.card.querySelector('.variant-chip-indicator').getBoundingClientRect(); return [r.left, r.right]; }
    },
    qr: {
      dur: 220,
      durBack: 150,
      fwd: () => { pointer(); el('.lx-context-menu [data-action="qr"]').click(); },
      back: () => el('#qrClose').click(),
      sample: () => { const d = el('#lx-qr'); return [...box(d), ...box(d.querySelector('.qr-layer:not(.is-leaving)') || d)]; }
    },
    qrthumb: {
      dur: 160,
      durBack: 160,
      prep: async () => {
        const c = withVariants();
        const l = c.querySelector('.card-link-overlay');
        const r = l.getBoundingClientRect();
        l.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: r.left + 20, clientY: r.top + 20 }));
        el('.lx-context-menu [data-action="qr"]').click();
        await wait(900);
      },
      fwd: () => { const v = [...document.querySelectorAll('[data-qr-variant]')]; S.qrthumb.a = v.find((b) => b.classList.contains('is-active')); [...v].find((b) => b !== S.qrthumb.a).click(); },
      back: () => S.qrthumb.a.click(),
      sample: () => { const r = el('.qr-thumb').getBoundingClientRect(); return [r.left, r.right]; }
    },
    zen: {
      dur: 440,
      durBack: 440,
      later: true,
      fwd: () => el('#zenToggle').click(),
      back: () => el('#zenToggle').click(),
      sample: () => {
        const out = [];
        for (const i of [0, 3, 7]) {
          const g = document.querySelectorAll('#appGrid .app-card')[i];
          const cs = getComputedStyle(document.documentElement, `::view-transition-group(tile-${i})`);
          const w = num(cs.width);
          if (w) { const m = new DOMMatrix(cs.transform); out.push(m.e, m.f, w / 4, num(cs.height) / 4); }
          else { const r = (g.querySelector('.card-clip') || g).getBoundingClientRect(); out.push(r.left, r.top, r.width / 4, r.height / 4); }
        }
        return out;
      }
    },
    ctx: {
      dur: 220,
      durBack: 220,
      fwd: pointer,
      back: () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })),
      sample: menuSample
    },
    look: {
      dur: 220,
      durBack: 220,
      fwd: () => el('#lookToggle').click(),
      back: () => el('#lookToggle').click(),
      sample: menuSample
    }
  };
  const s = S[name];
  if (s.prep) await s.prep();
  if (dir === 'reopen') { s.fwd(); await wait(1200); }
  const first = dir === 'reopen' ? s.back : s.fwd;
  const second = dir === 'reopen' ? s.fwd : s.back;
  first();
  await frame();
  const t = (dir === 'reopen' ? s.durBack : s.dur) * frac;
  const finite = (a) => { try { return a.effect.getComputedTiming().iterations !== Infinity; } catch (e) { return false; } };
  document.getAnimations().forEach((a) => { if (finite(a)) { a.pause(); a.currentTime = t; } });
  await 0;
  const known = new Set(document.getAnimations());
  const before = s.sample();
  second();
  const same = s.sample();
  await new Promise((r) => requestAnimationFrame(r));
  document.getAnimations().forEach((a) => { if (!known.has(a) && finite(a)) { a.pause(); a.currentTime = 0; } });
  const next = s.sample();
  const gap = (x, y) => Math.max(...x.map((v, i) => Math.abs(v - y[i])));
  return { name, frac, dir, jump: +gap(before, s.later ? next : same).toFixed(2) };
};

const reversalCases = async (browser, base) => {
  const out = [];
  for (const name of ['tab', 'palette', 'chip', 'qr', 'qrthumb', 'zen', 'ctx', 'look']) {
    for (const dir of ['forward', 'reopen']) {
      for (const frac of [0.3, 0.5, 0.8]) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
        await ctx.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
          Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
          try { localStorage.setItem('lx-zen', '0'); } catch (e) {}
        });
        const page = await ctx.newPage();
        await page.goto(base + '/');
        await page.waitForSelector('#appGrid .app-card');
        await page.waitForTimeout(2200);
        let r;
        try { r = await page.evaluate(reversalProbe, { name, frac, dir }); } catch (e) { r = { name, frac, dir, jump: Infinity, error: e.message.split('\n')[0] }; }
        out.push({ ...r, pass: r.jump <= 1.5 });
        await ctx.close();
      }
    }
  }
  return out;
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  const results = [];
  for (const profile of [{ name: 'desktop', viewport: { width: 1440, height: 900 } }, { name: 'mobile', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }]) {
    const ctx = await browser.newContext({ viewport: profile.viewport, hasTouch: !!profile.hasTouch, isMobile: !!profile.isMobile, reducedMotion: 'no-preference' });
    await ctx.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
      Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
    });
    await ctx.addInitScript(collectorInit);
    const page = await ctx.newPage();
    await page.goto(server.base + '/');
    await page.waitForSelector('#appGrid .app-card');
    await page.waitForTimeout(2500);
    const r = await page.evaluate(async () => {
      const tabs = [...document.querySelectorAll('.tab-btn')];
      let last = null;
      for (let i = 0; i < 10; i++) {
        last = tabs[(i + 1) % tabs.length];
        last.click();
        await new Promise((res) => setTimeout(res, 40));
      }
      const t0 = performance.now();
      await new Promise((res) => setTimeout(res, 300));
      const strictRunning = window.__perf.running(true);
      let quiet = null;
      let since = null;
      while (performance.now() - t0 < 6000) {
        if (window.__perf.running(true) === 0) {
          if (since === null) since = performance.now();
          if (performance.now() - since >= 300) { quiet = since - t0; break; }
        } else {
          since = null;
        }
        await new Promise((res) => requestAnimationFrame(res));
      }
      return {
        strictRunning,
        quietAfterMs: quiet === null ? null : Math.round(quiet),
        activeIsLast: last.getAttribute('aria-selected') === 'true',
        clampCleared: !document.querySelector('.lx-bar.lx-switching')
      };
    });
    results.push({ profile: profile.name, ...r, strictPass: r.strictRunning === 0, pass: r.quietAfterMs !== null && r.activeIsLast && r.clampCleared });
    await ctx.close();
  }
  const reversals = await reversalCases(browser, server.base);
  await browser.close();
  await server.close();
  console.log(JSON.stringify(results));
  console.log(JSON.stringify({ reversals: reversals.length, worst: reversals.reduce((m, r) => Math.max(m, r.jump), 0), failed: reversals.filter((r) => !r.pass) }));
  if (results.some((r) => !r.pass) || reversals.some((r) => !r.pass)) process.exit(1);
  if (process.argv.includes('--strict') && results.some((r) => !r.strictPass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

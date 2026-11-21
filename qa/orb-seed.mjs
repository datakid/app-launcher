import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const WIDTHS = [1280, 390];
const THEMES = ['dark', 'light'];

const readOrbs = (page) => page.evaluate(() => window.bgAnim.orbs.map((o) => [o.orbitR, o.orbitSpeed, o.r, o.phase].map((v) => Math.round(v * 1e6) / 1e6)));

const load = async (browser, base, width, theme, randomSeed) => {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
  await ctx.addInitScript(([t, s]) => {
    try { localStorage.setItem('lx-theme', t); localStorage.setItem('lx-lang', 'en'); } catch (e) {}
    let state = s >>> 0;
    Math.random = () => {
      state = (state + 0x6D2B79F5) >>> 0;
      let x = state;
      x = Math.imul(x ^ (x >>> 15), x | 1);
      x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
      return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
  }, [theme, randomSeed]);
  const page = await ctx.newPage();
  await page.goto(`${base}/`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForFunction(() => !!window.bgAnim && window.bgAnim.orbs.length > 0);
  const orbs = await readOrbs(page);
  const bloomDark = await page.evaluate(() => {
    const cv = document.getElementById('gradient-canvas');
    const cx = cv.getContext('2d');
    const sum = () => {
      const d = cx.getImageData(0, 0, cv.width, cv.height).data;
      let s = 0;
      for (let i = 0; i < d.length; i += 4) s += d[i + 3];
      return s;
    };
    const originalNow = performance.now.bind(performance);
    const at = (ms) => {
      performance.now = () => ms;
      window.bgAnim._lastDraw = 0;
      window.bgAnim.render(ms / 1000);
      performance.now = originalNow;
      return sum();
    };
    window.bgAnim.bloomStart = 0;
    const early = at(100);
    const late = at(60000);
    return { early, late };
  });
  await ctx.close();
  return { orbs, bloomDark };
};

const main = async () => {
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser();
  for (const theme of THEMES) {
    for (const width of WIDTHS) {
      const a = await load(browser, server.base, width, theme, 1);
      const b = await load(browser, server.base, width, theme, 987654321);
      record(`orbs: two loads with different Math.random streams give the same composition (${theme}, ${width}px)`, JSON.stringify(a.orbs) === JSON.stringify(b.orbs) && a.orbs.length > 0, { orbs: a.orbs.length });
      if (theme === 'dark') {
        record(`orbs: dark has no load bloom, the canvas is identical at 0.1 s and 60 s (${width}px)`, a.bloomDark.early === a.bloomDark.late, a.bloomDark);
      } else {
        record(`orbs: light keeps its load bloom, the canvas is larger at 0.1 s than at 60 s (${width}px)`, a.bloomDark.early > a.bloomDark.late, a.bloomDark);
      }
    }
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

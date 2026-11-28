import { launchBrowser } from '../perf/browser.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const PALETTES = ['vivid', 'curated', 'muted', 'mono'];
const THEMES = ['light', 'dark'];
const WORLDS = {
  transparency: { feature: { name: 'prefers-reduced-transparency', value: 'reduce' }, title: 'reduced transparency removes every backdrop blur and the scrim wash' },
  contrast: { feature: { name: 'prefers-contrast', value: 'more' }, title: 'more contrast keeps the card rim visible and the list border solid' },
  forced: { feature: { name: 'forced-colors', value: 'active' }, title: 'forced colours hides the decorative layers' },
  motion: { feature: { name: 'prefers-reduced-motion', value: 'reduce' }, title: 'reduced motion leaves no transition or animation except the palette row fade' }
};
const MOTION_ALLOWED = /^li\.palette-item(\.is-active)?::after transition/;

const probe = () => {
  const out = [];
  const q = (sel) => [...document.querySelectorAll(sel)];
  const cs = (el, pseudo) => getComputedStyle(el, pseudo || null);
  const world = window.__world;
  if (world === 'transparency') {
    for (const sel of ['.lx-bar', '#lx-palette', '.lx-context-menu', '[role="menu"]', '#lxToast', '#lx-qr', '#lx-confirm', '.controls-pill']) {
      for (const el of q(sel).slice(0, 2)) {
        const b = cs(el).backdropFilter;
        if (b && b !== 'none') out.push(`${sel} backdrop-filter ${b.slice(0, 40)}`);
      }
    }
    for (const sel of ['#lx-palette', '#lx-qr', '#lx-confirm']) {
      for (const el of q(sel).slice(0, 1)) {
        const b = cs(el, '::backdrop').backdropFilter;
        if (b && b !== 'none') out.push(`${sel}::backdrop backdrop-filter ${b.slice(0, 40)}`);
      }
    }
    for (const el of q('.scrim').slice(0, 1)) { const d = cs(el, '::after').display; if (d !== 'none') out.push(`.scrim::after display ${d}`); }
  }
  if (world === 'contrast') {
    for (const el of q('.app-card .card-clip').slice(0, 2)) { const o = parseFloat(cs(el, '::after').opacity); if (!(o >= 0.349)) out.push(`.card-clip::after opacity ${o}`); }
    const list = q('.app-grid[data-layout="list"]')[0];
    if (list) {
      const probeEl = document.createElement('i');
      probeEl.style.color = 'var(--border)';
      list.appendChild(probeEl);
      const want = cs(probeEl).color;
      probeEl.remove();
      const got = cs(list).borderTopColor;
      if (got !== want) out.push(`list border ${got} against ${want}`);
    }
  }
  if (world === 'forced') {
    for (const sel of ['.card-glow', '.card-sheen', '.closed-tint', '.palette-detail-slab', '.card-aura', '.card-glyph', '.palette-scope-indicator']) {
      for (const el of q(sel).slice(0, 2)) { const d = cs(el).display; if (d !== 'none') out.push(`${sel} display ${d}`); }
    }
    for (const el of q('.app-card .card-clip').slice(0, 2)) { const d = cs(el, '::after').display; if (d !== 'none') out.push(`.card-clip::after display ${d}`); }
    for (const el of q('.scrim').slice(0, 1)) for (const ps of [null, '::before', '::after']) { const d = cs(el, ps).display; if (d !== 'none') out.push(`.scrim${ps || ''} display ${d}`); }
    for (const el of q('.lx-glyph').slice(0, 1)) { const f = cs(el).forcedColorAdjust; if (f !== 'none') out.push(`.lx-glyph forced-color-adjust ${f}`); }
  }
  if (world === 'motion') {
    const bad = new Set();
    for (const el of q('body *')) {
      for (const ps of [null, '::before', '::after']) {
        const s = cs(el, ps);
        const ms = (list) => list.split(',').map((x) => parseFloat(x) * (x.includes('ms') ? 1 : 1000));
        const name = `${el.tagName.toLowerCase()}.${[...el.classList].slice(0, 2).join('.')}${ps || ''}`;
        if (ms(s.transitionDuration).some((x) => x > 0.011) && s.transitionProperty !== 'none') bad.add(`${name} transition ${s.transitionDuration.slice(0, 30)}`);
        if (ms(s.animationDuration).some((x) => x > 0.011) && s.animationName !== 'none') bad.add(`${name} animation ${s.animationName.slice(0, 20)}`);
      }
    }
    out.push(...[...bad].slice(0, 12));
  }
  return out;
};

const main = async () => {
  const site = siteRoot(root);
  const server = await startServer(site);
  const browser = await launchBrowser();
  for (const [world, def] of Object.entries(WORLDS)) {
    const failures = [];
    let runs = 0;
    for (const palette of PALETTES) {
      for (const theme of THEMES) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: theme, reducedMotion: world === 'motion' ? 'reduce' : 'no-preference' });
        await ctx.addInitScript(() => {
          Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
          Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
        });
        await ctx.addInitScript(([t, p]) => { try { localStorage.setItem('lx-theme', t); localStorage.setItem('lx-palette', p); localStorage.setItem('lx-zen', '0'); localStorage.setItem('lx-view', 'bento'); } catch (e) {} }, [theme, palette]);
        const page = await ctx.newPage();
        const cdp = await ctx.newCDPSession(page);
        await cdp.send('Emulation.setEmulatedMedia', { features: [def.feature] });
        await page.goto(`${server.base}/#core`);
        await page.waitForSelector('#appGrid .app-card');
        await page.waitForTimeout(1200);
        await page.keyboard.press('Control+KeyK');
        await page.waitForSelector('#paletteResults .palette-item');
        await page.fill('#paletteInput', 'pa');
        await page.waitForTimeout(800);
        const found = await page.evaluate(`window.__world=${JSON.stringify(world)};(${probe.toString()})()`);
        for (const f of found) if (!(world === 'motion' && MOTION_ALLOWED.test(f))) failures.push(`${palette} ${theme}: ${f}`);
        runs++;
        await ctx.close();
      }
    }
    record(`${def.title}, ${PALETTES.length} palettes in both themes`, failures.length === 0, failures.length ? failures.slice(0, 8) : { runs });
  }
  await browser.close();
  await server.close();
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
  if (results.some((r) => !r.pass)) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

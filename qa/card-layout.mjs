import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const FULL = process.argv.includes('--full');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon' };

const serve = () => new Promise((resolve) => {
  const server = http.createServer(async (req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(dist, p === '/' ? 'index.html' : p);
    try { const body = await fs.readFile(file); res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); res.end(body); }
    catch { res.writeHead(404); res.end(); }
  });
  server.listen(0, () => resolve(server));
});

const synthetic = (n) => {
  const base = JSON.parse(JSON.stringify(realLinks));
  const pool = base.categories.flatMap((c) => c.apps);
  const apps = Array.from({ length: n }, (_, i) => ({ ...pool[i % pool.length], id: `t${i}-${pool[i % pool.length].id}`.slice(0, 40), isNew: i % 3 === 0, since: '2099-01-01', closed: i % 5 === 4 }));
  return { categories: [{ ...base.categories[0], id: 'core', apps }] };
};

let realLinks;
const VIEWPORTS = FULL
  ? [[1920, 1080], [1440, 900], [1280, 800], [1280, 680], [1100, 760], [1024, 768], [768, 1024], [390, 844], [360, 740]]
  : [[1440, 900], [1280, 800], [1024, 768], [390, 844]];
const LANGS = ['en', 'ar'];
const THEMES = FULL ? ['light', 'dark'] : ['light'];
const PALETTES = FULL ? ['vivid', 'muted', 'curated', 'mono'] : ['muted', 'vivid'];
const CORNERS = FULL ? ['balanced', 'soft', 'crisp'] : ['balanced', 'crisp'];
const COUNTS = FULL ? Array.from({ length: 16 }, (_, i) => i + 1) : [1, 2, 3, 4, 5, 6, 7, 8, 13];

const auditInPage = () => {
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width && r.height ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const hit = (a, b) => !!(a && b) && a.l < b.r - 0.5 && a.r > b.l + 0.5 && a.t < b.b - 0.5 && a.b > b.t + 0.5;
  const inside = (a, b) => !!(a && b) && a.l >= b.l - 0.5 && a.r <= b.r + 0.5 && a.t >= b.t - 0.5 && a.b <= b.b + 0.5;
  const out = [];
  for (const card of document.querySelectorAll('.app-grid > .app-card')) {
    const q = (s) => box(card.querySelector(s));
    const p = { qr: q('.card-qr'), icon: q('.app-icon-wrapper'), title: q('.app-title'), meta: q('.card-meta'), chips: q('.variant-chips'), badges: q('.badges') };
    const clip = q('.card-clip');
    const issues = [];
    if (!p.qr) issues.push('qr-missing');
    for (const k of ['icon', 'title', 'meta', 'chips', 'badges']) if (hit(p.qr, p[k])) issues.push('qr-overlaps-' + k);
    for (const k of ['title', 'meta', 'badges']) if (hit(p.icon, p[k])) issues.push('icon-overlaps-' + k);
    if (hit(p.chips, p.title) || hit(p.chips, p.meta)) issues.push('chips-overlap-title');
    for (const k of ['qr', 'icon', 'title', 'chips', 'badges']) if (p[k] && !inside(p[k], clip)) issues.push(k + '-outside-card');
    if (p.badges && p.qr && Math.abs((p.badges.t + p.badges.b) / 2 - (p.qr.t + p.qr.b) / 2) > 1.5) issues.push('badge-qr-not-centred');
    const t = card.querySelector('.app-title');
    if (t && t.scrollWidth > t.clientWidth + 1 && getComputedStyle(t).textOverflow !== 'ellipsis') issues.push('title-clipped');
    if (issues.length) out.push({ title: t?.textContent.trim(), cls: card.className.match(/card-(hero|wide|tall)/)?.[0] || 'std', issues });
  }
  if (document.documentElement.scrollWidth > innerWidth + 1) out.push({ title: '(page)', issues: ['horizontal-overflow'] });
  return out;
};

const failures = [];
const record = (ctx, list) => { for (const f of list) failures.push({ ...ctx, ...f }); };

const main = async () => {
  realLinks = JSON.parse(await fs.readFile(path.join(root, 'links.json'), 'utf8'));
  const server = await serve();
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();

  const open = async (vp, prefs, catalog, hash) => {
    const ctx = await browser.newContext({ viewport: { width: vp[0], height: vp[1] }, reducedMotion: 'reduce', serviceWorkers: 'block' });
    await ctx.addInitScript((p) => { localStorage.clear(); for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v); }, prefs);
    if (catalog) {
      const json = JSON.stringify(catalog);
      await ctx.route('**/links.json', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: json }));
      await ctx.route(/\/(index\.html)?(\?.*)?(#.*)?$/, async (r) => {
        const res = await r.fetch();
        const html = (await res.text()).replace(/(<script type="application\/json" id="lx-data">)[\s\S]*?(<\/script>)/, (_, a, b) => a + json.replace(/</g, '\\u003c') + b);
        await r.fulfill({ response: res, body: html });
      });
    }
    const page = await ctx.newPage();
    await page.goto(`${origin}/${hash}`);
    await page.waitForSelector('.app-grid > .app-card .card-qr');
    await page.waitForTimeout(400);
    return { ctx, page };
  };

  for (const vp of VIEWPORTS) for (const lang of LANGS) for (const theme of THEMES) for (const palette of PALETTES) for (const corners of CORNERS) {
    const prefs = { 'lx-lang': lang, 'lx-theme': theme, 'lx-palette': palette, 'lx-corners': corners, 'lx-view': 'bento', 'lx-zen': '0' };
    for (const cat of realLinks.categories) {
      const { ctx, page } = await open(vp, prefs, null, '#' + cat.id);
      record({ vp: vp.join('x'), lang, theme, palette, corners, tab: cat.id }, await page.evaluate(auditInPage));
      await ctx.close();
    }
  }

  for (const n of COUNTS) for (const vp of VIEWPORTS) for (const lang of LANGS) {
    const prefs = { 'lx-lang': lang, 'lx-theme': 'light', 'lx-palette': 'muted', 'lx-view': 'bento', 'lx-zen': '0' };
    const { ctx, page } = await open(vp, prefs, synthetic(n), '#core');
    record({ vp: vp.join('x'), lang, count: n }, await page.evaluate(auditInPage));
    await ctx.close();
  }

  for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.addInitScript((l) => { localStorage.clear(); localStorage.setItem('lx-lang', l); localStorage.setItem('lx-view', 'bento'); }, lang);
    const page = await ctx.newPage();
    await page.goto(`${origin}/#tools`);
    await page.waitForSelector('.app-card.card-hero .card-qr');
    await page.waitForTimeout(800);
    const hero = page.locator('.app-card.card-hero').first();
    const hb = await hero.boundingBox();
    const read = () => hero.evaluate((c) => {
      const r = (s) => { const b = c.querySelector(s).getBoundingClientRect(); return [b.left, b.top]; };
      return { qr: r('.card-qr'), icon: r('.app-icon-wrapper') };
    });
    await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2, { steps: 4 });
    await page.waitForTimeout(900);
    const a = await read();
    await page.mouse.move(hb.x + 12, hb.y + 12, { steps: 12 });
    await page.waitForTimeout(900);
    const b = await read();
    const iconMoved = Math.hypot(b.icon[0] - a.icon[0], b.icon[1] - a.icon[1]);
    const qrMoved = Math.hypot(b.qr[0] - a.qr[0], b.qr[1] - a.qr[1]);
    if (iconMoved > 0.5 && qrMoved < 0.5) failures.push({ lang, test: 'parallax', issues: [`icon moved ${iconMoved.toFixed(2)}px but QR moved ${qrMoved.toFixed(2)}px`] });
    if (iconMoved <= 0.5) failures.push({ lang, test: 'parallax', issues: ['pointer did not drive card parallax; harness could not verify'] });
    await ctx.close();
  }

  await browser.close();
  server.close();
  await fs.mkdir(path.join(root, 'qa', 'out'), { recursive: true });
  await fs.writeFile(path.join(root, 'qa', 'out', 'card-layout.json'), JSON.stringify(failures, null, 2));
  if (failures.length) {
    console.error(`card-layout: ${failures.length} failure(s)`);
    for (const f of failures.slice(0, 40)) console.error(JSON.stringify(f));
    process.exit(1);
  }
  console.log('card-layout: ok');
};

main().catch((e) => { console.error(e); process.exit(1); });

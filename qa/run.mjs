import { chromium } from 'playwright';
import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const site = fsSync.existsSync(path.join(root, 'dist', 'index.html')) ? path.join(root, 'dist') : root;
const outDir = path.join(root, 'qa', 'out');
const quick = process.argv.includes('--quick');
const workers = Number(process.env.QA_WORKERS || 4);
const MIME = { '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jxl': 'image/jxl', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.mjs': 'text/javascript' };

const VIEWS = ['bento', 'list', 'icons'];
const PALETTES = ['vivid', 'curated', 'muted', 'mono'];
const CORNERS = ['balanced', 'soft', 'crisp'];
const THEMES = ['light', 'dark'];
const LANGS = ['ar', 'en'];
const WIDTHS = [390, 1440];
const VIEWPORTS = [[360, 640], [390, 844], [414, 896], [768, 1024], [1024, 768], [844, 390], [1440, 900]];

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(site, p);
    if (!file.startsWith(site)) throw new Error('outside');
    const buf = await fs.readFile(file);
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(buf);
  } catch (e) {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const jobs = [];
const add = (job) => jobs.push(job);
const matrix = quick ? { palettes: ['vivid'], corners: ['balanced'], themes: ['dark'], langs: ['en'] } : { palettes: PALETTES, corners: CORNERS, themes: THEMES, langs: LANGS };
for (const view of VIEWS) for (const palette of matrix.palettes) for (const corners of matrix.corners) for (const theme of matrix.themes) for (const lang of matrix.langs) for (const w of WIDTHS) {
  add({ kind: 'matrix', view, palette, corners, theme, lang, w, h: w < 700 ? 844 : 900, tabs: ['core'] });
}
for (const view of VIEWS) for (const theme of THEMES) for (const lang of LANGS) for (const [w, h] of VIEWPORTS) {
  add({ kind: 'viewport', view, palette: 'vivid', corners: 'balanced', theme, lang, w, h, tabs: null });
}

const failures = [];
const results = [];
const browser = await chromium.launch();

const runJob = async (job) => {
  const touch = job.w <= 1024;
  const ctx = await browser.newContext({ viewport: { width: job.w, height: job.h }, hasTouch: touch, isMobile: touch && job.w < 900, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.addInitScript(([t, l]) => { localStorage.setItem('lx-theme', t); localStorage.setItem('lx-lang', l); }, [job.theme, job.lang]);
  await page.goto(`${base}/?view=${job.view}&palette=${job.palette}&corners=${job.corners}`);
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(500);
  const tabs = job.tabs || await page.$$eval('.tab-btn', (bs) => bs.map((b) => b.dataset.id));
  const name = [job.kind, job.view, job.palette, job.corners, job.theme, job.lang, `${job.w}x${job.h}`].join('_');
  const checks = [];
  for (const tab of tabs) {
    if (tab !== 'core') {
      await page.evaluate((id) => document.getElementById('tab-' + id)?.click(), tab);
      await page.waitForTimeout(450);
    }
    const dom = await page.evaluate(() => {
      const labels = [...document.querySelectorAll('#appGrid .icon-label')].map((l) => {
        const lh = parseFloat(getComputedStyle(l).lineHeight) || 16;
        return { h: l.getBoundingClientRect().height, lh, sh: l.scrollHeight, ch: l.clientHeight, sw: l.scrollWidth, cw: l.clientWidth };
      });
      return {
        pageFits: document.documentElement.scrollWidth <= innerWidth,
        cards: document.querySelectorAll('#appGrid .app-card').length,
        labelsCut: labels.filter((l) => l.sh > l.ch + 1 || l.sw > l.cw + 1 || l.h > l.lh * 2 + 1.5).length
      };
    });
    const probe = () => page.evaluate(() => {
      const g = document.getElementById('appGrid');
      window.scrollTo(0, document.documentElement.scrollHeight);
      g.scrollTop = g.scrollHeight;
      const cards = [...g.querySelectorAll('.app-card')];
      const overlay = cards[cards.length - 1].querySelector('.card-link-overlay');
      const r = overlay.getBoundingClientRect();
      const pts = [];
      for (const fy of [0.15, 0.5, 0.85]) for (const fx of [0.1, 0.3, 0.5, 0.7, 0.9]) pts.push([r.left + r.width * fx, r.top + r.height * fy]);
      return pts.some(([x, y]) => x >= 0 && y >= 0 && x <= innerWidth && y <= innerHeight && document.elementFromPoint(x, y) === overlay);
    });
    let tappable = await probe();
    if (!tappable) {
      await page.waitForTimeout(500);
      tappable = await probe();
    }
    checks.push({ tab, ...dom, tappable });
  }
  if (job.kind === 'matrix' || tabs.length) await page.screenshot({ path: path.join(outDir, name + '.png') });
  await ctx.close();
  const bad = [];
  if (errors.length) bad.push('console: ' + errors.slice(0, 2).join(' | '));
  for (const c of checks) {
    if (!c.pageFits) bad.push(`${c.tab}: horizontal overflow`);
    if (!c.tappable) bad.push(`${c.tab}: last tile not reachable/tappable`);
    if (c.labelsCut) bad.push(`${c.tab}: ${c.labelsCut} icon label(s) cut off`);
    if (!c.cards) bad.push(`${c.tab}: no cards`);
  }
  results.push({ name, ok: !bad.length, bad });
  if (bad.length) failures.push({ name, bad });
};

await fs.rm(outDir, { recursive: true, force: true });
await fs.mkdir(outDir, { recursive: true });

const html = await fs.readFile(path.join(site, 'index.html'), 'utf8');
const m = /<script type="application\/json" id="lx-data">([\s\S]*?)<\/script>/.exec(html);
assert.ok(m, 'lx-data block not found');
let dataOk = true;
try {
  assert.deepStrictEqual(JSON.parse(m[1]), JSON.parse(await fs.readFile(path.join(root, 'links.json'), 'utf8')));
} catch (e) {
  dataOk = false;
  failures.push({ name: 'lx-data', bad: ['lx-data differs from links.json'] });
}

let next = 0;
await Promise.all(Array.from({ length: workers }, async () => {
  while (next < jobs.length) {
    const job = jobs[next++];
    try {
      await runJob(job);
    } catch (e) {
      failures.push({ name: JSON.stringify(job), bad: ['crash: ' + String(e).slice(0, 200)] });
    }
  }
}));

await browser.close();
server.close();
const summary = { jobs: jobs.length, ok: results.filter((r) => r.ok).length, failed: failures.length, lxDataMatchesLinks: dataOk, failures };
await fs.writeFile(path.join(outDir, 'report.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify({ jobs: summary.jobs, ok: summary.ok, failed: summary.failed, lxDataMatchesLinks: dataOk }));
failures.slice(0, 25).forEach((f) => console.log('FAIL', f.name, '::', f.bad.join('; ')));
process.exit(failures.length ? 1 : 0);

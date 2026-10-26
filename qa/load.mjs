import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import zlib from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXT = /\.(html|css|js|json|svg|mjs)$/;
const LIMITS = { htmlGz: 61440, firstLoadGz: 266240 };

const main = async () => {
  const site = siteRoot(root);
  const results = {};
  const html = await fs.readFile(path.join(site, 'index.html'));
  results.htmlGzBytes = zlib.gzipSync(html, { level: 9 }).length;
  results.markersLeft = (html.toString().match(/<!--LX:/g) || []).length;

  const server = await startServer(site);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  const page = await ctx.newPage();
  const urls = new Set();
  page.on('request', (r) => { if (r.url().startsWith(server.base)) urls.add(new URL(r.url()).pathname); });
  await page.goto(server.base + '/');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(2500);
  let total = 0;
  const parts = [];
  for (const u of urls) {
    const file = path.join(site, u === '/' ? 'index.html' : decodeURIComponent(u));
    try {
      const buf = await fs.readFile(file);
      const size = TEXT.test(file) ? zlib.gzipSync(buf, { level: 9 }).length : buf.length;
      total += size;
      parts.push([u, size]);
    } catch (e) {}
  }
  results.firstLoadGzBytes = total;
  results.firstLoadRequests = urls.size;
  results.largest = parts.sort((a, b) => b[1] - a[1]);

  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(1500);
  const net = [];
  page.on('response', (res) => { if (res.url().startsWith(server.base) && !res.fromServiceWorker()) net.push(new URL(res.url()).pathname); });
  await page.reload();
  await page.waitForSelector('#appGrid .app-card');
  const firstPaint = await page.evaluate(() => (performance.getEntriesByName('first-contentful-paint')[0] || {}).startTime || null);
  results.repeatVisitNetworkRequestsBeforeGrid = net.length;
  results.repeatVisitNetwork = net.slice(0, 6);
  results.firstContentfulPaintMs = firstPaint && Math.round(firstPaint);

  await ctx.setOffline(true);
  await page.reload();
  results.offlineGridOk = !!(await page.waitForSelector('#appGrid .app-card', { timeout: 8000 }).catch(() => null));
  await browser.close();
  await server.close();

  results.pass = results.htmlGzBytes <= LIMITS.htmlGz && results.firstLoadGzBytes <= LIMITS.firstLoadGz && results.markersLeft === 0 && results.repeatVisitNetworkRequestsBeforeGrid === 0 && results.offlineGridOk;
  console.log(JSON.stringify(results));
  if (!results.pass) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

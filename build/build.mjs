import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { build as esbuild, transform } from 'esbuild';
import postcss from 'postcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (f) => path.join(root, 'src', f);
const dist = path.join(root, 'dist');
const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);

const CRITICAL_SELECTOR = /^(?::root|html|body|\*)(?:\[[^\]]*\])*$/;

const splitCss = (css) => {
  const tree = postcss.parse(css);
  const critical = [];
  const rest = [];
  tree.each((node) => {
    const text = node.toString();
    if (node.type === 'atrule' && (node.name === 'font-face' || node.name === 'property')) critical.push(text);
    else if (node.type === 'rule' && node.selectors.every((s) => CRITICAL_SELECTOR.test(s.trim()))) critical.push(text);
    else rest.push(text);
  });
  return { critical: critical.join('\n'), rest: rest.join('\n') };
};

const minifyCss = async (css) => (await transform(css, { loader: 'css', minify: true })).code;

const copyDir = async (from, to) => {
  await fs.mkdir(to, { recursive: true });
  for (const e of await fs.readdir(from, { withFileTypes: true })) {
    if (e.isDirectory()) await copyDir(path.join(from, e.name), path.join(to, e.name));
    else await fs.copyFile(path.join(from, e.name), path.join(to, e.name));
  }
};

const swSource = (cacheName, precache) => `const CACHE = ${JSON.stringify(cacheName)};
const PRECACHE = ${JSON.stringify(precache)};
const HASHED = /\\/(app\\.[0-9a-f]{8}\\.(css|js)|icons\\/(atlas|glyph-atlas|glyphs)\\.[0-9a-f]{8}\\.(webp|svg)|fonts\\/[^/]+\\.woff2)$/;
const REVALIDATED = /\\/(links\\.json|icons\\/manifest\\.v2\\.json)$/;
const REVALIDATE_DELAY_MS = 2000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('lx-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const cacheFirst = async (request) => {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) cache.put(request, res.clone());
  return res;
};

const staleWhileRevalidate = (event) => {
  const request = event.request;
  const refresh = () => fetch(request, { cache: 'no-cache' }).then(async (res) => {
    if (res.ok) (await caches.open(CACHE)).put(request.url, res.clone());
    return res;
  });
  const respond = caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(request.url);
    if (hit) {
      event.waitUntil(new Promise((r) => setTimeout(r, REVALIDATE_DELAY_MS)).then(refresh).catch(() => {}));
      return hit;
    }
    return refresh();
  });
  event.respondWith(respond);
};

const networkFirst = async (request) => {
  try {
    const res = await fetch(request);
    if (res.ok) (await caches.open(CACHE)).put(request, res.clone());
    return res;
  } catch (e) {
    const hit = await caches.match(request);
    if (hit) return hit;
    throw e;
  }
};

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(caches.match(new URL('index.html', self.registration.scope).href).then((hit) => hit || fetch(request)));
    return;
  }
  if (HASHED.test(url.pathname)) { event.respondWith(cacheFirst(request)); return; }
  if (REVALIDATED.test(url.pathname)) { staleWhileRevalidate(event); return; }
  event.respondWith(networkFirst(request));
});
`;

const main = async () => {
  await fs.rm(dist, { recursive: true, force: true });
  await fs.mkdir(dist, { recursive: true });

  const links = JSON.parse(await fs.readFile(path.join(root, 'links.json'), 'utf8'));
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'icons', 'manifest.v2.json'), 'utf8'));
  const spriteFile = manifest.glyphSprite.file;
  const spriteSvg = await fs.readFile(path.join(root, spriteFile), 'utf8');
  const spriteInner = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(spriteSvg)[1];

  const { critical, rest } = splitCss(await fs.readFile(src('app.css'), 'utf8'));
  const criticalMin = await minifyCss(critical);
  const restMin = await minifyCss(rest);
  const cssName = `app.${hash8(Buffer.from(restMin))}.css`;
  await fs.writeFile(path.join(dist, cssName), restMin);

  const js = await esbuild({ entryPoints: [src('app.js')], bundle: true, format: 'iife', minify: true, target: 'es2022', write: false, legalComments: 'none' });
  const jsText = js.outputFiles[0].text;
  const jsName = `app.${hash8(Buffer.from(jsText))}.js`;
  await fs.writeFile(path.join(dist, jsName), jsText);

  const dataJson = JSON.stringify(links).replace(/</g, '\\u003c');
  let html = await fs.readFile(src('index.html'), 'utf8');
  const fill = (marker, value) => {
    if (!html.includes(marker)) throw new Error(`missing ${marker}`);
    html = html.replace(marker, () => value);
  };
  fill('<!--LX:CSS-->', `<style>${criticalMin}</style><link rel="stylesheet" href="${cssName}">`);
  fill('<!--LX:DATA-->', `<script type="application/json" id="lx-data">${dataJson}</script>`);
  fill('<!--LX:SPRITE-->', `<svg id="lx-glyphs" aria-hidden="true" style="position:absolute;width:0;height:0;overflow:hidden" data-file="${spriteFile}" xmlns="http://www.w3.org/2000/svg">${spriteInner}</svg>`);
  fill('<!--LX:JS-->', `<script defer src="${jsName}"></script>`);
  await fs.writeFile(path.join(dist, 'index.html'), html);

  await fs.mkdir(path.join(dist, 'icons'), { recursive: true });
  const shipped = ['icons/manifest.v2.json', 'icons/manifest.v2.schema.json', manifest.atlas.file, manifest.glyphSprite.file];
  if (manifest.glyphAtlas) shipped.push(manifest.glyphAtlas.file);
  for (const f of shipped) {
    try { await fs.copyFile(path.join(root, f), path.join(dist, f)); } catch (e) { throw new Error(`icons: missing ${f}`); }
  }
  await copyDir(path.join(root, 'fonts'), path.join(dist, 'fonts'));
  for (const f of ['links.json', 'compare.html', 'favicon.ico']) await fs.copyFile(path.join(root, f), path.join(dist, f));
  await fs.copyFile(src('apple-touch-icon.png'), path.join(dist, 'apple-touch-icon.png'));

  const needsAtlas = Object.values(manifest.icons).some((e) => e && e.favicon && !e.glyph && e.status !== 'default');
  const precache = ['index.html', cssName, jsName, spriteFile, 'favicon.ico', 'links.json', 'icons/manifest.v2.json',
    'fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2', 'fonts/el-messiri-arabic-700-normal.woff2', 'fonts/inter-latin-400-normal.woff2', 'fonts/cormorant-garamond-latin-400-italic.woff2'];
  if (manifest.glyphAtlas) precache.push(manifest.glyphAtlas.file);
  if (needsAtlas) precache.push(manifest.atlas.file);
  const parts = [];
  for (const f of precache) parts.push(f + ':' + hash8(await fs.readFile(path.join(dist, f))));
  const cacheName = `lx-${hash8(Buffer.from(parts.join('|')))}`;
  await fs.writeFile(path.join(dist, 'sw.js'), swSource(cacheName, precache));
  console.log(JSON.stringify({ cacheName, css: cssName, js: jsName, criticalBytes: criticalMin.length, restBytes: restMin.length, jsBytes: jsText.length, htmlBytes: html.length }));
};

main().catch((e) => { console.error(e); process.exit(1); });

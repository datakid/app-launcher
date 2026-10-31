const CACHE = "lx-c11733bb";
const PRECACHE = ["index.html","app.a85a4d87.css","app.c0b94339.js","icons/glyphs.a8f51f68.svg","favicon.ico","links.json","icons/manifest.v2.json","fonts/ibm-plex-sans-arabic-arabic-400-normal.woff2","fonts/el-messiri-arabic-700-normal.woff2","fonts/inter-latin-400-normal.woff2","fonts/cormorant-garamond-latin-400-italic.woff2","icons/glyph-atlas.2c29e8ec.webp"];
const HASHED = /\/(app\.[0-9a-f]{8}\.(css|js)|icons\/(atlas|glyph-atlas|glyphs)\.[0-9a-f]{8}\.(webp|svg)|fonts\/[^/]+\.woff2)$/;
const REVALIDATED = /\/(links\.json|icons\/manifest\.v2\.json)$/;
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

import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { check, finish } from './util.mjs';
import { createHandler, isPrivateAddress, LIMITS } from '../api/fetch.js';

const TOKEN = 'secret-token';
const publicResolve = async () => [{ address: '93.184.216.34', family: 4 }];

const body = (text, status = 200, type = 'text/html', extra = {}) => ({ status, headers: { 'content-type': type, ...extra }, body: Readable.from([Buffer.from(text)]), destroy() {} });

const call = async (handler, { url, token = TOKEN, method = 'GET' } = {}) => {
  const headers = {};
  let status = 0;
  let out = Buffer.alloc(0);
  const res = {
    statusCode: 0,
    setHeader: (k, v) => (headers[k.toLowerCase()] = v),
    end: (b) => {
      status = res.statusCode;
      out = Buffer.from(b || '');
    }
  };
  await handler({ method, url: '/api/fetch?url=' + encodeURIComponent(url || ''), headers: token === null ? {} : { 'x-studio-token': token } }, res);
  return { status, headers, text: out.toString('utf8') };
};

const make = (request, resolve = publicResolve, extra = {}) => createHandler({ resolve, request, env: { STUDIO_TOKEN: TOKEN }, ...extra });

await check('private and special addresses are recognised', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '64:ff9b::a00:1', '2002:7f00:1::1', '2001:db8::1']) assert.equal(isPrivateAddress(ip), true, ip);
  for (const ip of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:2800:220:1:248:1893:25c8:1946', '::ffff:8.8.8.8']) assert.equal(isPrivateAddress(ip), false, ip);
});

await check('token is required, constant-time compared and never echoed', async () => {
  const h = make(async () => body('<html></html>'));
  assert.equal((await call(h, { url: 'https://example.com/', token: null })).status, 401);
  assert.equal((await call(h, { url: 'https://example.com/', token: 'nope' })).status, 401);
  const ok = await call(h, { url: 'https://example.com/' });
  assert.equal(ok.status, 200);
  assert.ok(!JSON.stringify(ok.headers).includes(TOKEN));
});

await check('a proxy without a configured token refuses everything', async () => {
  const h = createHandler({ resolve: publicResolve, request: async () => body('x'), env: {} });
  assert.equal((await call(h, { url: 'https://example.com/' })).status, 500);
});

await check('only http and https urls are accepted', async () => {
  const h = make(async () => body('x'));
  for (const u of ['file:///etc/passwd', 'ftp://example.com/', 'gopher://example.com/', 'javascript:alert(1)', 'not a url', 'https://user:pw@example.com/']) assert.equal((await call(h, { url: u })).status, 400, u);
});

await check('disallowed ports are refused', async () => {
  const h = make(async () => body('x'));
  assert.equal((await call(h, { url: 'http://example.com:22/' })).status, 403);
  assert.equal((await call(h, { url: 'http://example.com:6379/' })).status, 403);
});

await check('private literals, localhost and internal names are refused', async () => {
  let hits = 0;
  const h = make(async () => (hits++, body('x')));
  for (const u of ['http://127.0.0.1/', 'http://[::1]/', 'http://169.254.169.254/latest/meta-data/', 'http://10.0.0.5/', 'http://localhost/', 'http://db.internal/', 'http://printer.local/', 'http://[::ffff:127.0.0.1]/', 'http://2130706433/']) assert.equal((await call(h, { url: u })).status, 403, u);
  assert.equal(hits, 0);
});

await check('a hostname that resolves to a private address is refused, even among public ones', async () => {
  let hits = 0;
  const mixed = async () => [{ address: '93.184.216.34', family: 4 }, { address: '10.0.0.9', family: 4 }];
  const h = make(async () => (hits++, body('x')), mixed);
  assert.equal((await call(h, { url: 'https://rebind.example.com/' })).status, 403);
  assert.equal(hits, 0);
});

await check('the request is pinned to the address that was validated', async () => {
  const seen = [];
  const h = make(async (r) => (seen.push([r.address, r.family]), body('<html></html>')));
  await call(h, { url: 'https://example.com/' });
  assert.deepEqual(seen, [['93.184.216.34', 4]]);
});

await check('redirects are followed up to three hops and each hop is re-checked', async () => {
  let n = 0;
  const hops = async (r) => {
    n++;
    return n < 4 ? body('', 302, 'text/html', { location: '/next' + n }) : body('<html>ok</html>');
  };
  assert.equal((await call(make(hops), { url: 'https://example.com/' })).status, 200);
  n = 0;
  const forever = async () => body('', 302, 'text/html', { location: '/again' });
  assert.equal((await call(make(forever), { url: 'https://example.com/' })).status, 502);
  const toPrivate = async () => body('', 302, 'text/html', { location: 'http://169.254.169.254/' });
  assert.equal((await call(make(toPrivate), { url: 'https://example.com/' })).status, 403);
  const toBadScheme = async () => body('', 302, 'text/html', { location: 'file:///etc/passwd' });
  assert.equal((await call(make(toBadScheme), { url: 'https://example.com/' })).status, 400);
});

await check('a redirect to a host that resolves privately is refused', async () => {
  let calls = 0;
  const resolve = async (host) => (host === 'evil.example.net' ? [{ address: '192.168.0.10', family: 4 }] : [{ address: '93.184.216.34', family: 4 }]);
  const h = make(async () => (calls++, body('', 301, 'text/html', { location: 'https://evil.example.net/x' })), resolve);
  assert.equal((await call(h, { url: 'https://example.com/' })).status, 403);
  assert.equal(calls, 1);
});

await check('responses over 512 KiB are cut off with 413', async () => {
  const big = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, body: Readable.from([Buffer.alloc(LIMITS.maxBytes), Buffer.alloc(10)]), destroy() {} });
  assert.equal((await call(make(big), { url: 'https://example.com/a.png' })).status, 413);
  const exact = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, body: Readable.from([Buffer.alloc(LIMITS.maxBytes)]), destroy() {} });
  assert.equal((await call(make(exact), { url: 'https://example.com/a.png' })).status, 200);
});

await check('only page, image and json content types pass', async () => {
  for (const type of ['text/html; charset=utf-8', 'image/svg+xml', 'image/x-icon', 'application/json', 'application/manifest+json']) assert.equal((await call(make(async () => body('x', 200, type)), { url: 'https://example.com/' })).status, 200, type);
  for (const type of ['application/zip', 'video/mp4', 'application/pdf', 'text/javascript']) assert.equal((await call(make(async () => body('x', 200, type)), { url: 'https://example.com/' })).status, 415, type);
});

await check('upstream status and final url are exposed, and challenge headers pass through', async () => {
  const h = make(async () => body('<html>blocked</html>', 403, 'text/html', { 'x-vercel-mitigated': 'challenge' }));
  const r = await call(h, { url: 'https://example.com/page' });
  assert.equal(r.status, 200);
  assert.equal(r.headers['x-upstream-status'], '403');
  assert.equal(r.headers['x-upstream-url'], 'https://example.com/page');
  assert.equal(r.headers['x-vercel-mitigated'], 'challenge');
});

await check('a hanging upstream ends with 504', async () => {
  const hang = async () => {
    const e = new Error('timeout');
    e.code = 'ETIMEDOUT';
    throw e;
  };
  assert.equal((await call(make(hang), { url: 'https://example.com/' })).status, 504);
});

await check('only GET and OPTIONS are allowed and CORS is set', async () => {
  const h = make(async () => body('x'));
  assert.equal((await call(h, { url: 'https://example.com/', method: 'POST' })).status, 405);
  const pre = await call(h, { method: 'OPTIONS', token: null });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers['access-control-allow-origin'], '*');
  assert.ok(pre.headers['access-control-allow-headers'].includes('x-studio-token'));
});

finish();

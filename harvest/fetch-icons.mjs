import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import decodeIco from 'decode-ico';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const linksPath = path.join(root, 'links.json');
const iconsDir = path.join(root, 'icons');
const manifestPath = path.join(iconsDir, 'manifest.json');
const overridesPath = path.join(here, 'icon-overrides.json');
const extrasPath = path.join(here, 'extras.json');
const reportPath = path.join(here, 'report.json');
const DHASH_MAX = 6;
const DELTA_E_MAX = 0.03;
const MIN_OTHER_APPS = 2;
const MIN_TINT_SEP = 0.04;
const BLOCK_STATUS = new Set([401, 403, 429]);
const CHALLENGE_RE = /security checkpoint|just a moment|attention required|authentication required|vercel\.com\/sso-api|_vercel\/(jwt|sso)|cf-chl|challenge-platform|x-vercel-challenge|checking your browser/i;

const argv = process.argv.slice(2);
const fromIdx = argv.indexOf('--from');
const fromDir = fromIdx >= 0 && argv[fromIdx + 1] ? path.resolve(argv[fromIdx + 1]) : null;

const UA = 'Mozilla/5.0 LinkExpressIconBot';
const KEY_RE = /^[a-z0-9-]+$/;
const RASTER_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const short = (href) => (href && href.startsWith('data:') ? href.slice(0, 60) : href);
const errText = (e) => {
  const c = e && e.cause;
  const code = c && (c.code || (Array.isArray(c.errors) && c.errors[0] && c.errors[0].code));
  return code || (c && c.message) || (e && e.message) || String(e);
};

const sniff = (buf) => {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  const tag = buf.subarray(0, 4).toString('latin1');
  if (tag === 'GIF8') return 'gif';
  if (tag === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0 && (buf[4] | (buf[5] << 8)) > 0) return 'ico';
  const head = buf.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (!/^<(!doctype html|html|head|body)/i.test(head) && /<svg[\s>]/i.test(head)) return 'svg';
  return null;
};

const decodeDataUri = (uri) => {
  const m = /^data:([^,]*),([\s\S]*)$/i.exec(uri);
  if (!m) return null;
  if (/;base64$/i.test(m[1])) return Buffer.from(m[2], 'base64');
  try {
    return Buffer.from(decodeURIComponent(m[2]), 'utf8');
  } catch {
    return Buffer.from(m[2], 'utf8');
  }
};

const fetchRetry = async (url) => {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      return await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15000), headers: { 'User-Agent': UA } });
    } catch (e) {
      last = e;
      if (i < 2) await sleep(1000);
    }
  }
  throw last;
};

const loadHref = async (href) => {
  if (href.startsWith('data:')) return decodeDataUri(href);
  const res = await fetchRetry(href);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return Buffer.from(await res.arrayBuffer());
};

const resolveHref = (href, base) => {
  if (/^data:/i.test(href)) return href;
  try {
    return new URL(href, base).href;
  } catch {
    return null;
  }
};

const sizeScore = (sizes) => {
  if (!sizes) return 0;
  if (/\bany\b/i.test(sizes)) return 1e6;
  let best = 0;
  for (const m of String(sizes).matchAll(/(\d+)\s*[x\u00d7]\s*(\d+)/gi)) best = Math.max(best, Number(m[1]) * Number(m[2]));
  return best;
};
const bySize = (a, b) => sizeScore(b.sizes) - sizeScore(a.sizes);

const iconKind = (l) => {
  const h = l.href.toLowerCase();
  const pathPart = h.startsWith('data:') ? '' : h.split(/[?#]/)[0];
  if (l.type.includes('svg') || h.startsWith('data:image/svg') || pathPart.endsWith('.svg')) return 'svg';
  if (l.type.includes('x-icon') || l.type.includes('microsoft.icon') || h.startsWith('data:image/x-icon') || h.startsWith('data:image/vnd.microsoft') || pathPart.endsWith('.ico')) return 'ico';
  return 'png';
};

const readLinks = (html) => {
  const $ = cheerio.load(html);
  return $('link[href]')
    .map((_, el) => ({
      rel: ($(el).attr('rel') || '').toLowerCase().split(/\s+/).filter(Boolean),
      href: $(el).attr('href') || '',
      sizes: $(el).attr('sizes') || '',
      type: ($(el).attr('type') || '').toLowerCase()
    }))
    .get()
    .filter((l) => l.href);
};

const candidateGroups = (links, base, errors) => {
  const make = (type, list, from = base) =>
    list
      .map((l) => ({ type, href: resolveHref(l.href, from) }))
      .filter((c, i, arr) => c.href && arr.findIndex((x) => x.href === c.href) === i);
  const iconLinks = links.filter((l) => l.rel.includes('icon'));
  const apple = links.filter((l) => l.rel.some((r) => r === 'apple-touch-icon' || r === 'apple-touch-icon-precomposed')).sort(bySize);
  const svg = iconLinks.filter((l) => iconKind(l) === 'svg').sort(bySize);
  const png = iconLinks.filter((l) => iconKind(l) === 'png').sort(bySize);
  const ico = iconLinks.filter((l) => iconKind(l) === 'ico').sort(bySize);

  const manifest = async () => {
    const l = links.find((x) => x.rel.includes('manifest'));
    if (!l) return [];
    const href = resolveHref(l.href, base);
    if (!href) return [];
    try {
      let text;
      if (href.startsWith('data:')) {
        text = decodeDataUri(href).toString('utf8');
      } else {
        const res = await fetchRetry(href);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        text = await res.text();
      }
      const json = JSON.parse(text);
      const mbase = href.startsWith('data:') ? base : href;
      const icons = (Array.isArray(json.icons) ? json.icons : []).filter((i) => i && typeof i.src === 'string').sort(bySize);
      return make('manifest', icons.map((i) => ({ href: i.src })), mbase);
    } catch (e) {
      errors.push('manifest: ' + errText(e));
      return [];
    }
  };

  const fallback = async () => {
    try {
      return [{ type: 'favicon.ico', href: new URL('/favicon.ico', base).href }];
    } catch {
      return [];
    }
  };

  return [async () => make('apple-touch-icon', apple), async () => make('svg', svg), async () => make('png', png), manifest, async () => make('ico', ico), fallback];
};

const matteCorners = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const h = info.height;
  const dark = (x, y, t) => {
    const i = (y * w + x) * 4;
    return data[i + 3] === 255 && Math.max(data[i], data[i + 1], data[i + 2]) <= t;
  };
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  if (!corners.every(([x, y]) => dark(x, y, 20))) return png;
  const cut = new Uint8Array(w * h);
  const stack = corners.map(([x, y]) => y * w + x);
  let count = 0;
  while (stack.length) {
    const p = stack.pop();
    if (cut[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (!dark(x, y, 36)) continue;
    cut[p] = 1;
    count++;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;
  for (let p = 0; p < w * h; p++) {
    if (cut[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    kept++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!kept) return png;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const framed = count > w * h * 0.14;
  if (framed && (kept / (bw * bh) < 0.8 || bw < w * 0.5 || bh < h * 0.5 || Math.abs(bw - bh) > Math.max(bw, bh) * 0.1)) return png;
  const fringe = [];
  for (let p = 0; p < w * h; p++) {
    if (cut[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    const near = (x > 0 && cut[p - 1]) || (x < w - 1 && cut[p + 1]) || (y > 0 && cut[p - w]) || (y < h - 1 && cut[p + w]);
    if (near && Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) <= 80) fringe.push(p);
  }
  for (const p of fringe) cut[p] = 1;
  const alpha = Buffer.alloc(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = cut[p] ? 0 : 255;
  const blurred = await sharp(alpha, { raw: { width: w, height: h, channels: 1 } }).blur(0.7).raw().toBuffer({ resolveWithObject: true });
  const stride = blurred.info.channels;
  const out = Buffer.from(data);
  for (let p = 0; p < w * h; p++) out[p * 4 + 3] = cut[p] ? 0 : Math.min(blurred.data[p * stride], out[p * 4 + 3]);
  const matted = sharp(out, { raw: { width: w, height: h, channels: 4 } });
  if (!framed) return matted.png().toBuffer();
  return matted
    .extract({ left: minX, top: minY, width: bw, height: bh })
    .resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
};

const normalize = async (buf, ext) => {
  let img;
  let srcWidth = null;
  let opaque = false;
  if (ext === 'ico') {
    const frames = decodeIco(buf);
    if (!frames.length) throw new Error('empty ico');
    const best = frames.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a));
    srcWidth = best.width;
    img = best.type === 'png' ? sharp(Buffer.from(best.data)) : sharp(Buffer.from(best.data), { raw: { width: best.width, height: best.height, channels: 4 } });
  } else if (ext === 'svg') {
    const probe = await sharp(buf, { density: 72 }).metadata();
    const longest = Math.max(probe.width || 100, probe.height || 100);
    const density = Math.min(2400, Math.max(72, Math.round((72 * 384) / longest)));
    img = sharp(buf, { density });
  } else {
    img = sharp(buf);
    const meta = await img.metadata();
    srcWidth = meta.width;
    opaque = !meta.hasAlpha;
  }
  let png = await img.resize(192, 192, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
  if (opaque) png = await matteCorners(png);
  return { png, srcWidth };
};

const gate = async (png, srcWidth) => {
  if (srcWidth !== null && srcWidth < 16) return 'source smaller than 16x16';
  const { data } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let clear = true;
  let flat = true;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] !== 0) clear = false;
    if (flat && (data[i] !== data[0] || data[i + 1] !== data[1] || data[i + 2] !== data[2] || data[i + 3] !== data[3])) flat = false;
    if (!clear && !flat) break;
  }
  if (clear) return 'fully transparent';
  if (flat) return 'single flat colour';
  return null;
};

const srgbToLin = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const linToSrgb = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055; return Math.round(Math.min(1, Math.max(0, v)) * 255); };
const toOklab = (r, g, b) => {
  const R = srgbToLin(r), G = srgbToLin(g), B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const fromOklab = (L, a, b) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
};
const oklchHex = (L, C, h) => {
  for (let i = Math.round(C / 0.005); i >= 0; i--) {
    const c = i * 0.005;
    const rgb = fromOklab(L, c * Math.cos(h), c * Math.sin(h));
    if (rgb.every((v) => v >= -1e-4 && v <= 1.0001)) return '#' + rgb.map((v) => linToSrgb(v).toString(16).padStart(2, '0')).join('');
  }
  return '#808080';
};
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

const extractGradient = (data, lab, n) => {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, L: 0, a: 0, b: 0 }));
  let opaque = 0, chromatic = 0;
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] < 200) continue;
    opaque++;
    const L = lab[p * 3], a = lab[p * 3 + 1], b = lab[p * 3 + 2], C = Math.hypot(a, b);
    if (C < 0.04 || L < 0.2 || L > 0.95) continue;
    chromatic++;
    const h = (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI);
    const bin = bins[Math.floor((h / (2 * Math.PI)) * 24) % 24];
    bin.w += C; bin.L += L * C; bin.a += a * C; bin.b += b * C;
  }
  if (!opaque || chromatic / opaque < 0.03) return null;
  let best = 0, bestW = -1;
  for (let i = 0; i < 24; i++) {
    const w = bins[(i + 23) % 24].w + bins[i].w + bins[(i + 1) % 24].w;
    if (w > bestW) { bestW = w; best = i; }
  }
  let sw = 0, sa = 0, sb = 0;
  for (const j of [(best + 23) % 24, best, (best + 1) % 24]) { sw += bins[j].w; sa += bins[j].a; sb += bins[j].b; }
  const a = sa / sw, b = sb / sw, h = Math.atan2(b, a);
  const c = Math.min(Math.max(Math.hypot(a, b), 0.06), 0.16);
  return [oklchHex(0.66, c, h), oklchHex(0.86, Math.min(c * 0.75, 0.11), h), oklchHex(0.38, Math.min(c, 0.12), h)];
};

const solve3 = (m, v) => {
  const a = m.map((r, i) => [...r, v[i]]);
  for (let i = 0; i < 3; i++) {
    let piv = i;
    for (let r = i + 1; r < 3; r++) if (Math.abs(a[r][i]) > Math.abs(a[piv][i])) piv = r;
    if (Math.abs(a[piv][i]) < 1e-9) return null;
    [a[i], a[piv]] = [a[piv], a[i]];
    for (let r = 0; r < 3; r++) {
      if (r === i) continue;
      const f = a[r][i] / a[i][i];
      for (let c = i; c < 4; c++) a[r][c] -= f * a[i][c];
    }
  }
  return [a[0][3] / a[0][0], a[1][3] / a[1][1], a[2][3] / a[2][2]];
};

const fitBackground = (pts, lab, w, h) => {
  if (pts.length < 40) return null;
  const m = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  const rhs = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const p of pts) {
    const f = [1, (p % w) / w, Math.floor(p / w) / h];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i][j] += f[i] * f[j];
      for (let c = 0; c < 3; c++) rhs[c][i] += f[i] * lab[p * 3 + c];
    }
  }
  const coef = [0, 1, 2].map((c) => solve3(m, rhs[c]));
  if (coef.some((c) => !c)) return null;
  return (p) => {
    const x = (p % w) / w;
    const y = Math.floor(p / w) / h;
    return coef.map((k) => k[0] + k[1] * x + k[2] * y);
  };
};

const extractGlyph = async (data, lab, w, h) => {
  const n = w * h;
  let minX = w, minY = h, maxX = -1, maxY = -1, solid = 0;
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] < 128) continue;
    const x = p % w, y = (p - x) / w;
    solid++;
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y;
  }
  if (!solid) return null;
  const fill = solid / ((maxX - minX + 1) * (maxY - minY + 1));
  const clear = (x, y) => x < 0 || y < 0 || x >= w || y >= h || data[(y * w + x) * 4 + 3] < 128;
  const nearEdge = (p, d) => {
    const x = p % w, y = (p - x) / w;
    return clear(x - d, y) || clear(x + d, y) || clear(x, y - d) || clear(x, y + d);
  };

  const plainAlpha = () => {
    const alpha = new Float32Array(n);
    for (let p = 0; p < n; p++) alpha[p] = data[p * 4 + 3] / 255;
    return alpha;
  };

  const uniformAlpha = () => {
    const band = [];
    for (let p = 0; p < n; p++) {
      if (data[p * 4 + 3] < 200) continue;
      if (nearEdge(p, 3)) band.push(p);
    }
    if (!band.length) return null;
    let L = 0, A = 0, B = 0;
    for (const p of band) { L += lab[p * 3]; A += lab[p * 3 + 1]; B += lab[p * 3 + 2]; }
    L /= band.length; A /= band.length; B /= band.length;
    let spread = 0;
    for (const p of band) spread += Math.hypot(lab[p * 3] - L, lab[p * 3 + 1] - A, lab[p * 3 + 2] - B);
    if (spread / band.length > 0.06) return null;
    const alpha = new Float32Array(n);
    for (let p = 0; p < n; p++) alpha[p] = (data[p * 4 + 3] / 255) * smooth(0.08, 0.22, Math.hypot(lab[p * 3] - L, lab[p * 3 + 1] - A, lab[p * 3 + 2] - B));
    return alpha;
  };

  const ringAlpha = () => {
    const ring = [];
    for (let p = 0; p < n; p++) {
      if (data[p * 4 + 3] < 200) continue;
      if (!nearEdge(p, 7) && nearEdge(p, 16)) ring.push(p);
    }
    const bgAt = fitBackground(ring, lab, w, h);
    if (!bgAt) return null;
    let res = 0;
    for (const p of ring) {
      const b = bgAt(p);
      res += Math.hypot(lab[p * 3] - b[0], lab[p * 3 + 1] - b[1], lab[p * 3 + 2] - b[2]);
    }
    if (res / ring.length > 0.05) return null;
    const alpha = new Float32Array(n);
    for (let p = 0; p < n; p++) {
      if (nearEdge(p, 7)) continue;
      const b = bgAt(p);
      alpha[p] = (data[p * 4 + 3] / 255) * smooth(0.08, 0.22, Math.hypot(lab[p * 3] - b[0], lab[p * 3 + 1] - b[1], lab[p * 3 + 2] - b[2]));
    }
    return alpha;
  };

  const finish = async (alpha) => {
    let gx0 = w, gy0 = h, gx1 = -1, gy1 = -1, on = 0;
    for (let p = 0; p < n; p++) {
      if (alpha[p] < 0.5) continue;
      const x = p % w, y = (p - x) / w;
      on++;
      if (x < gx0) gx0 = x; if (x > gx1) gx1 = x; if (y < gy0) gy0 = y; if (y > gy1) gy1 = y;
    }
    if (!on) return null;
    const cover = on / n;
    const gfill = on / ((gx1 - gx0 + 1) * (gy1 - gy0 + 1));
    if (cover < 0.02 || cover > 0.6 || gfill > 0.85) return null;
    const out = Buffer.alloc(n * 4);
    for (let p = 0; p < n; p++) { out[p * 4] = 255; out[p * 4 + 1] = 255; out[p * 4 + 2] = 255; out[p * 4 + 3] = Math.round(alpha[p] * 255); }
    const clearBg = { r: 255, g: 255, b: 255, alpha: 0 };
    return sharp(out, { raw: { width: w, height: h, channels: 4 } })
      .extract({ left: gx0, top: gy0, width: gx1 - gx0 + 1, height: gy1 - gy0 + 1 })
      .resize(104, 104, { fit: 'contain', background: clearBg })
      .extend({ top: 12, bottom: 12, left: 12, right: 12, background: clearBg })
      .png({ compressionLevel: 9 })
      .toBuffer();
  };

  const attempts = fill >= 0.7 ? [uniformAlpha, ringAlpha] : [plainAlpha];
  for (const make of attempts) {
    const alpha = make();
    if (!alpha) continue;
    const glyph = await finish(alpha);
    if (glyph) return glyph;
  }
  return null;
};

const analyzeIcon = async (png) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const n = info.width * info.height;
  const lab = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) {
    const [L, a, b] = toOklab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    lab[p * 3] = L; lab[p * 3 + 1] = a; lab[p * 3 + 2] = b;
  }
  return { gradient: extractGradient(data, lab, n), glyph: await extractGlyph(data, lab, info.width, info.height) };
};

const buildTargets = (catalog) => {
  const out = [];
  for (const cat of catalog.categories) {
    if (!cat || cat.id === 'mine') continue;
    for (const app of Array.isArray(cat.apps) ? cat.apps : []) {
      if (!app || typeof app.id !== 'string' || app.id.startsWith('u-')) continue;
      if (Array.isArray(app.variants) && app.variants.length) {
        for (const v of app.variants) out.push({ key: app.id + '--' + v.id, appId: app.id, variantId: v.id, url: v.url });
      } else if (typeof app.url === 'string') {
        out.push({ key: app.id, appId: app.id, variantId: null, url: app.url });
      }
    }
  }
  return out;
};

const readExtras = async () => {
  try {
    const parsed = JSON.parse(await fs.readFile(extrasPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    return Object.entries(parsed)
      .filter(([k, u]) => KEY_RE.test(k) && typeof u === 'string' && /^https?:/.test(u))
      .map(([k, u]) => ({ key: k, appId: k, variantId: null, url: u, extra: true }));
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
};

const readOverrides = async () => {
  try {
    const parsed = JSON.parse(await fs.readFile(overridesPath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (e) {
    if (e.code === 'ENOENT') {
      await fs.writeFile(overridesPath, '{}\n');
      return {};
    }
    throw e;
  }
};

const findLocal = async (key) => {
  for (const ext of RASTER_EXT) {
    try {
      return { buf: await fs.readFile(path.join(fromDir, key + '.' + ext)), file: key + '.' + ext };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return null;
};

const finishFrom = async (buf, source, result) => {
  const ext = sniff(buf);
  if (!ext) throw new Error('not an image');
  const { png, srcWidth } = await normalize(buf, ext);
  const bad = await gate(png, srcWidth);
  if (bad) throw new Error(bad);
  result.png = png;
  result.source = source;
};

const processTarget = async (t, overrides) => {
  const result = { key: t.key, url: t.url, status: 'notfound', source: null, error: null, png: null, fa: false };
  if (!KEY_RE.test(t.key)) {
    result.error = 'key is not safe for a file name';
    return result;
  }
  try {
    const ov = overrides[t.key];
    if (ov && typeof ov === 'object' && ov.use === 'fa') {
      result.status = 'override';
      result.fa = true;
      result.source = { type: 'override', href: 'fa' };
      return result;
    }
    if (typeof ov === 'string' && ov) {
      const file = path.resolve(root, ov);
      if (!file.startsWith(root + path.sep)) throw new Error('override path leaves the repo');
      await finishFrom(await fs.readFile(file), { type: 'override', href: ov }, result);
      result.status = 'override';
      return result;
    }
    if (fromDir) {
      const local = await findLocal(t.key);
      if (!local) {
        result.error = 'no file for this key in ' + path.basename(fromDir);
        return result;
      }
      await finishFrom(local.buf, { type: 'local', href: local.file }, result);
      result.status = 'found';
      return result;
    }
  } catch (e) {
    result.error = errText(e);
    return result;
  }

  const errors = [];
  let html = '';
  let base = t.url;
  try {
    const res = await fetchRetry(t.url);
    base = res.url || t.url;
    if (BLOCK_STATUS.has(res.status) || res.headers.get('x-vercel-mitigated') === 'challenge') {
      result.status = 'blocked';
      result.error = 'HTTP ' + res.status + ' challenge or protection page';
      return result;
    }
    html = await res.text();
  } catch (e) {
    errors.push('page: ' + errText(e));
  }
  const links = readLinks(html);
  if (html && !links.length && CHALLENGE_RE.test(html)) {
    result.status = 'blocked';
    result.error = 'challenge page without icon links';
    return result;
  }
  let lastBad = null;
  for (const group of candidateGroups(links, base, errors)) {
    for (const c of await group()) {
      try {
        const buf = await loadHref(c.href);
        if (!buf || !buf.length) throw new Error('empty');
        const ext = sniff(buf);
        if (!ext) throw new Error('not an image');
        const { png, srcWidth } = await normalize(buf, ext);
        const bad = await gate(png, srcWidth);
        if (bad) {
          lastBad = { bad, source: { type: c.type, href: short(c.href) } };
          errors.push(c.type + ': ' + bad);
          continue;
        }
        result.source = { type: c.type, href: short(c.href) };
        result.png = png;
        result.status = 'found';
        return result;
      } catch (e) {
        errors.push(c.type + ': ' + errText(e));
      }
    }
  }
  if (lastBad) result.source = lastBad.source;
  result.error = errors.slice(-3).join('; ') || 'no icon found';
  return result;
};

const pool = async (items, n, fn) => {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    })
  );
  return out;
};

const stripQuery = (p) => (p ? p.split('?')[0] : p);

const dHash = async (file, isGlyph) => {
  let img = sharp(file).ensureAlpha();
  img = isGlyph ? img.extractChannel('alpha') : img.flatten({ background: '#ffffff' }).greyscale();
  const { data } = await img.resize(9, 8, { fit: 'fill', kernel: 'cubic' }).raw().toBuffer({ resolveWithObject: true });
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (data[y * 9 + x] > data[y * 9 + x + 1] ? 1n : 0n);
    }
  }
  return bits;
};

const hamming = (a, b) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};

const hexToLab = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return toOklab((n >> 16) & 255, (n >> 8) & 255, n & 255);
};

const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

const detectDefaults = (items) => {
  const flagged = new Map();
  const palette = new Map();
  for (const a of items) {
    const hashApps = new Set();
    const tintApps = new Set();
    for (const b of items) {
      if (a.appId === b.appId) continue;
      if (a.hash64 !== null && b.hash64 !== null && hamming(a.hash64, b.hash64) <= DHASH_MAX) hashApps.add(b.appId);
      if (a.lab && b.lab && deltaE(a.lab, b.lab) <= DELTA_E_MAX) tintApps.add(b.appId);
    }
    if (hashApps.size >= MIN_OTHER_APPS) flagged.set(a.key, ['dhash:' + hashApps.size]);
    if (tintApps.size >= MIN_OTHER_APPS) palette.set(a.key, tintApps.size);
  }
  return { flagged, palette };
};

const tintToLch = (hex) => {
  const [L, a, b] = hexToLab(hex);
  return [L, Math.hypot(a, b), Math.atan2(b, a)];
};

const shiftTint = (tint, dh, dl, dc) => tint.map((hex) => {
  const [L, C, h] = tintToLch(hex);
  return oklchHex(Math.min(0.95, Math.max(0.15, L + dl)), Math.max(0, C + dc), h + dh);
});

const seeded = (key) => {
  let x = 2166136261;
  for (const ch of key) {
    x ^= ch.charCodeAt(0);
    x = Math.imul(x, 16777619);
  }
  return (x >>> 0) / 4294967296;
};

const tintCandidates = (key) => {
  const flip = seeded(key) < 0.5 ? 1 : -1;
  const out = [];
  for (const h of [0, 6, 12, 18, 24]) {
    for (const sh of h ? [1, -1] : [1]) {
      for (const dl of [0, 0.03, -0.03, 0.06, -0.06, 0.09, -0.09]) {
        for (const dc of [0, -0.03]) {
          out.push({ dh: (h * sh * flip * Math.PI) / 180, dl, dc, cost: h / 6 + Math.abs(dl) / 0.03 + Math.abs(dc) / 0.03 });
        }
      }
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
};

const separateTints = (entries, targets) => {
  const appOf = new Map(targets.map((t) => [t.key, t.appId]));
  const placed = [];
  const adjusted = [];
  for (const key of Object.keys(entries).sort()) {
    const e = entries[key];
    const base = e.sourceTint || e.tint;
    if (!Array.isArray(base) || base.length !== 3 || !appOf.has(key)) continue;
    const appId = appOf.get(key);
    let chosen = base;
    let bestSep = -1;
    for (const c of tintCandidates(key)) {
      const t = c.dh || c.dl || c.dc ? shiftTint(base, c.dh, c.dl, c.dc) : base;
      const lab = hexToLab(t[0]);
      let sep = Infinity;
      for (const o of placed) if (o.appId !== appId) sep = Math.min(sep, deltaE(lab, o.lab));
      if (sep >= MIN_TINT_SEP) {
        chosen = t;
        bestSep = sep;
        break;
      }
      if (sep > bestSep) {
        bestSep = sep;
        chosen = t;
      }
    }
    e.tint = chosen;
    if (chosen === base) delete e.sourceTint;
    else {
      e.sourceTint = base;
      adjusted.push(key);
    }
    placed.push({ appId, lab: hexToLab(chosen[0]) });
  }
  return adjusted;
};

const readPrevious = async (targets) => {
  const prev = new Map();
  let manifest = null;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
  if (manifest && manifest.icons && typeof manifest.icons === 'object') {
    for (const [k, v] of Object.entries(manifest.icons)) if (v && typeof v === 'object') prev.set(k, v);
  }
  for (const t of targets) {
    if (prev.has(t.key)) continue;
    let png;
    try {
      png = await fs.readFile(path.join(iconsDir, t.key + '.png'));
    } catch (e) {
      if (e.code === 'ENOENT') continue;
      throw e;
    }
    let glyph = null;
    try {
      glyph = await fs.readFile(path.join(iconsDir, t.key + '.glyph.png'));
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    let tint = null;
    try {
      tint = (await analyzeIcon(png)).gradient;
    } catch {
      tint = null;
    }
    prev.set(t.key, {
      favicon: 'icons/' + t.key + '.png?v=' + sha(png).slice(0, 8),
      glyph: glyph ? 'icons/' + t.key + '.glyph.png?v=' + sha(glyph).slice(0, 8) : null,
      tint,
      status: 'found',
      checkedAt: null,
      hash: sha(png)
    });
  }
  return prev;
};

const main = async () => {
  const linksText = await fs.readFile(linksPath, 'utf8');
  let catalog;
  try {
    catalog = JSON.parse(linksText);
    if (!catalog || !Array.isArray(catalog.categories)) throw new Error('missing categories');
  } catch (e) {
    console.error('links.json is invalid: ' + errText(e));
    process.exit(1);
  }
  const overrides = await readOverrides();
  const catalogTargets = buildTargets(catalog);
  const taken = new Set(catalogTargets.map((t) => t.key));
  const extras = (await readExtras()).filter((t) => !taken.has(t.key));
  const targets = catalogTargets.concat(extras);
  const validKeys = new Set(targets.map((t) => t.key));

  await fs.mkdir(iconsDir, { recursive: true });
  const previous = await readPrevious(targets);
  const results = await pool(targets, fromDir ? 8 : 6, (t) => processTarget(t, overrides));
  const now = new Date().toISOString();

  const entries = {};
  const analyses = new Map();
  for (let i = 0; i < targets.length; i++) {
    const r = results[i];
    const prev = previous.get(r.key) || null;
    if (r.png) {
      const hash = sha(r.png);
      r.hash = hash;
      await fs.writeFile(path.join(iconsDir, r.key + '.png'), r.png);
      let analysis = { gradient: null, glyph: null };
      try {
        analysis = await analyzeIcon(r.png);
      } catch (e) {
        r.analysisError = errText(e);
      }
      r.gradient = analysis.gradient;
      r.glyph = analysis.glyph;
      let glyphPath = null;
      const glyphFile = path.join(iconsDir, r.key + '.glyph.png');
      if (analysis.glyph) {
        await fs.writeFile(glyphFile, analysis.glyph);
        glyphPath = 'icons/' + r.key + '.glyph.png?v=' + sha(analysis.glyph).slice(0, 8);
      } else if (!fromDir) {
        await fs.rm(glyphFile, { force: true });
      }
      entries[r.key] = {
        favicon: 'icons/' + r.key + '.png?v=' + hash.slice(0, 8),
        glyph: glyphPath,
        tint: analysis.gradient,
        status: r.status,
        checkedAt: now,
        hash
      };
    } else if (r.fa) {
      entries[r.key] = { favicon: null, glyph: null, tint: null, status: 'override', checkedAt: now, hash: null };
    } else if (prev) {
      entries[r.key] = {
        favicon: prev.favicon || null,
        glyph: prev.glyph || null,
        tint: prev.tint || null,
        status: r.status === 'blocked' ? 'blocked' : 'stale',
        checkedAt: now,
        hash: prev.hash || null
      };
    } else if (r.status === 'blocked') {
      entries[r.key] = { favicon: null, glyph: null, tint: null, status: 'blocked', checkedAt: now, hash: null };
    }
  }

  const adjusted = separateTints(entries, targets);

  const probes = [];
  for (let i = 0; i < targets.length; i++) {
    const e = entries[targets[i].key];
    if (!e || !e.favicon || e.status === 'override') continue;
    const file = path.join(root, stripQuery(e.glyph || e.favicon));
    let hash64 = null;
    try {
      hash64 = await dHash(file, !!e.glyph);
    } catch {
      hash64 = null;
    }
    probes.push({ key: targets[i].key, appId: targets[i].appId, hash64, lab: e.tint && e.tint[0] ? hexToLab(e.tint[0]) : null });
  }
  const { flagged, palette } = detectDefaults(probes);
  for (const [k, why] of flagged) {
    entries[k].status = 'default';
    analyses.set(k, why);
  }

  if (!fromDir) {
    for (const name of await fs.readdir(iconsDir)) {
      if (!name.endsWith('.png')) continue;
      const key = name.replace(/\.glyph\.png$/, '').replace(/\.png$/, '');
      if (!validKeys.has(key)) await fs.rm(path.join(iconsDir, name));
    }
  }

  const sorted = {};
  for (const k of Object.keys(entries).sort()) sorted[k] = entries[k];
  await fs.writeFile(manifestPath, JSON.stringify({ version: 1, generatedAt: now, icons: sorted }, null, 2) + '\n');

  const count = (s) => results.filter((r) => (entries[r.key] ? entries[r.key].status : r.status) === s).length;
  const report = {
    generatedAt: now,
    thresholds: { dHashMaxHamming: DHASH_MAX, deltaEOklabMax: DELTA_E_MAX, minOtherApps: MIN_OTHER_APPS, minTintSeparation: MIN_TINT_SEP },
    summary: {
      total: targets.length,
      found: count('found'),
      override: count('override'),
      stale: count('stale'),
      blocked: count('blocked'),
      default: count('default'),
      notfound: results.filter((r) => !entries[r.key]).length
    },
    defaults: [...flagged.keys()],
    similarPalette: [...palette.keys()],
    adjusted,
    items: results.map((r) => ({
      key: r.key,
      url: r.url,
      status: entries[r.key] ? entries[r.key].status : 'notfound',
      harvest: r.status,
      source: r.source,
      error: r.error,
      tint: entries[r.key] ? entries[r.key].tint : null,
      glyph: !!(entries[r.key] && entries[r.key].glyph),
      why: analyses.get(r.key) || null
    }))
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

  for (const item of report.items) {
    const how = item.source ? item.source.type + ' ' + item.source.href : '-';
    console.log(item.status.padEnd(9) + item.key.padEnd(30) + how + (item.why ? '  ' + item.why.join(',') : '') + (item.error ? '  ' + item.error : ''));
  }
  console.log('');
  console.log(JSON.stringify(report.summary));
};

main().catch((e) => {
  console.error(errText(e));
  process.exit(1);
});

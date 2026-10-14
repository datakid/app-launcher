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
const indexPath = path.join(root, 'index.html');
const iconsDir = path.join(root, 'icons');
const overridesPath = path.join(here, 'icon-overrides.json');
const reportPath = path.join(here, 'icon-report.json');

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

const parseExtras = (html) => {
  const block = /const extraEntries = \[([\s\S]*?)\n\];/.exec(html);
  if (!block) return [];
  const out = [];
  for (const m of block[1].matchAll(/app:\s*\{\s*id:\s*'([a-z0-9-]+)'[\s\S]*?url:\s*'(https?:[^']+)'/g)) {
    out.push({ key: m[1], appId: m[1], variantId: null, url: m[2], extra: true });
  }
  return out;
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
  const result = { key: t.key, url: t.url, status: 'notfound', source: null, error: null, png: null };
  if (!KEY_RE.test(t.key)) {
    result.error = 'key is not safe for a file name';
    return result;
  }
  try {
    if (overrides[t.key]) {
      const file = path.resolve(root, overrides[t.key]);
      if (!file.startsWith(root + path.sep)) throw new Error('override path leaves the repo');
      await finishFrom(await fs.readFile(file), { type: 'override', href: overrides[t.key] }, result);
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
    html = await res.text();
  } catch (e) {
    errors.push('page: ' + errText(e));
  }
  for (const group of candidateGroups(readLinks(html), base, errors)) {
    for (const c of await group()) {
      try {
        const buf = await loadHref(c.href);
        if (!buf || !buf.length) throw new Error('empty');
        const ext = sniff(buf);
        if (!ext) throw new Error('not an image');
        const { png, srcWidth } = await normalize(buf, ext);
        const bad = await gate(png, srcWidth);
        result.source = { type: c.type, href: short(c.href) };
        if (bad) {
          result.error = bad;
          return result;
        }
        result.png = png;
        result.status = 'found';
        return result;
      } catch (e) {
        errors.push(c.type + ': ' + errText(e));
      }
    }
  }
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

const STRIP_RE = /, "favicon": "[^"]*"/;
const stripFavicons = (text) => text.split('\n').map((l) => l.replace(STRIP_RE, '')).join('\n');

const patchLinks = (text, catalog, favicons) => {
  const lines = stripFavicons(text).split('\n');
  const addTo = (idx, value) => {
    if (!/ \}(,?)$/.test(lines[idx])) throw new Error('unexpected links.json line shape at ' + (idx + 1));
    lines[idx] = lines[idx].replace(/ \}(,?)$/, ', "favicon": "' + value + '" }$1');
  };
  let cursor = 0;
  for (const cat of catalog.categories) {
    if (!cat || cat.id === 'mine') continue;
    for (const app of Array.isArray(cat.apps) ? cat.apps : []) {
      if (!app || typeof app.id !== 'string' || app.id.startsWith('u-')) continue;
      const appIdx = lines.findIndex((l, i) => i >= cursor && l.includes('"id": "' + app.id + '", "title"'));
      if (appIdx < 0) throw new Error('could not locate app ' + app.id + ' in links.json');
      cursor = appIdx;
      if (Array.isArray(app.variants) && app.variants.length) {
        for (const v of app.variants) {
          const vIdx = lines.findIndex((l, i) => i > appIdx && l.includes('{ "id": "' + v.id + '", "label"'));
          if (vIdx < 0) throw new Error('could not locate variant ' + app.id + '/' + v.id + ' in links.json');
          const value = favicons.get(app.id + '--' + v.id);
          if (value) addTo(vIdx, value);
          cursor = vIdx;
        }
      } else {
        const value = favicons.get(app.id);
        if (value) addTo(appIdx, value);
      }
    }
  }
  return lines.join('\n');
};

const syncBaked = async (linksText) => {
  const html = await fs.readFile(indexPath, 'utf8');
  const open = /<script type="application\/json" id="lx-data">/.exec(html);
  if (!open) throw new Error('lx-data block not found in index.html');
  const start = open.index + open[0].length;
  const end = html.indexOf('</script>', start);
  if (end < 0) throw new Error('lx-data block is not closed');
  const next = html.slice(0, start) + '\n' + linksText + html.slice(end);
  if (next !== html) await fs.writeFile(indexPath, next);
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
  const indexHtml = await fs.readFile(indexPath, 'utf8');
  const overrides = await readOverrides();
  const catalogTargets = buildTargets(catalog);
  const taken = new Set(catalogTargets.map((t) => t.key));
  const extras = parseExtras(indexHtml).filter((t) => !taken.has(t.key));
  const targets = catalogTargets.concat(extras);

  await fs.mkdir(iconsDir, { recursive: true });
  const results = await pool(targets, fromDir ? 8 : 6, (t) => processTarget(t, overrides));

  const favicons = new Map();
  const written = new Set();
  for (let i = 0; i < targets.length; i++) {
    const r = results[i];
    if (!r.png) continue;
    const hash = sha(r.png);
    r.hash = hash;
    await fs.writeFile(path.join(iconsDir, r.key + '.png'), r.png);
    written.add(r.key + '.png');
    if (!targets[i].extra) favicons.set(r.key, 'icons/' + r.key + '.png?v=' + hash.slice(0, 8));
  }

  const byHash = new Map();
  results.forEach((r, i) => {
    if (!r.hash) return;
    if (!byHash.has(r.hash)) byHash.set(r.hash, []);
    byHash.get(r.hash).push({ key: r.key, appId: targets[i].appId });
  });
  const suspectedDefault = [];
  for (const group of byHash.values()) {
    if (new Set(group.map((g) => g.appId)).size > 1) suspectedDefault.push(group.map((g) => g.key));
  }

  for (const name of await fs.readdir(iconsDir)) {
    if (name.endsWith('.png') && !written.has(name)) await fs.rm(path.join(iconsDir, name));
  }

  const nextLinks = patchLinks(linksText, catalog, favicons);
  if (stripFavicons(nextLinks) !== stripFavicons(linksText)) throw new Error('links.json patch changed more than favicon fields');
  const parsedNext = JSON.parse(nextLinks);
  if (!parsedNext || !Array.isArray(parsedNext.categories)) throw new Error('patched links.json is invalid');
  if (nextLinks !== linksText) await fs.writeFile(linksPath, nextLinks);
  await syncBaked(nextLinks);

  const report = {
    summary: {
      total: targets.length,
      found: results.filter((r) => r.status === 'found').length,
      override: results.filter((r) => r.status === 'override').length,
      notfound: results.filter((r) => r.status === 'notfound').length
    },
    suspectedDefault,
    items: results.map((r) => ({ key: r.key, url: r.url, status: r.status, source: r.source, error: r.error }))
  };
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');

  for (const r of results) {
    const how = r.source ? r.source.type + ' ' + r.source.href : '-';
    console.log(r.status.padEnd(9) + r.key.padEnd(30) + how + (r.error ? '  ' + r.error : ''));
  }
  console.log('');
  console.log(report.summary.found + report.summary.override + ' of ' + report.summary.total + ' icons written, ' + report.summary.notfound + ' not found, ' + suspectedDefault.length + ' suspected default group(s)');
};

main().catch((e) => {
  console.error(errText(e));
  process.exit(1);
});

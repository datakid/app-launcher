import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import potrace from 'potrace';
import { optimize } from 'svgo';
import { Resvg } from '@resvg/resvg-js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ICONS = path.join(root, 'icons');
const PREFERRED_SYMBOL_BYTES = 1536;
const MAX_SYMBOL_BYTES = 5120;
const MIN_IOU = 0.95;
const MIN_SOFT_IOU = 0.92;
const MAX_TONE_GAP = 0.035;
const MIN_LAYERED_SOFT_IOU = 0.93;
const ATLAS_MAX_BYTES = 153600;
const TRACE = { turdSize: 2, alphaMax: 1, optCurve: true, optTolerance: 0.2, threshold: 128, blackOnWhite: true };

const hash8 = (buf) => crypto.createHash('sha256').update(buf).digest('hex').slice(0, 8);
const canonical = (v) => {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
};
const stripQuery = (p) => p.replace(/\?.*$/, '');

const readMaxIconPx = async () => {
  try {
    const text = await fs.readFile(path.join(root, 'perf', 'BASELINE.md'), 'utf8');
    const m = /MAX_ICON_PX`: (\d+(?:\.\d+)?)/.exec(text);
    if (m) return Number(m[1]);
  } catch (e) {}
  return 64;
};

const traceAsync = (buf) => new Promise((resolve, reject) => {
  potrace.trace(buf, TRACE, (err, svg) => (err ? reject(err) : resolve(svg)));
});

const scalePath = (d, factor) => d.replace(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi, (n) => {
  const v = Math.round(Number(n) * factor * 1000) / 1000;
  return String(v);
});

const alphaMask = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const alpha = Buffer.alloc(info.width * info.height);
  for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
  const mask = new Uint8Array(alpha.length);
  for (let i = 0; i < mask.length; i++) mask[i] = alpha[i] >= 128 ? 1 : 0;
  return { mask, alpha, width: info.width, height: info.height };
};

const maskPng = async (m, up, threshold) => {
  let width = m.width;
  let height = m.height;
  let src = m.alpha;
  if (up > 1) {
    width = m.width * up;
    height = m.height * up;
    const out = await sharp(m.alpha, { raw: { width: m.width, height: m.height, channels: 1 } }).resize(width, height, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
    const ch = out.info.channels;
    src = Buffer.alloc(width * height);
    for (let i = 0; i < src.length; i++) src[i] = out.data[i * ch];
  }
  const raw = Buffer.alloc(width * height);
  for (let i = 0; i < raw.length; i++) raw[i] = src[i] >= threshold ? 0 : 255;
  return { png: await sharp(raw, { raw: { width, height, channels: 1 } }).png().toBuffer(), width };
};

const traceGlyph = async (m, precision, up, threshold = 128) => {
  const { png, width } = await maskPng(m, up, threshold);
  const svg = await traceAsync(png);
  const paths = [...svg.matchAll(/ d="([^"]+)"/g)].map((x) => x[1]);
  if (!paths.length) return null;
  const factor = 24 / width;
  const joined = paths.map((d) => scalePath(d, factor)).join(' ');
  const wrapped = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill-rule="evenodd" d="${joined}"/></svg>`;
  const opt = optimize(wrapped, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertPathData: { floatPrecision: precision } } } }]
  });
  const d = /\sd="([^"]+)"/.exec(opt.data)?.[1];
  return d ? { d } : null;
};

const iou = (renderedAlpha, mask) => {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < mask.length; i++) {
    const a = renderedAlpha[i] >= 128 ? 1 : 0;
    const b = mask[i];
    if (a & b) inter++;
    if (a | b) union++;
  }
  return union ? inter / union : 1;
};

const rasterAlpha = (d, size) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}"><path fill="#000" fill-rule="evenodd" d="${d}"/></svg>`;
  const px = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().pixels;
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3];
  return out;
};

const softIou = (renderedAlpha, alpha) => {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < alpha.length; i++) {
    inter += Math.min(renderedAlpha[i], alpha[i]);
    union += Math.max(renderedAlpha[i], alpha[i]);
  }
  return union ? inter / union : 1;
};

const rasterLayers = (layers, size) => {
  const body = layers.map((l) => `<path fill="#000"${l.opacity < 1 ? ` fill-opacity="${l.opacity}"` : ''} fill-rule="evenodd" d="${l.d}"/>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">${body}</svg>`;
  const px = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().pixels;
  const out = new Uint8Array(size * size);
  for (let i = 0; i < out.length; i++) out[i] = px[i * 4 + 3];
  return out;
};

const detectMidLevel = (alpha, width, height) => {
  const bins = new Array(26).fill(0);
  let flat = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const a = alpha[y * width + x];
      if (a < 20 || a > 225) continue;
      let same = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (dx || dy) { if (Math.abs(alpha[(y + dy) * width + x + dx] - a) <= 10) same++; }
      }
      if (same >= 6) { bins[Math.floor(a / 10)]++; flat++; }
    }
  }
  if (flat < 40) return null;
  let best = 0;
  for (let i = 1; i < bins.length; i++) if (bins[i] + (bins[i - 1] || 0) > bins[best] + (bins[best - 1] || 0)) best = i;
  return Math.round((Math.min(225, best * 10 + 5) / 255) * 100) / 100;
};

const symbolLayersMarkup = (key, layers) => `<symbol id="g-${key}" viewBox="0 0 24 24">${layers.map((l) => `<path${l.opacity < 1 ? ` fill-opacity="${l.opacity}"` : ''} fill-rule="evenodd" d="${l.d}"/>`).join('')}</symbol>`;

const symbolMarkup = (key, d) => `<symbol id="g-${key}" viewBox="0 0 24 24"><path fill-rule="evenodd" d="${d}"/></symbol>`;

const readFaNames = async () => {
  const html = await fs.readFile(path.join(root, 'src', 'index.html'), 'utf8');
  const present = new Set([...html.matchAll(/<symbol id="(fa-[a-z0-9-]+)"/g)].map((m) => m[1]));
  const links = JSON.parse(await fs.readFile(path.join(root, 'links.json'), 'utf8'));
  const names = new Set(['fa-circle']);
  const walk = (o) => {
    if (Array.isArray(o)) o.forEach(walk);
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) {
      if (k === 'icon' && typeof v === 'string' && /^fa-[a-z0-9-]+$/.test(v)) names.add(v);
      else walk(v);
    }
  };
  walk(links);
  return [...names].filter((n) => !present.has(n)).sort();
};

const faSymbol = async (name) => {
  const file = path.join(root, 'node_modules', '@fortawesome', 'fontawesome-free', 'svgs', 'solid', `${name.slice(3)}.svg`);
  const svg = await fs.readFile(file, 'utf8');
  const vb = /viewBox="([^"]+)"/.exec(svg)?.[1];
  const ds = [...svg.matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  if (!vb || !ds.length) throw new Error(`bad FA svg ${name}`);
  return `<symbol id="${name}" viewBox="${vb}">${ds.map((d) => `<path fill="currentColor" d="${d}"/>`).join('')}</symbol>`;
};

const packAtlas = async (items, cell) => {
  const count = items.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const width = cols * cell;
  const height = rows * cell;
  const composites = [];
  const pos = {};
  items.forEach((it, i) => {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    pos[it.key] = { x, y };
    composites.push({ input: it.buf, left: x, top: y });
  });
  const base = sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(composites).png();
  const png = await base.toBuffer();
  return { png, pos, width, height };
};

const encodeMask = async (png) => ({ buf: await sharp(png).webp({ quality: 75, alphaQuality: 70, effort: 6 }).toBuffer(), mode: 'lossy-alpha-q70', fits: true });

const encodeAtlas = async (png) => {
  let buf = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
  let mode = 'lossless';
  if (buf.length > ATLAS_MAX_BYTES) {
    for (let q = 90; q >= 75; q -= 5) {
      buf = await sharp(png).webp({ quality: q, effort: 6, alphaQuality: 100 }).toBuffer();
      mode = `lossy-q${q}`;
      if (buf.length <= ATLAS_MAX_BYTES) break;
    }
  }
  return { buf, mode, fits: buf.length <= ATLAS_MAX_BYTES };
};

const cleanOld = async (keep) => {
  for (const f of await fs.readdir(ICONS)) {
    if (/^(atlas|glyph-atlas|glyphs)\.[0-9a-f]{8}\.(webp|svg)$/.test(f) && !keep.has(f)) await fs.unlink(path.join(ICONS, f));
  }
};

const main = async () => {
  const v1 = JSON.parse(await fs.readFile(path.join(ICONS, 'manifest.json'), 'utf8'));
  const config = JSON.parse(await fs.readFile(path.join(root, 'tools', 'icons-v2.config.json'), 'utf8').catch(() => '{}'));
  const forceImage = new Set(config.forceImage || []);
  const maxIconPx = await readMaxIconPx();
  const CELL = Math.min(128, Math.ceil((maxIconPx * 2) / 16) * 16);
  const keys = Object.keys(v1.icons).sort();
  const report = { cell: CELL, glyphs: { accepted: 0, rejected: [] }, atlas: null, sprite: null };

  const symbols = [];
  const rejected = [];
  const glyphEntry = {};
  for (const key of keys) {
    const e = v1.icons[key];
    if (!e.glyph) { glyphEntry[key] = null; continue; }
    const file = path.join(ICONS, `${key}.glyph.png`);
    let ok = false;
    let why = 'no path';
    if (forceImage.has(key)) { rejected.push(key); report.glyphs.rejected.push({ key, why: 'pinned to image in tools/icons-v2.config.json' }); continue; }
    const m = await alphaMask(file);
    const singles = [];
    const attempts = [[1, 1], [2, 1], [1, 4], [2, 4]];
    for (const [precision, up] of attempts) {
      const traced = await traceGlyph(m, precision, up);
      if (!traced) continue;
      const sym = symbolMarkup(key, traced.d);
      const bytes = Buffer.byteLength(sym);
      const rendered = rasterAlpha(traced.d, m.width);
      const score = iou(rendered, m.mask);
      const soft = softIou(rendered, m.alpha);
      why = `precision=${precision} upscale=${up} bytes=${bytes} iou=${score.toFixed(4)} softIou=${soft.toFixed(4)}`;
      if (process.env.ICONS_DEBUG) console.log(key, why);
      if (score >= MIN_IOU && bytes <= MAX_SYMBOL_BYTES) singles.push({ sym, bytes, note: why, soft, gap: score - soft });
    }
    let pick = singles.filter((c) => c.soft >= MIN_SOFT_IOU && c.gap <= MAX_TONE_GAP).sort((x, y) => x.bytes - y.bytes)[0] || null;
    if (!pick) {
      const mid = detectMidLevel(m.alpha, m.width, m.height);
      if (mid !== null) {
        const lowT = Math.max(8, Math.round(mid * 255 * 0.5));
        const highT = Math.round((mid * 255 + 255) / 2);
        const layered = [];
        for (const [precision, up] of attempts) {
          const low = await traceGlyph(m, precision, up, lowT);
          const high = await traceGlyph(m, precision, up, highT);
          if (!low || !high) continue;
          const layers = [{ d: low.d, opacity: mid }, { d: high.d, opacity: 1 }];
          const sym = symbolLayersMarkup(key, layers);
          const bytes = Buffer.byteLength(sym);
          const score = softIou(rasterLayers(layers, m.width), m.alpha);
          why = `layered mid=${mid} precision=${precision} upscale=${up} bytes=${bytes} softIou=${score.toFixed(4)}`;
          if (process.env.ICONS_DEBUG) console.log(key, why);
          if (score >= MIN_LAYERED_SOFT_IOU && bytes <= MAX_SYMBOL_BYTES) layered.push({ sym, bytes, note: why, layered: true, soft: score });
        }
        pick = layered.sort((x, y) => y.soft - x.soft || x.bytes - y.bytes)[0] || null;
      }
    }
    if (pick) {
      symbols.push(pick.sym);
      glyphEntry[key] = { symbol: `g-${key}` };
      report.glyphs.accepted++;
      ok = true;
      if (pick.bytes > PREFERRED_SYMBOL_BYTES) (report.glyphs.overPreferred ||= []).push({ key, note: pick.note });
      if (pick.layered) (report.glyphs.layered ||= []).push({ key, note: pick.note });
    }
    if (!ok) { rejected.push(key); report.glyphs.rejected.push({ key, why }); }
  }

  const faNames = await readFaNames();
  const faSymbols = [];
  for (const n of faNames) faSymbols.push(await faSymbol(n));

  const spriteText = `<svg xmlns="http://www.w3.org/2000/svg">${symbols.join('')}${faSymbols.join('')}</svg>`;
  const spriteBuf = Buffer.from(spriteText);
  const spriteName = `glyphs.${hash8(spriteBuf)}.svg`;
  const gz = (await import('node:zlib')).gzipSync(spriteBuf).length;
  report.sprite = { file: spriteName, bytes: spriteBuf.length, gzipBytes: gz, symbols: symbols.length, faSymbols: faSymbols.length, faNames };

  const favItems = [];
  for (const key of keys) {
    const e = v1.icons[key];
    if (!e.favicon) continue;
    const buf = await sharp(path.join(ICONS, `${key}.png`)).resize(CELL, CELL, { kernel: 'lanczos3', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
    favItems.push({ key, buf });
  }
  const fav = await packAtlas(favItems, CELL);
  const favEnc = await encodeAtlas(fav.png);
  const atlasName = `atlas.${hash8(favEnc.buf)}.webp`;
  report.atlas = { file: atlasName, bytes: favEnc.buf.length, mode: favEnc.mode, fits: favEnc.fits, width: fav.width, height: fav.height, count: favItems.length };

  let glyphAtlas = null;
  let gaEnc = null;
  let gaPack = null;
  if (rejected.length) {
    const items = [];
    for (const key of rejected) {
      const buf = await sharp(path.join(ICONS, `${key}.glyph.png`)).resize(CELL, CELL, { kernel: 'lanczos3', fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).ensureAlpha().png().toBuffer();
      items.push({ key, buf });
    }
    gaPack = await packAtlas(items, CELL);
    gaEnc = await encodeMask(gaPack.png);
    const name = `glyph-atlas.${hash8(gaEnc.buf)}.webp`;
    glyphAtlas = { file: `icons/${name}`, width: gaPack.width, height: gaPack.height, cell: CELL };
    for (const key of rejected) glyphEntry[key] = { atlas: gaPack.pos[key] };
  }

  const icons = {};
  for (const key of keys) {
    const e = v1.icons[key];
    const out = { favicon: fav.pos[key] || null, glyph: glyphEntry[key] ?? null, tint: e.tint ?? null };
    if (e.sourceTint) out.sourceTint = e.sourceTint;
    out.shape = 'default';
    out.status = e.status;
    out.checkedAt = e.checkedAt;
    out.hash = e.hash;
    icons[key] = out;
  }

  const manifest = {
    version: 2,
    generatedAt: new Date().toISOString(),
    hash: hash8(Buffer.from(canonical(icons))),
    atlas: { file: `icons/${atlasName}`, width: fav.width, height: fav.height, cell: CELL },
    glyphAtlas,
    glyphSprite: { file: `icons/${spriteName}` },
    icons
  };

  const keep = new Set([spriteName, atlasName]);
  if (glyphAtlas) keep.add(path.basename(glyphAtlas.file));
  await cleanOld(keep);
  await fs.writeFile(path.join(ICONS, spriteName), spriteBuf);
  await fs.writeFile(path.join(ICONS, atlasName), favEnc.buf);
  if (glyphAtlas) await fs.writeFile(path.join(root, glyphAtlas.file), gaEnc.buf);
  await fs.writeFile(path.join(ICONS, 'manifest.v2.json'), JSON.stringify(manifest, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'perf', 'out', 'icons-v2-report.json'), JSON.stringify(report, null, 2) + '\n').catch(() => {});
  console.log(JSON.stringify(report, null, 2));
};

main().catch((e) => { console.error(e); process.exit(1); });

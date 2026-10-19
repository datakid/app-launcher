import { gzipSync, zipSync } from 'fflate';
import { sha256, canonicalJson, utf8 } from './runtime.js';
import { packAtlas, encodeAtlas, ATLAS_LIMIT, DEFAULT_CELL } from './atlas.js';
import { symbolMarkup, SYMBOL_MAX_BYTES } from './glyph.js';
import { resizeTo } from './pixels.js';
import { encodePng, resizeStretch } from './codecs.js';
import { encodeImage, EXTENSIONS } from './encode.js';
import { passesContrast } from './color.js';

export const SPRITE_GZIP_LIMIT = 40960;
export const MANIFEST_VERSION = 2;
export const SHAPES = ['default', 'squircle', 'circle', 'rounded', 'hexagon'];

export const LAUNCHER_PROFILE = Object.freeze({
  id: 'launcher',
  locked: true,
  cell: DEFAULT_CELL,
  atlasLimit: ATLAS_LIMIT,
  symbolLimit: SYMBOL_MAX_BYTES,
  spriteGzipLimit: SPRITE_GZIP_LIMIT,
  prefix: 'icons/'
});

export const hash8 = async (bytes) => (await sha256(bytes)).slice(0, 8);

const sortedValue = (v) => {
  if (Array.isArray(v)) return v.map(sortedValue);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortedValue(v[k]);
    return out;
  }
  return v;
};

export const stableStringify = (value) => JSON.stringify(sortedValue(value), null, 2) + '\n';

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export const buildSprite = (records) => {
  const symbols = records
    .filter((r) => r.trace && r.trace.accepted)
    .sort(byKey)
    .map((r) => symbolMarkup(r.key, r.trace.d));
  return '<svg xmlns="http://www.w3.org/2000/svg">' + symbols.join('') + '</svg>';
};

export const evaluateGate = ({ sprite, symbolSizes, atlas, glyphAtlas, records }) => {
  const failures = [];
  const spriteGzip = gzipSync(utf8(sprite), { level: 9 }).length;
  if (spriteGzip > SPRITE_GZIP_LIMIT) failures.push({ code: 'sprite-gzip', message: 'glyph sprite is ' + spriteGzip + ' bytes gzipped, limit ' + SPRITE_GZIP_LIMIT, value: spriteGzip });
  for (const [key, size] of symbolSizes) if (size > SYMBOL_MAX_BYTES) failures.push({ code: 'symbol-size', key, message: 'symbol ' + key + ' is ' + size + ' bytes, limit ' + SYMBOL_MAX_BYTES, value: size });
  if (atlas && atlas.bytes.length > ATLAS_LIMIT) failures.push({ code: 'atlas-size', message: 'atlas is ' + atlas.bytes.length + ' bytes, limit ' + ATLAS_LIMIT, value: atlas.bytes.length });
  if (glyphAtlas && glyphAtlas.bytes.length > ATLAS_LIMIT) failures.push({ code: 'glyph-atlas-size', message: 'glyph atlas is ' + glyphAtlas.bytes.length + ' bytes, limit ' + ATLAS_LIMIT, value: glyphAtlas.bytes.length });
  for (const r of records) {
    if (r.tint && !passesContrast(r.tint)) failures.push({ code: 'contrast', key: r.key, message: r.key + ' tint fails the 3:1 contrast guardrail', value: r.tint[0] });
  }
  return { ok: failures.length === 0, failures, spriteGzip };
};

export const buildLauncherExport = async (records, { cell = DEFAULT_CELL, generatedAt, prefix = LAUNCHER_PROFILE.prefix, seed = null, shapes = {} } = {}) => {
  const withImage = records.filter((r) => r.image);
  const rejected = records.filter((r) => !(r.trace && r.trace.accepted) && r.glyphImage);
  const atlasPack = await packAtlas(withImage.map((r) => ({ key: r.key, image: r.image })), cell);
  const atlasEnc = withImage.length ? await encodeAtlas(atlasPack.image) : null;
  const glyphPack = rejected.length ? await packAtlas(rejected.map((r) => ({ key: r.key, image: r.glyphImage })), cell) : null;
  const glyphEnc = glyphPack ? await encodeAtlas(glyphPack.image) : null;
  const sprite = buildSprite(records);
  const spriteBytes = utf8(sprite);
  const spriteHash = await hash8(spriteBytes);
  const atlasHash = atlasEnc ? await hash8(atlasEnc.bytes) : null;
  const glyphHash = glyphEnc ? await hash8(glyphEnc.bytes) : null;

  const icons = {};
  const symbolSizes = new Map();
  for (const r of [...records].sort(byKey)) {
    const accepted = r.trace && r.trace.accepted;
    if (accepted) symbolSizes.set(r.key, utf8(symbolMarkup(r.key, r.trace.d)).length);
    const glyph = accepted ? { symbol: 'g-' + r.key } : r.glyphImage && glyphPack ? { atlas: glyphPack.positions.get(r.key) } : null;
    const tint = r.tint || null;
    const entry = {
      favicon: r.image ? atlasPack.positions.get(r.key) : null,
      glyph,
      tint,
      shape: shapes[r.key] || r.shape || 'default',
      status: r.status,
      checkedAt: r.checkedAt,
      hash: r.hash || null,
      palette: r.palette || null,
      seed: tint && r.seed ? r.seed : null,
      locked: !!r.locked
    };
    if (Array.isArray(r.sourceTint) && tint && r.sourceTint.join() !== tint.join()) entry.sourceTint = r.sourceTint;
    icons[r.key] = entry;
  }

  const manifest = {
    version: MANIFEST_VERSION,
    generatedAt,
    hash: await hash8(utf8(canonicalJson(Object.fromEntries(Object.entries(icons).map(([k, v]) => [k, { ...v, checkedAt: undefined }]))))),
    atlas: atlasEnc ? { file: prefix + 'atlas.' + atlasHash + '.webp', width: atlasPack.width, height: atlasPack.height, cell } : null,
    glyphAtlas: glyphEnc ? { file: prefix + 'glyph-atlas.' + glyphHash + '.webp', width: glyphPack.width, height: glyphPack.height, cell } : null,
    glyphSprite: { file: prefix + 'glyphs.' + spriteHash + '.svg' },
    icons
  };

  const gate = evaluateGate({ sprite, symbolSizes, atlas: atlasEnc, glyphAtlas: glyphEnc, records });
  const files = {};
  files['glyphs.' + spriteHash + '.svg'] = spriteBytes;
  if (atlasEnc) files['atlas.' + atlasHash + '.webp'] = atlasEnc.bytes;
  if (glyphEnc) files['glyph-atlas.' + glyphHash + '.webp'] = glyphEnc.bytes;
  files['manifest.v2.json'] = utf8(stableStringify(manifest));
  const stats = {
    cell,
    count: withImage.length,
    symbols: symbolSizes.size,
    rejectedGlyphs: rejected.length,
    spriteBytes: spriteBytes.length,
    spriteGzip: gate.spriteGzip,
    atlasBytes: atlasEnc ? atlasEnc.bytes.length : 0,
    atlasMode: atlasEnc ? atlasEnc.mode : null,
    glyphAtlasBytes: glyphEnc ? glyphEnc.bytes.length : 0,
    glyphAtlasMode: glyphEnc ? glyphEnc.mode : null
  };
  return { files, manifest, gate, stats, replaces: /^(glyphs|atlas|glyph-atlas)\.[0-9a-f]{8}\.(svg|webp)$/ };
};

export const buildLegacyExport = async (records, { generatedAt, prefix = 'icons/' } = {}) => {
  const files = {};
  const icons = {};
  for (const r of [...records].sort(byKey)) {
    let favicon = null;
    let glyph = null;
    if (r.image) {
      const png = await encodePng(r.image);
      files[r.key + '.png'] = png;
      favicon = prefix + r.key + '.png?v=' + (await hash8(png));
    }
    if (r.glyphImage) {
      const png = await encodePng(r.glyphImage);
      files[r.key + '.glyph.png'] = png;
      glyph = prefix + r.key + '.glyph.png?v=' + (await hash8(png));
    }
    const entry = { favicon, glyph, tint: r.tint || null, status: r.status, checkedAt: r.checkedAt, hash: r.hash || null };
    if (Array.isArray(r.sourceTint) && r.tint && r.sourceTint.join() !== r.tint.join()) entry.sourceTint = r.sourceTint;
    icons[r.key] = entry;
  }
  files['manifest.json'] = utf8(stableStringify({ version: 1, generatedAt, icons }));
  return { files, manifest: { version: 1, generatedAt, icons }, gate: { ok: true, failures: [], spriteGzip: 0 }, stats: { count: Object.keys(icons).length } };
};

export const buildCustomExport = async (records, { formats = ['png'], sizes = [192], quality = 90, lossless = false, names = (r, size, ext) => r.key + '-' + size + '.' + ext, extraFiles = {} } = {}) => {
  const entries = {};
  const manifest = {};
  for (const r of [...records].sort(byKey)) {
    if (!r.image) continue;
    manifest[r.key] = { files: [], tint: r.tint || null, status: r.status };
    for (const size of sizes) {
      const frame = size === r.image.width ? r.image : await resizeStretch(r.image, size, size);
      for (const format of formats) {
        const bytes = await encodeImage(frame, { format: format === 'ico' ? 'ico' : format, quality, lossless });
        const name = names(r, size, EXTENSIONS[format]);
        entries[name] = bytes;
        manifest[r.key].files.push(name);
      }
    }
  }
  for (const [name, bytes] of Object.entries(extraFiles)) entries[name] = bytes;
  entries['manifest.json'] = utf8(stableStringify({ icons: manifest }));
  const ordered = {};
  for (const k of Object.keys(entries).sort()) ordered[k] = [entries[k], { level: 0, mtime: new Date(1980, 0, 1) }];
  return { files: entries, zip: zipSync(ordered) };
};

const flattenOn = (img, hex) => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const data = new Uint8ClampedArray(img.data.length);
  for (let i = 0; i < img.data.length; i += 4) {
    const a = img.data[i + 3] / 255;
    data[i] = Math.round(img.data[i] * a + r * (1 - a));
    data[i + 1] = Math.round(img.data[i + 1] * a + g * (1 - a));
    data[i + 2] = Math.round(img.data[i + 2] * a + b * (1 - a));
    data[i + 3] = 255;
  }
  return { width: img.width, height: img.height, data };
};

export const buildFaviconPack = async (record, { name = 'App', background = '#ffffff', themeColor = null, base = '/' } = {}) => {
  const source = record.original || record.image;
  const files = {};
  const sized = async (size) => resizeTo(source, size, size);
  files['favicon.ico'] = await encodeImage(await sized(48), { format: 'ico' });
  files['icon-192.png'] = await encodePng(await sized(192));
  files['icon-512.png'] = await encodePng(await sized(512));
  files['apple-touch-icon.png'] = await encodePng(flattenOn(await sized(180), background));
  files['favicon-32.png'] = await encodePng(await sized(32));
  files['site.webmanifest'] = utf8(
    stableStringify({
      name,
      short_name: name,
      icons: [
        { src: base + 'icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: base + 'icon-512.png', sizes: '512x512', type: 'image/png' }
      ],
      theme_color: themeColor || undefined,
      background_color: background,
      display: 'standalone'
    })
  );
  const head = [
    '<link rel="icon" href="' + base + 'favicon.ico" sizes="48x48">',
    '<link rel="icon" href="' + base + 'favicon-32.png" type="image/png" sizes="32x32">',
    '<link rel="icon" href="' + base + 'icon-192.png" type="image/png" sizes="192x192">',
    '<link rel="apple-touch-icon" href="' + base + 'apple-touch-icon.png">',
    '<link rel="manifest" href="' + base + 'site.webmanifest">'
  ];
  if (themeColor) head.push('<meta name="theme-color" content="' + themeColor + '">');
  files['head.html'] = utf8(head.join('\n') + '\n');
  const ordered = {};
  for (const k of Object.keys(files).sort()) ordered[k] = [files[k], { level: 0, mtime: new Date(1980, 0, 1) }];
  return { files, zip: zipSync(ordered), head: head.join('\n') };
};

export const zipFiles = (files, folder = '') => {
  const ordered = {};
  for (const k of Object.keys(files).sort()) ordered[folder + k] = [files[k], { level: 0, mtime: new Date(1980, 0, 1) }];
  return zipSync(ordered);
};

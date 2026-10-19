import { sha256, text, errText, pool, canonicalJson } from './runtime.js';
import { sniff, EXT_BY_NAME } from './decode.js';
import { normalize, gate } from './pixels.js';
import { imageToLab, extractGradient, hexToLab, isHex } from './color.js';
import { extractGlyph, traceGlyph } from './glyph.js';
import { dHash, detectDefaults, DHASH_MAX, DELTA_E_MAX, MIN_OTHER_APPS } from './dedupe.js';
import { readLinks, readBaseHref, candidateGroups, loadHref } from './discover.js';
import { applyMode, guardContrast, separateTints, MIN_TINT_SEP, DEFAULT_SEED } from './tints.js';
import { unpackAtlas, DEFAULT_CELL } from './atlas.js';
import { buildLauncherExport, buildLegacyExport, stableStringify } from './profiles.js';
import { decodeImage } from './decode.js';
import { KEY_RE, buildTargets, extrasToTargets, mergeTargets } from './targets.js';

export const BLOCK_STATUS = new Set([401, 403, 429]);
export const CHALLENGE_RE = /security checkpoint|just a moment|attention required|authentication required|vercel\.com\/sso-api|_vercel\/(jwt|sso)|cf-chl|challenge-platform|x-vercel-challenge|checking your browser/i;
export const RASTER_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg', 'avif', 'jxl'];

const short = (href) => (href && href.startsWith('data:') ? href.slice(0, 60) : href);

export const fetchRetry = async (io, url) => {
  let last;
  for (let i = 0; i < 3; i++) {
    try {
      return await io.fetchBytes(url);
    } catch (e) {
      last = e;
      if (e && e.fatal) throw e;
      if (i < 2) await (io.sleep ? io.sleep(1000) : new Promise((r) => setTimeout(r, 1000)));
    }
  }
  throw last;
};

export const pixelHash = (img) => sha256(img.data);

const finishFrom = async (bytes, source, result) => {
  const ext = sniff(bytes);
  if (!ext) throw new Error('not an image');
  const { img, srcWidth, original } = await normalize(bytes, ext);
  const bad = gate(img, srcWidth);
  if (bad) throw new Error(bad);
  result.image = img;
  result.original = original;
  result.source = source;
};

export const processTarget = async (t, ctx) => {
  const { io, overrides = {}, local = false } = ctx;
  const result = { key: t.key, url: t.url || null, status: 'notfound', source: null, error: null, image: null, fa: false };
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
      await finishFrom(await io.readOverride(ov), { type: 'override', href: ov }, result);
      result.status = 'override';
      return result;
    }
    if (t.bytes) {
      await finishFrom(t.bytes, { type: 'file', href: t.fileName || t.key }, result);
      result.status = 'found';
      return result;
    }
    if (t.iconHref && !local) {
      try {
        const bytes = await loadHref(t.iconHref, { fetchBytes: (u) => fetchRetry(io, u) });
        await finishFrom(bytes, { type: 'icon-field', href: short(t.iconHref) }, result);
        result.status = 'found';
        return result;
      } catch (e) {
        if (!t.url) {
          result.error = errText(e);
          return result;
        }
      }
    }
    if (local) {
      const found = await io.readLocal(t.key);
      if (!found) {
        result.error = 'no file for this key in the source folder';
        return result;
      }
      await finishFrom(found.bytes, { type: 'local', href: found.file }, result);
      result.status = 'found';
      return result;
    }
  } catch (e) {
    result.error = errText(e);
    return result;
  }
  if (!t.url) {
    result.error = 'no url';
    return result;
  }

  const errors = [];
  let html = '';
  let base = t.url;
  try {
    const res = await fetchRetry(io, t.url);
    base = res.url || t.url;
    if (BLOCK_STATUS.has(res.status) || res.mitigated === 'challenge') {
      result.status = 'blocked';
      result.error = 'HTTP ' + res.status + ' challenge or protection page';
      return result;
    }
    html = text(res.bytes);
  } catch (e) {
    errors.push('page: ' + errText(e));
  }
  base = readBaseHref(html, base);
  const links = readLinks(html);
  if (html && !links.length && CHALLENGE_RE.test(html)) {
    result.status = 'blocked';
    result.error = 'challenge page without icon links';
    return result;
  }
  const fetchIo = { fetchBytes: (u) => fetchRetry(io, u) };
  let lastBad = null;
  for (const group of candidateGroups(links, base, errors, fetchIo)) {
    for (const c of await group()) {
      try {
        const bytes = await loadHref(c.href, fetchIo);
        if (!bytes || !bytes.length) throw new Error('empty');
        const ext = sniff(bytes);
        if (!ext) throw new Error('not an image');
        const { img, srcWidth, original } = await normalize(bytes, ext);
        const bad = gate(img, srcWidth);
        if (bad) {
          lastBad = { bad, source: { type: c.type, href: short(c.href) } };
          errors.push(c.type + ': ' + bad);
          continue;
        }
        result.source = { type: c.type, href: short(c.href) };
        result.image = img;
        result.original = original;
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

export const analyzeIcon = async (img) => {
  const n = img.width * img.height;
  const lab = imageToLab(img.data, n);
  return { gradient: extractGradient(img.data, lab, n), glyph: await extractGlyph(img.data, lab, img.width, img.height) };
};

const baseName = (p) => p.split('/').pop().split('?')[0];

const readSymbols = (svg) => {
  const out = new Map();
  for (const m of svg.matchAll(/<symbol id="g-([a-z0-9-]+)"[^>]*><path d="([^"]*)"\/><\/symbol>/g)) out.set(m[1], m[2]);
  return out;
};

export const readPrevious = async (targets, io) => {
  const prev = new Map();
  let cell = null;
  let seed = null;
  const tryRead = async (name) => {
    try {
      return io.readOutput ? await io.readOutput(name) : null;
    } catch {
      return null;
    }
  };
  const v2 = await tryRead('manifest.v2.json');
  if (v2) {
    try {
      const manifest = JSON.parse(text(v2));
      if (manifest && manifest.icons && typeof manifest.icons === 'object') {
        cell = manifest.atlas && Number.isInteger(manifest.atlas.cell) ? manifest.atlas.cell : null;
        const c = cell || DEFAULT_CELL;
        const favPos = {};
        const glyphPos = {};
        for (const [k, v] of Object.entries(manifest.icons)) {
          if (v && v.favicon) favPos[k] = v.favicon;
          if (v && v.glyph && v.glyph.atlas) glyphPos[k] = v.glyph.atlas;
        }
        let favs = new Map();
        let glyphs = new Map();
        let symbols = new Map();
        if (manifest.atlas) {
          const b = await tryRead(baseName(manifest.atlas.file));
          if (b) favs = await unpackAtlas(b, favPos, c);
        }
        if (manifest.glyphAtlas) {
          const b = await tryRead(baseName(manifest.glyphAtlas.file));
          if (b) glyphs = await unpackAtlas(b, glyphPos, manifest.glyphAtlas.cell || c);
        }
        if (manifest.glyphSprite) {
          const b = await tryRead(baseName(manifest.glyphSprite.file));
          if (b) symbols = readSymbols(text(b));
        }
        for (const [k, v] of Object.entries(manifest.icons)) {
          if (!v || typeof v !== 'object') continue;
          if (!seed && v.seed) seed = v.seed;
          const d = symbols.get(k);
          prev.set(k, {
            image: favs.get(k) || null,
            glyphImage: glyphs.get(k) || null,
            trace: d ? { accepted: true, d, bytes: 0, iou: 1, reason: null } : null,
            tint: v.tint || null,
            sourceTint: v.sourceTint || null,
            locked: !!v.locked,
            palette: v.palette || null,
            seed: v.seed || null,
            shape: v.shape || 'default',
            status: v.status || 'found',
            hash: v.hash || null
          });
        }
      }
    } catch {
      prev.clear();
    }
  }
  const v1 = prev.size ? null : await tryRead('manifest.json');
  if (v1) {
    try {
      const manifest = JSON.parse(text(v1));
      for (const [k, v] of Object.entries((manifest && manifest.icons) || {})) {
        if (!v || typeof v !== 'object') continue;
        let image = null;
        let glyphImage = null;
        const png = await tryRead(k + '.png');
        if (png) image = (await decodeImage(png, 'png')).image;
        const gp = await tryRead(k + '.glyph.png');
        if (gp) glyphImage = (await decodeImage(gp, 'png')).image;
        prev.set(k, { image, glyphImage, trace: null, tint: v.tint || null, sourceTint: v.sourceTint || null, locked: false, palette: null, seed: null, shape: 'default', status: v.status || 'found', hash: v.hash || null });
      }
    } catch {
      prev.clear();
    }
  }
  return { prev, cell, seed };
};

export const runHarvest = async (input, options = {}, io) => {
  const profile = options.profile || 'launcher';
  const legacy = profile === 'legacy-v1';
  const now = options.now || new Date().toISOString();
  const targets = input.targets;
  const overrides = input.overrides || {};
  const validKeys = new Set(targets.map((t) => t.key));
  const progress = options.onProgress || (() => {});

  const previous = io.readOutput ? await readPrevious(targets, io) : { prev: new Map(), cell: null, seed: null };
  const cell = options.cell || previous.cell || DEFAULT_CELL;
  const cellDefaulted = !options.cell && !previous.cell;
  const seed = options.seed || previous.seed || DEFAULT_SEED;
  const local = !!options.local;

  let done = 0;
  const results = await pool(targets, options.concurrency || (local ? 8 : 6), async (t) => {
    const r = await processTarget(t, { io, overrides, local });
    progress({ phase: 'fetch', done: ++done, total: targets.length, key: t.key, status: r.status });
    return r;
  });

  const records = [];
  const byKey = new Map();
  const recordOf = (r) => {
    const rec = { key: r.key, appId: targets.find((t) => t.key === r.key).appId, status: r.status, checkedAt: now, hash: null, image: null, glyphImage: null, trace: null, tint: null, sourceTint: null, locked: false, palette: null, seed: null, shape: 'default' };
    return rec;
  };
  const traceQueue = [];
  for (const r of results) {
    const prev = previous.prev.get(r.key) || null;
    const rec = recordOf(r);
    if (r.image) {
      rec.image = r.image;
      rec.original = r.original || null;
      rec.hash = await pixelHash(r.image);
      let analysis = { gradient: null, glyph: null };
      try {
        analysis = await analyzeIcon(r.image);
      } catch (e) {
        r.analysisError = errText(e);
      }
      rec.base = analysis.gradient;
      rec.sourceTint = analysis.gradient;
      rec.tint = analysis.gradient;
      rec.glyphImage = analysis.glyph;
      if (analysis.glyph && !legacy) traceQueue.push(rec);
      if (prev && prev.locked && prev.tint) {
        rec.tint = prev.tint;
        rec.locked = true;
        rec.palette = prev.palette;
        rec.shape = prev.shape || 'default';
      } else if (prev && prev.shape) rec.shape = prev.shape;
    } else if (r.fa) {
      rec.status = 'override';
    } else if (prev) {
      rec.image = prev.image;
      rec.glyphImage = prev.glyphImage;
      rec.trace = prev.trace;
      rec.hash = prev.hash;
      rec.tint = prev.tint;
      rec.sourceTint = prev.sourceTint;
      rec.locked = prev.locked;
      rec.palette = prev.palette;
      rec.shape = prev.shape || 'default';
      rec.status = r.status === 'blocked' ? 'blocked' : 'stale';
      rec.kept = true;
    } else if (r.status === 'blocked') {
      rec.status = 'blocked';
    } else {
      continue;
    }
    records.push(rec);
    byKey.set(rec.key, rec);
  }

  let traced = 0;
  for (const rec of traceQueue) {
    rec.trace = await traceGlyph(rec.glyphImage, rec.key);
    progress({ phase: 'trace', done: ++traced, total: traceQueue.length, key: rec.key });
  }

  const appOf = new Map(targets.map((t) => [t.key, t.appId]));
  const entries = {};
  for (const rec of records) entries[rec.key] = rec;
  let adjusted = [];
  let groups = [];
  let tight = [];
  if (legacy) {
    for (const rec of records) if (rec.tint) rec.sourceTint = rec.sourceTint || rec.tint;
    adjusted = separateTints(entries, appOf);
  } else {
    const mode = options.mode || 'follow';
    const unlocked = new Set(records.filter((r) => !r.locked && !r.kept && r.image && (mode === 'mono' || r.tint)).map((r) => r.key));
    for (const rec of records) if (rec.tint && !rec.sourceTint) rec.sourceTint = rec.tint;
    const res = applyMode(entries, appOf, { mode, seed, color: options.monoColor, vary: options.monoVary !== false, spread: options.spread || 1, keys: unlocked });
    adjusted = res.adjusted;
    groups = res.groups;
    tight = res.tight;
    for (const rec of records) {
      if (rec.tint && mode !== 'keep' && unlocked.has(rec.key)) rec.seed = seed;
    }
  }
  const contrast = legacy ? { nudged: [], flagged: [] } : guardContrast(entries);

  const probes = [];
  for (const rec of records) {
    if (!rec.image || rec.status === 'override') continue;
    let hash64 = null;
    try {
      hash64 = await dHash(rec.glyphImage || rec.image, !!rec.glyphImage);
    } catch {
      hash64 = null;
    }
    probes.push({ key: rec.key, appId: rec.appId, hash64, lab: rec.tint && rec.tint[0] ? hexToLab(!legacy && rec.sourceTint && isHex(rec.sourceTint[0]) ? rec.sourceTint[0] : rec.tint[0]) : null });
  }
  const { flagged, palette } = detectDefaults(probes);
  const why = new Map();
  for (const [k, w] of flagged) {
    byKey.get(k).status = 'default';
    why.set(k, w);
  }

  const sorted = [...records].sort((a, b) => (a.key < b.key ? -1 : 1));
  const exported = legacy ? await buildLegacyExport(sorted, { generatedAt: now }) : await buildLauncherExport(sorted, { cell, generatedAt: now, seed });

  const count = (s) => results.filter((r) => (byKey.get(r.key) ? byKey.get(r.key).status : r.status) === s).length;
  const report = {
    generatedAt: now,
    profile,
    thresholds: { dHashMaxHamming: DHASH_MAX, deltaEOklabMax: DELTA_E_MAX, minOtherApps: MIN_OTHER_APPS, minTintSeparation: MIN_TINT_SEP },
    summary: {
      total: targets.length,
      found: count('found'),
      override: count('override'),
      stale: count('stale'),
      blocked: count('blocked'),
      default: count('default'),
      notfound: results.filter((r) => !byKey.has(r.key)).length
    },
    colour: { mode: legacy ? 'legacy' : options.mode || 'follow', seed: legacy ? null : seed, groups, tightGroups: tight, contrastNudged: contrast.nudged, contrastFlagged: contrast.flagged },
    atlas: { cell, cellDefaulted, ...exported.stats },
    gate: { ok: exported.gate.ok, failures: exported.gate.failures },
    defaults: [...flagged.keys()],
    similarPalette: [...palette.keys()],
    adjusted,
    items: results.map((r) => {
      const rec = byKey.get(r.key);
      return {
        key: r.key,
        url: r.url,
        status: rec ? rec.status : 'notfound',
        harvest: r.status,
        source: r.source,
        error: r.error,
        tint: rec ? rec.tint : null,
        glyph: rec ? (rec.trace && rec.trace.accepted ? 'symbol' : rec.glyphImage ? 'atlas' : null) : null,
        trace: rec && rec.trace ? { accepted: rec.trace.accepted, bytes: rec.trace.bytes, iou: Number((rec.trace.iou || 0).toFixed(3)), reason: rec.trace.reason } : null,
        why: why.get(r.key) || null
      };
    })
  };
  exported.files['harvest-report.json'] = new TextEncoder().encode(stableStringify(report));
  return { records: sorted, results, report, export: exported, validKeys, entries: byKey };
};

export { canonicalJson, EXT_BY_NAME, KEY_RE, buildTargets, extrasToTargets, mergeTargets };

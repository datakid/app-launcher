import {
  configureRuntime,
  runHarvest,
  processTarget,
  analyzeIcon,
  traceGlyph,
  pixelHash,
  encodePng,
  buildLauncherExport,
  buildCustomExport,
  buildFaviconPack,
  zipFiles,
  errText,
  DEFAULT_CELL
} from '../../shared/harvest-core/index.js';

let wasmBase = './wasm/';
configureRuntime({
  wasmSource: async (id) => {
    const res = await fetch(wasmBase + id + '.wasm');
    if (!res.ok) throw new Error('could not load ' + id + '.wasm');
    return res.arrayBuffer();
  }
});

let records = new Map();
let settings = { proxyUrl: '', proxyToken: '' };

const makeIo = () => ({
  fetchBytes: async (url) => {
    if (!settings.proxyUrl) {
      let res;
      try {
        res = await fetch(url, { redirect: 'follow' });
      } catch {
        const e = new Error('needs the fetch proxy: this site does not allow direct browser access');
        e.fatal = true;
        throw e;
      }
      return { ok: res.ok, status: res.status, url: res.url || url, bytes: new Uint8Array(await res.arrayBuffer()), mitigated: null };
    }
    const target = settings.proxyUrl + (settings.proxyUrl.includes('?') ? '&' : '?') + 'url=' + encodeURIComponent(url);
    const res = await fetch(target, { headers: settings.proxyToken ? { 'x-studio-token': settings.proxyToken } : {} });
    if (res.status === 401) {
      const e = new Error('the proxy rejected the access token');
      e.fatal = true;
      throw e;
    }
    if (!res.headers.get('x-upstream-status')) {
      let why = 'HTTP ' + res.status;
      try {
        why = (await res.json()).error || why;
      } catch {}
      throw new Error('proxy: ' + why);
    }
    const upstream = Number(res.headers.get('x-upstream-status')) || res.status;
    return { ok: upstream >= 200 && upstream < 300, status: upstream, url: res.headers.get('x-upstream-url') || url, bytes: new Uint8Array(await res.arrayBuffer()), mitigated: res.headers.get('x-vercel-mitigated') };
  },
  readLocal: async () => null,
  readOverride: async () => {
    throw new Error('overrides are not available in the browser');
  },
  readOutput: async () => null
});

const pngOf = async (img) => (img ? encodePng(img, { optimise: false }) : null);

const serialise = async (rec) => {
  const favicon = await pngOf(rec.image);
  const glyph = rec.glyphImage ? await pngOf(rec.glyphImage) : null;
  const payload = {
    key: rec.key,
    appId: rec.appId,
    status: rec.status,
    base: rec.base || null,
    tint: rec.tint || null,
    sourceTint: rec.sourceTint || null,
    locked: !!rec.locked,
    hash: rec.hash || null,
    trace: rec.trace ? { accepted: rec.trace.accepted, d: rec.trace.d, bytes: rec.trace.bytes, iou: rec.trace.iou, reason: rec.trace.reason } : null,
    favicon,
    glyph
  };
  return payload;
};

const handlers = {
  async configure(p) {
    if (p.wasmBase) wasmBase = p.wasmBase;
    settings = { ...settings, ...(p.settings || {}) };
    return { ok: true };
  },

  async harvest(p, post) {
    const targets = p.targets.map((t) => ({ ...t }));
    const result = await runHarvest(
      { targets, overrides: {} },
      { profile: 'launcher', seed: p.seed, mode: 'keep', cell: p.cell || DEFAULT_CELL, now: new Date().toISOString(), onProgress: (e) => post({ progress: e }) },
      makeIo()
    );
    records = new Map(result.records.map((r) => [r.key, r]));
    const out = [];
    for (const r of result.records) out.push(await serialise(r));
    const transfer = [];
    for (const r of out) {
      if (r.favicon) transfer.push(r.favicon.buffer);
      if (r.glyph) transfer.push(r.glyph.buffer);
    }
    return { value: { records: out, items: result.report.items, summary: result.report.summary }, transfer };
  },

  async replace(p) {
    const { key, appId, bytes, fileName } = p;
    const target = { key, appId, bytes, fileName };
    const r = await processTarget(target, { io: makeIo(), overrides: {}, local: false });
    if (!r.image) throw new Error(r.error || 'not a usable image');
    const analysis = await analyzeIcon(r.image);
    const prev = records.get(key) || { key, appId };
    const rec = {
      ...prev,
      key,
      appId,
      status: 'override',
      image: r.image,
      original: r.original || null,
      hash: await pixelHash(r.image),
      base: analysis.gradient,
      sourceTint: analysis.gradient,
      tint: analysis.gradient,
      glyphImage: analysis.glyph,
      trace: analysis.glyph ? await traceGlyph(analysis.glyph, key) : null,
      locked: false
    };
    records.set(key, rec);
    const out = await serialise(rec);
    const transfer = [];
    if (out.favicon) transfer.push(out.favicon.buffer);
    if (out.glyph) transfer.push(out.glyph.buffer);
    return { value: out, transfer };
  },

  async build(p) {
    const patched = [...records.values()].map((r) => ({ ...r, ...(p.patches[r.key] || {}) }));
    const sorted = patched.sort((a, b) => (a.key < b.key ? -1 : 1));
    const now = new Date().toISOString();
    if (p.kind === 'launcher') {
      const exp = await buildLauncherExport(sorted, { cell: p.cell || DEFAULT_CELL, generatedAt: now, seed: p.seed });
      const zip = zipFiles(exp.files, 'icons/');
      return { value: { gate: exp.gate, stats: exp.stats, zip, files: Object.keys(exp.files) }, transfer: [zip.buffer] };
    }
    if (p.kind === 'pack') {
      const rec = sorted.find((r) => r.key === p.key) || sorted.find((r) => r.image);
      const pack = await buildFaviconPack(rec, { name: p.name || rec.key, background: p.background || '#ffffff', themeColor: p.themeColor || null });
      return { value: { zip: pack.zip, head: pack.head, files: Object.keys(pack.files) }, transfer: [pack.zip.buffer] };
    }
    const exp = await buildCustomExport(sorted, { formats: p.formats, sizes: p.sizes, quality: p.quality || 90, lossless: !!p.lossless });
    return { value: { zip: exp.zip, files: Object.keys(exp.files) }, transfer: [exp.zip.buffer] };
  }
};

self.onmessage = async (event) => {
  const { id, type, payload } = event.data;
  const post = (extra, transfer = []) => self.postMessage({ id, ...extra }, transfer);
  try {
    const out = await handlers[type](payload || {}, (e) => post(e));
    const value = out && out.value !== undefined ? out.value : out;
    post({ done: true, value }, out && out.transfer ? out.transfer : []);
  } catch (e) {
    post({ done: true, error: errText(e) });
  }
};

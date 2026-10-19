import { smooth } from './color.js';
import { makeImage, cropImage, extendImage, resizeTo } from './pixels.js';
import { rasterSvg } from './codecs.js';
import { lazyInit, utf8 } from './runtime.js';

export const solve3 = (m, v) => {
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

export const fitBackground = (pts, lab, w, h) => {
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

export const GLYPH_SIZE = 128;
export const GLYPH_CONTENT = 104;
export const GLYPH_PAD = 12;

export const extractGlyph = async (data, lab, w, h) => {
  const n = w * h;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let solid = 0;
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] < 128) continue;
    const x = p % w;
    const y = (p - x) / w;
    solid++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!solid) return null;
  const fill = solid / ((maxX - minX + 1) * (maxY - minY + 1));
  const clear = (x, y) => x < 0 || y < 0 || x >= w || y >= h || data[(y * w + x) * 4 + 3] < 128;
  const nearEdge = (p, d) => {
    const x = p % w;
    const y = (p - x) / w;
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
    let L = 0;
    let A = 0;
    let B = 0;
    for (const p of band) {
      L += lab[p * 3];
      A += lab[p * 3 + 1];
      B += lab[p * 3 + 2];
    }
    L /= band.length;
    A /= band.length;
    B /= band.length;
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
    let gx0 = w;
    let gy0 = h;
    let gx1 = -1;
    let gy1 = -1;
    let on = 0;
    for (let p = 0; p < n; p++) {
      if (alpha[p] < 0.5) continue;
      const x = p % w;
      const y = (p - x) / w;
      on++;
      if (x < gx0) gx0 = x;
      if (x > gx1) gx1 = x;
      if (y < gy0) gy0 = y;
      if (y > gy1) gy1 = y;
    }
    if (!on) return null;
    const cover = on / n;
    const gfill = on / ((gx1 - gx0 + 1) * (gy1 - gy0 + 1));
    if (cover < 0.02 || cover > 0.6 || gfill > 0.85) return null;
    const full = makeImage(w, h);
    for (let p = 0; p < n; p++) {
      full.data[p * 4] = 255;
      full.data[p * 4 + 1] = 255;
      full.data[p * 4 + 2] = 255;
      full.data[p * 4 + 3] = Math.round(alpha[p] * 255);
    }
    const cropped = cropImage(full, gx0, gy0, gx1 - gx0 + 1, gy1 - gy0 + 1);
    return extendImage(await resizeTo(cropped, GLYPH_CONTENT, GLYPH_CONTENT), GLYPH_PAD);
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

export const TRACE = Object.freeze({ turdsize: 2, alphamax: 1, opticurve: 1, opttolerance: 0.2, extractcolors: false });
export const SYMBOL_MAX_BYTES = 1536;
export const IOU_MIN = 0.95;
export const THRESHOLD = 128;

const potraceReady = lazyInit(async () => {
  const mod = await import('esm-potrace-wasm');
  await mod.init();
  return mod.potrace;
});

const svgoReady = lazyInit(async () => (await import('svgo/browser')).optimize);

const NUM = /([a-zA-Z])|(-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)/gi;

export const parsePath = (d) => {
  const tokens = [];
  for (const m of d.matchAll(NUM)) tokens.push(m[1] ? { c: m[1] } : { n: Number(m[2]) });
  const segs = [];
  let i = 0;
  let cmd = null;
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let lastC = null;
  const num = () => tokens[i++].n;
  while (i < tokens.length) {
    if (tokens[i].c) {
      cmd = tokens[i++].c;
      if (cmd === 'z' || cmd === 'Z') {
        segs.push({ t: 'Z' });
        cx = sx;
        cy = sy;
        lastC = null;
        continue;
      }
    }
    const rel = cmd === cmd.toLowerCase();
    const up = cmd.toUpperCase();
    if (up === 'M') {
      const x = num() + (rel ? cx : 0);
      const y = num() + (rel ? cy : 0);
      segs.push({ t: 'M', p: [x, y] });
      cx = sx = x;
      cy = sy = y;
      cmd = rel ? 'l' : 'L';
      lastC = null;
    } else if (up === 'L') {
      const x = num() + (rel ? cx : 0);
      const y = num() + (rel ? cy : 0);
      segs.push({ t: 'L', p: [x, y] });
      cx = x;
      cy = y;
      lastC = null;
    } else if (up === 'H') {
      const x = num() + (rel ? cx : 0);
      segs.push({ t: 'L', p: [x, cy] });
      cx = x;
      lastC = null;
    } else if (up === 'V') {
      const y = num() + (rel ? cy : 0);
      segs.push({ t: 'L', p: [cx, y] });
      cy = y;
      lastC = null;
    } else if (up === 'C') {
      const a = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      const b = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      const e = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      segs.push({ t: 'C', p: [...a, ...b, ...e] });
      lastC = b;
      cx = e[0];
      cy = e[1];
    } else if (up === 'S') {
      const a = lastC ? [2 * cx - lastC[0], 2 * cy - lastC[1]] : [cx, cy];
      const b = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      const e = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      segs.push({ t: 'C', p: [...a, ...b, ...e] });
      lastC = b;
      cx = e[0];
      cy = e[1];
    } else if (up === 'Q') {
      const q = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      const e = [num() + (rel ? cx : 0), num() + (rel ? cy : 0)];
      const a = [cx + (2 / 3) * (q[0] - cx), cy + (2 / 3) * (q[1] - cy)];
      const b = [e[0] + (2 / 3) * (q[0] - e[0]), e[1] + (2 / 3) * (q[1] - e[1])];
      segs.push({ t: 'C', p: [...a, ...b, ...e] });
      cx = e[0];
      cy = e[1];
      lastC = null;
    } else {
      throw new Error('unsupported path command ' + cmd);
    }
  }
  return segs;
};

const fmt = (v) => {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? '0' : String(r);
};

export const emitPath = (segs, map) => {
  let out = '';
  for (const s of segs) {
    if (s.t === 'Z') out += 'Z';
    else {
      const pts = [];
      for (let k = 0; k < s.p.length; k += 2) {
        const [x, y] = map(s.p[k], s.p[k + 1]);
        pts.push(fmt(x), fmt(y));
      }
      out += s.t + pts.join(' ');
    }
  }
  return out;
};

export const toViewBoxPath = (svg, size) => {
  const t = /translate\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)\s*scale\(\s*([-\d.]+)[ ,]+([-\d.]+)\s*\)/.exec(svg);
  const [tx, ty, sx, sy] = t ? [Number(t[1]), Number(t[2]), Number(t[3]), Number(t[4])] : [0, 0, 1, 1];
  const k = 24 / size;
  const ds = [...svg.matchAll(/\sd="([^"]+)"/g)].map((m) => m[1]);
  if (!ds.length) return '';
  return ds.map((d) => emitPath(parsePath(d), (x, y) => [(x * sx + tx) * k, (y * sy + ty) * k])).join('');
};

export const maskOf = (img) => {
  const n = img.width * img.height;
  const mask = new Uint8Array(n);
  for (let p = 0; p < n; p++) mask[p] = img.data[p * 4 + 3] >= THRESHOLD ? 1 : 0;
  return mask;
};

export const iou = (a, b) => {
  let inter = 0;
  let union = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] && b[i]) inter++;
    if (a[i] || b[i]) union++;
  }
  return union ? inter / union : 1;
};

export const symbolMarkup = (key, d) => `<symbol id="g-${key}" viewBox="0 0 24 24"><path d="${d}"/></symbol>`;

export const traceGlyph = async (glyph, key) => {
  const mask = maskOf(glyph);
  const { width: w, height: h } = glyph;
  const bw = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < mask.length; p++) {
    const v = mask[p] ? 0 : 255;
    bw[p * 4] = v;
    bw[p * 4 + 1] = v;
    bw[p * 4 + 2] = v;
    bw[p * 4 + 3] = 255;
  }
  const potrace = await potraceReady();
  const traced = await potrace(new ImageData(bw, w, h), { ...TRACE });
  const raw = toViewBoxPath(traced, w);
  if (!raw) return { accepted: false, reason: 'empty trace', d: null, symbol: null, bytes: 0, iou: 0 };
  const optimize = await svgoReady();
  const optimised = optimize(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="${raw}"/></svg>`, {
    multipass: true,
    plugins: [{ name: 'preset-default', params: { overrides: { convertPathData: { floatPrecision: 1 } } } }]
  });
  const m = /\sd="([^"]+)"/.exec(optimised.data);
  const d = m ? m[1] : raw;
  const symbol = symbolMarkup(key, d);
  const bytes = utf8(symbol).length;
  const raster = await rasterSvg(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${w}" height="${h}"><path d="${d}"/></svg>`, { width: w });
  const score = iou(mask, maskOf(raster));
  if (bytes > SYMBOL_MAX_BYTES) return { accepted: false, reason: 'symbol over ' + SYMBOL_MAX_BYTES + ' bytes', d, symbol, bytes, iou: score };
  if (score < IOU_MIN) return { accepted: false, reason: 'trace IoU below ' + IOU_MIN, d, symbol, bytes, iou: score };
  return { accepted: true, reason: null, d, symbol, bytes, iou: score };
};

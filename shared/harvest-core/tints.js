import { deltaE, hexToLab, hexToLch, oklchHex, tintFromHex, nudgeForContrast, passesContrast, isHex } from './color.js';

export const MIN_TINT_SEP = 0.04;
export const GROUP_DELTA_E = 0.06;
export const MAX_DRAWS = 12;
export const DEFAULT_SEED = '1f2e3d4c';
export const MODES = ['follow', 'mono', 'family'];

const RAD = Math.PI / 180;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const hash32 = (text) => {
  let x = 2166136261;
  for (const ch of String(text)) {
    x ^= ch.codePointAt(0);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
};

export const mulberry32 = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const rngFor = (seed, key) => mulberry32(hash32(seed + ':' + key));

export const shiftTint = (tint, dh, dl, dcMul = 1, dcAdd = 0) =>
  tint.map((hex) => {
    const [L, C, h] = hexToLch(hex);
    return oklchHex(clamp(L + dl, 0.15, 0.95), Math.max(0, C * dcMul + dcAdd), h + dh);
  });

const seededUnit = (key) => hash32(key) / 4294967296;

export const tintCandidates = (key) => {
  const flip = seededUnit(key) < 0.5 ? 1 : -1;
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

const baseOf = (e) => (Array.isArray(e.sourceTint) && e.sourceTint.length === 3 ? e.sourceTint : e.tint);
const validTint = (t) => Array.isArray(t) && t.length === 3 && t.every(isHex);

export const colourGroups = (items, threshold = GROUP_DELTA_E) => {
  const sorted = [...items].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  const labs = sorted.map((i) => hexToLab(i.tint[0]));
  const parent = sorted.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      if (deltaE(labs[i], labs[j]) <= threshold) parent[find(j)] = find(i);
    }
  }
  const byRoot = new Map();
  sorted.forEach((item, i) => {
    const r = find(i);
    if (!byRoot.has(r)) byRoot.set(r, []);
    byRoot.get(r).push(item.key);
  });
  return [...byRoot.values()];
};

const drawVariation = (tint, rng, spread) => {
  const dh = (rng() * 2 - 1) * 10 * spread * RAD;
  const dl = (rng() * 2 - 1) * 0.06 * spread;
  const dcMul = 1 + (rng() * 2 - 1) * 0.08 * spread;
  return shiftTint(tint, dh, dl, dcMul);
};

export const separateTints = (entries, appOf) => {
  const placed = [];
  const adjusted = [];
  for (const key of Object.keys(entries).sort()) {
    const e = entries[key];
    const base = baseOf(e);
    if (!validTint(base) || !appOf.has(key)) continue;
    const appId = appOf.get(key);
    let chosen = base;
    let bestSep = -1;
    for (const c of tintCandidates(key)) {
      const t = c.dh || c.dl || c.dc ? shiftTint(base, c.dh, c.dl, 1, c.dc) : base;
      const lab = hexToLab(t[0]);
      const sep = sepFromApps(lab, placed, appId);
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

const sepFromApps = (lab, placed, appId) => {
  let sep = Infinity;
  for (const o of placed) if (o.appId !== appId) sep = Math.min(sep, deltaE(lab, o.lab));
  return sep;
};

const settle = (key, base, rng, spread, placed, appId) => {
  let chosen = base;
  let bestSep = -1;
  let tight = false;
  let met = false;
  for (let i = 0; i < MAX_DRAWS; i++) {
    const t = drawVariation(base, rng, spread);
    const sep = sepFromApps(hexToLab(t[0]), placed, appId);
    if (sep >= MIN_TINT_SEP) {
      chosen = t;
      met = true;
      break;
    }
    if (sep > bestSep) {
      bestSep = sep;
      chosen = t;
    }
  }
  if (!met) tight = true;
  return { tint: chosen, tight };
};

export const followTints = (entries, appOf, { seed = DEFAULT_SEED, spread = 1, keys = null, groupThreshold = GROUP_DELTA_E } = {}) => {
  const eligible = Object.keys(entries).filter((k) => validTint(baseOf(entries[k])) && appOf.has(k) && (!keys || keys.has(k)));
  const items = eligible.map((key) => ({ key, tint: baseOf(entries[key]) }));
  const groups = colourGroups(items, groupThreshold);
  const sizeOf = new Map();
  for (const g of groups) for (const k of g) sizeOf.set(k, g.length);
  const placed = [];
  const adjusted = [];
  const tightGroups = [];
  for (const key of eligible.sort()) {
    const e = entries[key];
    const base = baseOf(e);
    const appId = appOf.get(key);
    let tint = base;
    if (sizeOf.get(key) > 1) {
      const r = settle(key, base, rngFor(seed, key), spread, placed, appId);
      tint = r.tint;
      if (r.tight) tightGroups.push(key);
    }
    e.tint = tint;
    if (tint === base) delete e.sourceTint;
    else {
      e.sourceTint = base;
      adjusted.push(key);
    }
    placed.push({ appId, lab: hexToLab(tint[0]) });
  }
  return { adjusted, groups: groups.filter((g) => g.length > 1), tight: tightGroups };
};

export const monoTints = (entries, appOf, { color, seed = DEFAULT_SEED, vary = true, spread = 1, keys = null } = {}) => {
  const base = tintFromHex(color);
  const eligible = Object.keys(entries).filter((k) => appOf.has(k) && (!keys || keys.has(k))).sort();
  const placed = [];
  const adjusted = [];
  const tight = [];
  for (const key of eligible) {
    const e = entries[key];
    if (e.sourceTint === undefined && validTint(e.tint)) e.sourceTint = e.tint;
    let tint = base;
    if (vary && eligible.length > 1) {
      const r = settle(key, base, rngFor(seed, key), spread, placed, appOf.get(key));
      tint = r.tint;
      if (r.tight) tight.push(key);
    }
    e.tint = tint;
    adjusted.push(key);
    placed.push({ appId: appOf.get(key), lab: hexToLab(tint[0]) });
  }
  return { adjusted, groups: [eligible], tight };
};

export const tintFromColour = (hex) => tintFromHex(hex);

export const resetToSource = (entries) => {
  for (const e of Object.values(entries)) {
    if (Array.isArray(e.sourceTint)) {
      e.tint = e.sourceTint;
      delete e.sourceTint;
    }
  }
};

export const applyMode = (entries, appOf, options = {}) => {
  const { mode = 'follow' } = options;
  if (mode === 'mono') return monoTints(entries, appOf, options);
  if (mode === 'family') return { adjusted: separateTints(entries, appOf), groups: [], tight: [] };
  return followTints(entries, appOf, options);
};

export const guardContrast = (entries) => {
  const report = { nudged: [], flagged: [] };
  for (const key of Object.keys(entries).sort()) {
    const e = entries[key];
    if (!validTint(e.tint)) {
      delete e.contrast;
      continue;
    }
    if (passesContrast(e.tint)) {
      delete e.contrast;
      continue;
    }
    if (e.locked) {
      e.contrast = 'flagged';
      report.flagged.push(key);
      continue;
    }
    const r = nudgeForContrast(e.tint);
    if (r.status === 'nudged') {
      if (!Array.isArray(e.sourceTint)) e.sourceTint = e.tint;
      e.tint = r.tint;
      e.contrast = 'nudged';
      report.nudged.push(key);
    } else {
      e.contrast = 'flagged';
      report.flagged.push(key);
    }
  }
  return report;
};

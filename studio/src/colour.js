import { applyMode, guardContrast } from '../../shared/harvest-core/tints.js';
import { tintFromHex, passesContrast, launcherTile, hexToLch, oklchHex } from '../../shared/harvest-core/color.js';

export const randomSeed = () => {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0].toString(16).padStart(8, '0');
};

export const recolour = (records, { mode, seed, monoColor, monoVary, spread }) => {
  const list = [...records.values()].filter((r) => r.hasImage);
  const appOf = new Map(list.map((r) => [r.key, r.appId]));
  const entries = {};
  const lockedEntries = {};
  for (const r of list) {
    if (r.locked) lockedEntries[r.key] = { tint: r.tint, locked: true };
    else entries[r.key] = { tint: r.base, locked: false };
  }
  const res = applyMode(entries, appOf, { mode, seed, color: monoColor, vary: monoVary, spread });
  const all = { ...entries, ...lockedEntries };
  guardContrast(all);
  const tight = new Set(res.tight || []);
  const grouped = new Set((res.groups || []).flat());
  for (const r of list) {
    const e = all[r.key];
    r.tint = e.tint || null;
    r.sourceTint = r.locked ? r.sourceTint : e.sourceTint || r.base || null;
    r.contrast = e.contrast || null;
    r.tight = tight.has(r.key);
    r.grouped = grouped.has(r.key);
  }
  return res;
};

export const setManualColour = (rec, hex) => {
  rec.tint = tintFromHex(hex);
  rec.locked = true;
  rec.contrast = passesContrast(rec.tint) ? null : 'flagged';
};

export const effectiveTheme = (pref) => (pref === 'light' || pref === 'dark' ? pref : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const tileColours = (tint, { colors, theme }) => {
  const c1 = (tint && tint[0]) || '#8c95b6';
  const [L, C, h] = hexToLch(c1);
  if (colors === 'muted') {
    const dark = theme === 'dark';
    return { tile: oklchHex(dark ? 0.34 : 0.92, clamp(C * 0.42, 0.022, 0.045), h), ink: oklchHex(dark ? 0.86 : 0.45, clamp(C * 0.65, 0.035, 0.07), h), vivid: false };
  }
  const base = launcherTile(c1, theme);
  const [bL, bC, bh] = hexToLch(base);
  return { tile: base, hi: oklchHex(clamp(bL + 0.08, 0, 0.95), bC * 0.9, bh), lo: oklchHex(clamp(bL - 0.09, 0.15, 1), bC, bh), ink: '#fafafa', vivid: true, L };
};

export const requiredPatch = (rec, mode, seed) => {
  const seeded = (mode === 'follow' || mode === 'mono') && !rec.locked;
  return {
    tint: rec.tint,
    sourceTint: rec.base && rec.tint && rec.base.join() !== rec.tint.join() ? rec.base : undefined,
    locked: rec.locked || (mode !== 'follow' && mode !== 'keep'),
    palette: null,
    seed: seeded && rec.tint ? seed : null
  };
};

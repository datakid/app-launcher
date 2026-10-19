export const srgbToLin = (c) => {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

export const linToSrgb = (c) => {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
};

export const toOklab = (r, g, b) => {
  const R = srgbToLin(r);
  const G = srgbToLin(g);
  const B = srgbToLin(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
};

export const fromOklab = (L, a, b) => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
};

export const oklchHex = (L, C, h) => {
  for (let i = Math.round(C / 0.005); i >= 0; i--) {
    const c = i * 0.005;
    const rgb = fromOklab(L, c * Math.cos(h), c * Math.sin(h));
    if (rgb.every((v) => v >= -1e-4 && v <= 1.0001)) return '#' + rgb.map((v) => linToSrgb(v).toString(16).padStart(2, '0')).join('');
  }
  return '#808080';
};

export const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

export const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = (r, g, b) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');

export const hexToLab = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return toOklab(r, g, b);
};

export const deltaE = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export const hexToLch = (hex) => {
  const [L, a, b] = hexToLab(hex);
  return [L, Math.hypot(a, b), Math.atan2(b, a)];
};

export const lchToHex = (L, C, h) => oklchHex(L, C, h);

export const blendHex = (hex, mix, ratio) => {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + (mix[0] - r) * ratio, g + (mix[1] - g) * ratio, b + (mix[2] - b) * ratio);
};

export const luminance = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b);
};

export const contrastRatio = (a, b) => {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
};

export const hueDegrees = (hex) => {
  const [, , h] = hexToLch(hex);
  return ((h * 180) / Math.PI + 360) % 360;
};

export const extractGradient = (data, lab, n) => {
  const bins = Array.from({ length: 24 }, () => ({ w: 0, L: 0, a: 0, b: 0 }));
  let opaque = 0;
  let chromatic = 0;
  for (let p = 0; p < n; p++) {
    if (data[p * 4 + 3] < 200) continue;
    opaque++;
    const L = lab[p * 3];
    const a = lab[p * 3 + 1];
    const b = lab[p * 3 + 2];
    const C = Math.hypot(a, b);
    if (C < 0.04 || L < 0.2 || L > 0.95) continue;
    chromatic++;
    const h = (Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI);
    const bin = bins[Math.floor((h / (2 * Math.PI)) * 24) % 24];
    bin.w += C;
    bin.L += L * C;
    bin.a += a * C;
    bin.b += b * C;
  }
  if (!opaque || chromatic / opaque < 0.03) return null;
  let best = 0;
  let bestW = -1;
  for (let i = 0; i < 24; i++) {
    const w = bins[(i + 23) % 24].w + bins[i].w + bins[(i + 1) % 24].w;
    if (w > bestW) {
      bestW = w;
      best = i;
    }
  }
  let sw = 0;
  let sa = 0;
  let sb = 0;
  for (const j of [(best + 23) % 24, best, (best + 1) % 24]) {
    sw += bins[j].w;
    sa += bins[j].a;
    sb += bins[j].b;
  }
  const a = sa / sw;
  const b = sb / sw;
  const h = Math.atan2(b, a);
  const c = Math.min(Math.max(Math.hypot(a, b), 0.06), 0.16);
  return tintFromOklch(c, h);
};

export const tintFromOklch = (c, h) => [oklchHex(0.66, c, h), oklchHex(0.86, Math.min(c * 0.75, 0.11), h), oklchHex(0.38, Math.min(c, 0.12), h)];

export const tintFromHex = (hex) => {
  const [, C, h] = hexToLch(hex);
  const c = Math.min(Math.max(C, 0.06), 0.16);
  return tintFromOklch(c, h);
};

export const imageToLab = (data, n) => {
  const lab = new Float32Array(n * 3);
  for (let p = 0; p < n; p++) {
    const [L, a, b] = toOklab(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]);
    lab[p * 3] = L;
    lab[p * 3 + 1] = a;
    lab[p * 3 + 2] = b;
  }
  return lab;
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const GLYPH_INK = '#fafafa';

export const launcherTile = (c1, theme) => {
  const [L, C, h] = hexToLch(c1);
  const tile = theme === 'light' ? oklchHex(clamp(L, 0.52, 0.64), clamp(C, 0.09, 0.17), h) : oklchHex(clamp(L, 0.62, 0.72), clamp(C, 0.07, 0.14), h);
  return tile;
};

export const tileContrast = (c1, theme) => contrastRatio(GLYPH_INK, launcherTile(c1, theme));

export const MIN_CONTRAST = 3;
export const NUDGE_STEP = 0.02;
export const NUDGE_MAX = 0.12;

export const passesContrast = (tint) => !tint || !tint[0] || ['light', 'dark'].every((t) => tileContrast(tint[0], t) >= MIN_CONTRAST);

export const nudgeForContrast = (tint) => {
  if (!tint || !tint[0]) return { tint, status: 'none', steps: 0 };
  if (passesContrast(tint)) return { tint, status: 'ok', steps: 0 };
  const lch = tint.map(hexToLch);
  for (let step = 1; step <= Math.round(NUDGE_MAX / NUDGE_STEP); step++) {
    const dl = -step * NUDGE_STEP;
    const next = lch.map(([L, C, h]) => oklchHex(clamp(L + dl, 0.15, 0.95), C, h));
    if (passesContrast(next)) return { tint: next, status: 'nudged', steps: step };
  }
  return { tint, status: 'flagged', steps: 0 };
};

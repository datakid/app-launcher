import { linToSrgb, srgbToLin, deltaE } from './color.js';
import { resizeKernel } from './codecs.js';

export const DHASH_MAX = 6;
export const DELTA_E_MAX = 0.03;
export const MIN_OTHER_APPS = 2;

export const dHash = async (img, isGlyph) => {
  const n = img.width * img.height;
  const grey = { width: img.width, height: img.height, data: new Uint8ClampedArray(n * 4) };
  for (let p = 0; p < n; p++) {
    const a = img.data[p * 4 + 3];
    let v;
    if (isGlyph) v = a;
    else {
      const f = a / 255;
      const r = img.data[p * 4] * f + 255 * (1 - f);
      const g = img.data[p * 4 + 1] * f + 255 * (1 - f);
      const b = img.data[p * 4 + 2] * f + 255 * (1 - f);
      v = linToSrgb(0.2126 * srgbToLin(r) + 0.7152 * srgbToLin(g) + 0.0722 * srgbToLin(b));
    }
    grey.data[p * 4] = v;
    grey.data[p * 4 + 1] = v;
    grey.data[p * 4 + 2] = v;
    grey.data[p * 4 + 3] = 255;
  }
  const small = await resizeKernel(grey, 9, 8, 'catrom');
  let bits = 0n;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      bits = (bits << 1n) | (small.data[(y * 9 + x) * 4] > small.data[(y * 9 + x + 1) * 4] ? 1n : 0n);
    }
  }
  return bits;
};

export const hamming = (a, b) => {
  let x = a ^ b;
  let n = 0;
  while (x) {
    n += Number(x & 1n);
    x >>= 1n;
  }
  return n;
};

export const detectDefaults = (items) => {
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

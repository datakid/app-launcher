import { makeImage, pasteImage, resizeTo } from './pixels.js';
import { encodeWebp, decodeWebp } from './codecs.js';

export const ATLAS_LIMIT = 153600;
export const DEFAULT_CELL = 128;
export const QUALITY_STEPS = [90, 85, 80, 75];

const byKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);

export const packAtlas = async (items, cell = DEFAULT_CELL) => {
  const sorted = [...items].sort(byKey);
  const count = sorted.length;
  const cols = Math.max(1, Math.ceil(Math.sqrt(count)));
  const rows = Math.max(1, Math.ceil(count / cols));
  const image = makeImage(cols * cell, rows * cell);
  const positions = new Map();
  for (let i = 0; i < count; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    const fitted = sorted[i].image.width === cell && sorted[i].image.height === cell ? sorted[i].image : await resizeTo(sorted[i].image, cell, cell);
    pasteImage(image, fitted, x, y);
    positions.set(sorted[i].key, { x, y });
  }
  return { image, positions, width: image.width, height: image.height, cols, rows, cell };
};

export const encodeAtlas = async (image, limit = ATLAS_LIMIT) => {
  const lossless = await encodeWebp(image, { lossless: 1, method: 6, exact: 0 });
  if (lossless.length <= limit) return { bytes: lossless, mode: 'lossless', fits: true };
  let last = null;
  for (const q of QUALITY_STEPS) {
    const bytes = await encodeWebp(image, { quality: q, method: 6, alpha_quality: 100 });
    last = { bytes, mode: 'lossy-q' + q, fits: bytes.length <= limit };
    if (last.fits) return last;
  }
  return last;
};

export const cropCell = (atlasImage, x, y, cell) => {
  const out = makeImage(cell, cell);
  for (let row = 0; row < cell; row++) {
    const from = ((y + row) * atlasImage.width + x) * 4;
    out.data.set(atlasImage.data.subarray(from, from + cell * 4), row * cell * 4);
  }
  return out;
};

export const unpackAtlas = async (bytes, positions, cell) => {
  const image = await decodeWebp(bytes);
  const out = new Map();
  for (const [key, p] of Object.entries(positions)) {
    if (p.x + cell <= image.width && p.y + cell <= image.height) out.set(key, cropCell(image, p.x, p.y, cell));
  }
  return out;
};

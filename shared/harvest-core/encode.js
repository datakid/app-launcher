import { encodePng, encodeWebp, encodeAvif, encodeJxl, resizeStretch } from './codecs.js';

const u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const u16 = (n) => [n & 255, (n >> 8) & 255];

export const encodeIco = async (img, sizes = [16, 32, 48]) => {
  const frames = [];
  for (const s of sizes) {
    const frame = s === img.width && s === img.height ? img : await resizeStretch(img, s, s);
    frames.push({ size: s, png: await encodePng(frame) });
  }
  const head = [0, 0, 1, 0, ...u16(frames.length)];
  let offset = 6 + frames.length * 16;
  const dir = [];
  for (const f of frames) {
    dir.push(f.size >= 256 ? 0 : f.size, f.size >= 256 ? 0 : f.size, 0, 0, ...u16(1), ...u16(32), ...u32(f.png.length), ...u32(offset));
    offset += f.png.length;
  }
  const out = new Uint8Array(offset);
  out.set([...head, ...dir], 0);
  let at = 6 + frames.length * 16;
  for (const f of frames) {
    out.set(f.png, at);
    at += f.png.length;
  }
  return out;
};

export const encodeImage = async (img, { format = 'png', quality = 90, lossless = false, effort = 6 } = {}) => {
  if (format === 'png') return encodePng(img);
  if (format === 'webp') return lossless ? encodeWebp(img, { lossless: 1, method: effort, exact: 0 }) : encodeWebp(img, { quality, method: effort });
  if (format === 'avif') return encodeAvif(img, lossless ? { lossless: true } : { quality, qualityAlpha: 100 });
  if (format === 'jxl') return encodeJxl(img, lossless ? { lossless: true, effort: 7 } : { quality, effort: 7 });
  if (format === 'ico') return encodeIco(img);
  throw new Error('unknown format ' + format);
};

export const EXTENSIONS = { png: 'png', webp: 'webp', avif: 'avif', jxl: 'jxl', ico: 'ico', svg: 'svg' };

import { decodeImage } from './decode.js';
import { resizeStretch } from './codecs.js';

export const makeImage = (width, height) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) });

export const copyImage = (img) => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data) });

export const cropImage = (img, x, y, w, h) => {
  const out = makeImage(w, h);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * img.width + x) * 4;
    out.data.set(img.data.subarray(from, from + w * 4), row * w * 4);
  }
  return out;
};

export const pasteImage = (dst, src, x, y) => {
  for (let row = 0; row < src.height; row++) {
    const dy = y + row;
    if (dy < 0 || dy >= dst.height) continue;
    for (let col = 0; col < src.width; col++) {
      const dx = x + col;
      if (dx < 0 || dx >= dst.width) continue;
      const s = (row * src.width + col) * 4;
      const d = (dy * dst.width + dx) * 4;
      dst.data[d] = src.data[s];
      dst.data[d + 1] = src.data[s + 1];
      dst.data[d + 2] = src.data[s + 2];
      dst.data[d + 3] = src.data[s + 3];
    }
  }
  return dst;
};

export const extendImage = (img, pad) => {
  const out = makeImage(img.width + pad * 2, img.height + pad * 2);
  return pasteImage(out, img, pad, pad);
};

export const resizeTo = async (img, width, height = width) => {
  if (img.width === width && img.height === height) return copyImage(img);
  const scale = Math.min(width / img.width, height / img.height);
  const nw = Math.max(1, Math.min(width, Math.round(img.width * scale)));
  const nh = Math.max(1, Math.min(height, Math.round(img.height * scale)));
  const scaled = nw === img.width && nh === img.height ? copyImage(img) : await resizeStretch(img, nw, nh);
  if (nw === width && nh === height) return scaled;
  const out = makeImage(width, height);
  return pasteImage(out, scaled, Math.floor((width - nw) / 2), Math.floor((height - nh) / 2));
};

export const gaussianBlur = (alpha, w, h, sigma) => {
  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = [];
  let sum = 0;
  for (let i = -radius; i <= radius; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma));
    kernel.push(v);
    sum += v;
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= sum;
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.min(w - 1, Math.max(0, x + k));
        acc += alpha[y * w + xx] * kernel[k + radius];
      }
      tmp[y * w + x] = acc;
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.min(h - 1, Math.max(0, y + k));
        acc += tmp[yy * w + x] * kernel[k + radius];
      }
      out[y * w + x] = Math.round(acc);
    }
  }
  return out;
};

export const matteCorners = async (img) => {
  const { width: w, height: h, data } = img;
  const dark = (x, y, t) => {
    const i = (y * w + x) * 4;
    return data[i + 3] === 255 && Math.max(data[i], data[i + 1], data[i + 2]) <= t;
  };
  const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  if (!corners.every(([x, y]) => dark(x, y, 20))) return img;
  const cut = new Uint8Array(w * h);
  const stack = corners.map(([x, y]) => y * w + x);
  let count = 0;
  while (stack.length) {
    const p = stack.pop();
    if (cut[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    if (!dark(x, y, 36)) continue;
    cut[p] = 1;
    count++;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  let kept = 0;
  for (let p = 0; p < w * h; p++) {
    if (cut[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    kept++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  if (!kept) return img;
  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const framed = count > w * h * 0.14;
  if (framed && (kept / (bw * bh) < 0.8 || bw < w * 0.5 || bh < h * 0.5 || Math.abs(bw - bh) > Math.max(bw, bh) * 0.1)) return img;
  const fringe = [];
  for (let p = 0; p < w * h; p++) {
    if (cut[p]) continue;
    const x = p % w;
    const y = (p - x) / w;
    const near = (x > 0 && cut[p - 1]) || (x < w - 1 && cut[p + 1]) || (y > 0 && cut[p - w]) || (y < h - 1 && cut[p + w]);
    if (near && Math.max(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]) <= 80) fringe.push(p);
  }
  for (const p of fringe) cut[p] = 1;
  const alpha = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) alpha[p] = cut[p] ? 0 : 255;
  const blurred = gaussianBlur(alpha, w, h, 0.7);
  const out = copyImage(img);
  for (let p = 0; p < w * h; p++) out.data[p * 4 + 3] = cut[p] ? 0 : Math.min(blurred[p], out.data[p * 4 + 3]);
  if (!framed) return out;
  return resizeTo(cropImage(out, minX, minY, bw, bh), 192, 192);
};

export const PNG_SIG = [0x89, 0x50, 0x4e, 0x47];

export const hasAlphaChannel = (bytes, ext, img) => {
  if (ext === 'png') {
    const colorType = bytes[25];
    if (colorType === 4 || colorType === 6) return true;
    let i = 8;
    while (i + 8 <= bytes.length) {
      const len = ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
      const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (type === 'tRNS') return true;
      if (type === 'IDAT' || type === 'IEND') break;
      i += 12 + len;
    }
    return false;
  }
  if (ext === 'jpg') return false;
  if (ext === 'gif') return true;
  for (let p = 3; p < img.data.length; p += 4) if (img.data[p] !== 255) return true;
  return false;
};

export const normalize = async (bytes, ext) => {
  const decoded = await decodeImage(bytes, ext);
  const opaque = ext === 'ico' || ext === 'svg' ? false : !hasAlphaChannel(bytes, ext, decoded);
  let img = await resizeTo(decoded.image, 192, 192);
  if (opaque) img = await matteCorners(img);
  const original = decoded.image.width <= 1024 && decoded.image.height <= 1024 ? decoded.image : null;
  return { img, srcWidth: decoded.srcWidth, original };
};

export const gate = (img, srcWidth) => {
  if (srcWidth !== null && srcWidth < 16) return 'source smaller than 16x16';
  const d = img.data;
  let clear = true;
  let flat = true;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] !== 0) clear = false;
    if (flat && (d[i] !== d[0] || d[i + 1] !== d[1] || d[i + 2] !== d[2] || d[i + 3] !== d[3])) flat = false;
    if (!clear && !flat) break;
  }
  if (clear) return 'fully transparent';
  if (flat) return 'single flat colour';
  return null;
};

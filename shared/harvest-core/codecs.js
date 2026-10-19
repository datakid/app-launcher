import './runtime.js';
import { wasmModule, lazyInit } from './runtime.js';
import decodePngRaw, { init as initPngDec } from '@jsquash/png/decode.js';
import encodePngRaw, { init as initPngEnc } from '@jsquash/png/encode.js';
import optimisePng, { init as initOxipng } from '@jsquash/oxipng/optimise.js';
import decodeJpegRaw, { init as initJpegDec } from '@jsquash/jpeg/decode.js';
import decodeWebpRaw, { init as initWebpDec } from '@jsquash/webp/decode.js';
import encodeWebpRaw, { init as initWebpEnc } from '@jsquash/webp/encode.js';
import decodeAvifRaw, { init as initAvifDec } from '@jsquash/avif/decode.js';
import encodeAvifRaw, { init as initAvifEnc } from '@jsquash/avif/encode.js';
import decodeJxlRaw, { init as initJxlDec } from '@jsquash/jxl/decode.js';
import encodeJxlRaw, { init as initJxlEnc } from '@jsquash/jxl/encode.js';
import resizeRaw, { initResize } from '@jsquash/resize';
import { initWasm, Resvg } from '@resvg/resvg-wasm';

const plain = (img) => ({ width: img.width, height: img.height, data: new Uint8ClampedArray(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength)) });
const asImageData = (img) => new ImageData(new Uint8ClampedArray(img.data.buffer.slice(img.data.byteOffset, img.data.byteOffset + img.data.byteLength)), img.width, img.height);

const ready = {
  pngDec: lazyInit(async () => initPngDec(await wasmModule('png'))),
  pngEnc: lazyInit(async () => initPngEnc(await wasmModule('png'))),
  oxipng: lazyInit(async () => initOxipng(await wasmModule('oxipng'))),
  jpegDec: lazyInit(async () => initJpegDec(await wasmModule('jpeg-dec'))),
  webpDec: lazyInit(async () => initWebpDec(await wasmModule('webp-dec'))),
  webpEnc: lazyInit(async () => initWebpEnc(await wasmModule('webp-enc'))),
  avifDec: lazyInit(async () => initAvifDec(await wasmModule('avif-dec'))),
  avifEnc: lazyInit(async () => initAvifEnc(await wasmModule('avif-enc'))),
  jxlDec: lazyInit(async () => initJxlDec(await wasmModule('jxl-dec'))),
  jxlEnc: lazyInit(async () => initJxlEnc(await wasmModule('jxl-enc'))),
  resize: lazyInit(async () => initResize(await wasmModule('resize'))),
  resvg: lazyInit(async () => initWasm(await wasmModule('resvg')))
};

const bytesOf = (b) => (b instanceof Uint8Array ? b : new Uint8Array(b));

export const decodePng = async (bytes) => {
  await ready.pngDec();
  return plain(await decodePngRaw(bytesOf(bytes).slice().buffer));
};

export const decodeJpeg = async (bytes) => {
  await ready.jpegDec();
  return plain(await decodeJpegRaw(bytesOf(bytes).slice().buffer));
};

export const decodeWebp = async (bytes) => {
  await ready.webpDec();
  return plain(await decodeWebpRaw(bytesOf(bytes).slice().buffer));
};

export const decodeAvif = async (bytes) => {
  await ready.avifDec();
  return plain(await decodeAvifRaw(bytesOf(bytes).slice().buffer));
};

export const decodeJxl = async (bytes) => {
  await ready.jxlDec();
  return plain(await decodeJxlRaw(bytesOf(bytes).slice().buffer));
};

export const encodePng = async (img, { optimise = true } = {}) => {
  await ready.pngEnc();
  const raw = await encodePngRaw(asImageData(img));
  if (!optimise) return new Uint8Array(raw);
  await ready.oxipng();
  return new Uint8Array(await optimisePng(raw, { level: 3, interlace: false, optimiseAlpha: false }));
};

export const encodeWebp = async (img, options = {}) => {
  await ready.webpEnc();
  return new Uint8Array(await encodeWebpRaw(asImageData(img), options));
};

export const encodeAvif = async (img, options = {}) => {
  await ready.avifEnc();
  return new Uint8Array(await encodeAvifRaw(asImageData(img), options));
};

export const encodeJxl = async (img, options = {}) => {
  await ready.jxlEnc();
  return new Uint8Array(await encodeJxlRaw(asImageData(img), options));
};

const lanczos3 = (x) => {
  x = Math.abs(x);
  if (x >= 3) return 0;
  if (x === 0) return 1;
  const px = Math.PI * x;
  return (Math.sin(px) / px) * (Math.sin(px / 3) / (px / 3));
};

const upscaleAxis = (src, sw, sh, dw, dh, horizontal) => {
  const inLen = horizontal ? sw : sh;
  const outLen = horizontal ? dw : dh;
  const scale = outLen / inLen;
  const taps = [];
  for (let o = 0; o < outLen; o++) {
    const c = o / scale - 0.5;
    const first = Math.floor(c) - 2;
    const w = [];
    let sum = 0;
    for (let i = first; i <= first + 5; i++) {
      const v = lanczos3(i - c);
      w.push(v);
      sum += v;
    }
    taps.push({ first, w: w.map((v) => v / sum) });
  }
  const out = new Float64Array(dw * dh * 4);
  if (horizontal) {
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < dw; x++) {
        const { first, w } = taps[x];
        for (let ch = 0; ch < 4; ch++) {
          let acc = 0;
          for (let k = 0; k < 6; k++) acc += src[(y * sw + Math.min(sw - 1, Math.max(0, first + k))) * 4 + ch] * w[k];
          out[(y * dw + x) * 4 + ch] = acc;
        }
      }
    }
  } else {
    for (let y = 0; y < dh; y++) {
      const { first, w } = taps[y];
      for (let x = 0; x < dw; x++) {
        for (let ch = 0; ch < 4; ch++) {
          let acc = 0;
          for (let k = 0; k < 6; k++) acc += src[(Math.min(sh - 1, Math.max(0, first + k)) * sw + x) * 4 + ch] * w[k];
          out[(y * dw + x) * 4 + ch] = acc;
        }
      }
    }
  }
  return out;
};

export const upscaleLanczos = (img, width, height) => {
  const n = img.width * img.height;
  const pre = new Float64Array(n * 4);
  for (let p = 0; p < n; p++) {
    const a = img.data[p * 4 + 3] / 255;
    pre[p * 4] = img.data[p * 4] * a;
    pre[p * 4 + 1] = img.data[p * 4 + 1] * a;
    pre[p * 4 + 2] = img.data[p * 4 + 2] * a;
    pre[p * 4 + 3] = img.data[p * 4 + 3];
  }
  const wide = upscaleAxis(pre, img.width, img.height, width, img.height, true);
  const full = upscaleAxis(wide, width, img.height, width, height, false);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    const a = Math.min(255, Math.max(0, full[p * 4 + 3]));
    const f = a > 0 ? 255 / a : 0;
    data[p * 4] = Math.min(255, Math.max(0, Math.round(full[p * 4] * f)));
    data[p * 4 + 1] = Math.min(255, Math.max(0, Math.round(full[p * 4 + 1] * f)));
    data[p * 4 + 2] = Math.min(255, Math.max(0, Math.round(full[p * 4 + 2] * f)));
    data[p * 4 + 3] = Math.round(a);
  }
  return { width, height, data };
};

export const resizeStretch = async (img, width, height) => {
  if (width >= img.width && height >= img.height && (width > img.width || height > img.height)) return upscaleLanczos(img, width, height);
  await ready.resize();
  const out = await resizeRaw(asImageData(img), { width, height, method: 'lanczos3', fitMethod: 'stretch', premultiply: true, linearRGB: false });
  return plain(out);
};

export const resizeKernel = async (img, width, height, method) => {
  await ready.resize();
  const out = await resizeRaw(asImageData(img), { width, height, method, fitMethod: 'stretch', premultiply: true, linearRGB: false });
  return plain(out);
};

export const rasterSvg = async (svg, { width = null, height = null, background = null } = {}) => {
  await ready.resvg();
  const opts = {};
  if (width) opts.fitTo = { mode: 'width', value: width };
  else if (height) opts.fitTo = { mode: 'height', value: height };
  if (background) opts.background = background;
  const r = new Resvg(svg, opts);
  const out = r.render();
  const px = out.pixels;
  const data = new Uint8ClampedArray(px.length);
  for (let i = 0; i < px.length; i += 4) {
    const a = px[i + 3];
    if (a === 0) continue;
    if (a === 255) {
      data[i] = px[i];
      data[i + 1] = px[i + 1];
      data[i + 2] = px[i + 2];
      data[i + 3] = 255;
    } else {
      data[i] = Math.min(255, Math.round((px[i] * 255) / a));
      data[i + 1] = Math.min(255, Math.round((px[i + 1] * 255) / a));
      data[i + 2] = Math.min(255, Math.round((px[i + 2] * 255) / a));
      data[i + 3] = a;
    }
  }
  const img = { width: out.width, height: out.height, data };
  out.free();
  r.free();
  return img;
};

export const svgSize = async (svg) => {
  await ready.resvg();
  const r = new Resvg(svg);
  const size = { width: r.width, height: r.height };
  r.free();
  return size;
};

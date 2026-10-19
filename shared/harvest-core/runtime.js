if (typeof globalThis.ImageData === 'undefined') {
  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      if (typeof data === 'number') {
        this.width = data;
        this.height = width;
        this.data = new Uint8ClampedArray(data * width * 4);
      } else {
        this.data = data;
        this.width = width;
        this.height = height ?? data.length / 4 / width;
      }
      this.colorSpace = 'srgb';
    }
  };
}

export const WASM_FILES = {
  png: '@jsquash/png/codec/pkg/squoosh_png_bg.wasm',
  oxipng: '@jsquash/oxipng/codec/pkg/squoosh_oxipng_bg.wasm',
  resize: '@jsquash/resize/lib/resize/pkg/squoosh_resize_bg.wasm',
  'jpeg-dec': '@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm',
  'webp-dec': '@jsquash/webp/codec/dec/webp_dec.wasm',
  'webp-enc': '@jsquash/webp/codec/enc/webp_enc_simd.wasm',
  'avif-dec': '@jsquash/avif/codec/dec/avif_dec.wasm',
  'avif-enc': '@jsquash/avif/codec/enc/avif_enc.wasm',
  'jxl-dec': '@jsquash/jxl/codec/dec/jxl_dec.wasm',
  'jxl-enc': '@jsquash/jxl/codec/enc/jxl_enc.wasm',
  resvg: '@resvg/resvg-wasm/index_bg.wasm'
};

let source = null;
const compiled = new Map();

export const configureRuntime = (config) => {
  if (config.wasmSource) {
    source = config.wasmSource;
    compiled.clear();
  }
};

export const wasmModule = (id) => {
  if (!compiled.has(id)) {
    if (!source) throw new Error('runtime is not configured: no wasm source');
    compiled.set(
      id,
      Promise.resolve(source(id)).then((src) => (src instanceof WebAssembly.Module ? src : WebAssembly.compile(src)))
    );
  }
  return compiled.get(id);
};

const lazy = (fn) => {
  let p = null;
  return () => (p ||= fn());
};

export const lazyInit = lazy;

export const toHex = (bytes) => {
  let out = '';
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
  return out;
};

export const sha256 = async (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer ?? bytes, bytes.byteOffset ?? 0, bytes.byteLength);
  return toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', view)));
};

export const canonicalJson = (value) => {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
};

export const utf8 = (text) => new TextEncoder().encode(text);
export const text = (bytes) => new TextDecoder().decode(bytes);

export const errText = (e) => {
  const c = e && e.cause;
  const code = c && (c.code || (Array.isArray(c.errors) && c.errors[0] && c.errors[0].code));
  return code || (c && c.message) || (e && e.message) || String(e);
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const pool = async (items, n, fn) => {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
};

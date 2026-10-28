import { qrMatrix } from './qr.js';
const LX_DEBUG = new URLSearchParams(location.search).get('lxdebug') === '1';
const CATALOG_URL = 'links.json';
const catalogRequest = (() => {
  if (!/^https?:$/.test(location.protocol)) return Promise.resolve(null);
  if (window.__lxCatalog) return window.__lxCatalog;
  try {
    return fetch(new URL(CATALOG_URL, location.href), { cache: 'no-cache', credentials: 'same-origin', mode: 'same-origin' }).catch(() => null);
  } catch (e) { return Promise.resolve(null); }
})();
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.compressor = null;
    this.reverb = null;
    this.reverbHP = null;
    this.rvbSend = null;
    this.enabled = false;
    this.scale = [523.25, 587.33, 659.25, 783.99, 880];
    this._lastTick = 0;
    this._lastHover = 0;
  }

  async _boot() {
    if (this.ctx) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const master = ctx.createGain();
      master.gain.value = 0.5;

      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -14;
      compressor.knee.value = 6;
      compressor.ratio.value = 12;
      compressor.attack.value = 0.003;
      compressor.release.value = 0.18;

      master.connect(compressor);
      compressor.connect(ctx.destination);

      const sr = ctx.sampleRate;
      const len = sr * 2.5;
      const buf = ctx.createBuffer(2, len, sr);

      for (let c = 0; c < 2; c++) {
        const d = buf.getChannelData(c);
        for (let i = 0; i < len; i++) {
          d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5) * Math.exp(-i / sr * 0.6);
        }
      }

      const reverb = ctx.createConvolver();
      reverb.buffer = buf;
      const reverbHP = ctx.createBiquadFilter();
      reverbHP.type = 'highpass';
      reverbHP.frequency.value = 300;
      const rvbSend = ctx.createGain();
      rvbSend.gain.value = 0.25;
      reverb.connect(reverbHP);
      reverbHP.connect(rvbSend);
      rvbSend.connect(master);

      this.ctx = ctx;
      this.master = master;
      this.compressor = compressor;
      this.reverb = reverb;
      this.reverbHP = reverbHP;
      this.rvbSend = rvbSend;

      document.addEventListener('visibilitychange', () => {
        if (!this.ctx) return;
        if (document.hidden) { this.ctx.suspend(); }
        else if (this.enabled) { this.ctx.resume(); }
      });
    } catch (e) { if (LX_DEBUG) console.warn(e); }
  }

  _v(freq, type, t, dur, vol, freqEnd) {
    if (!this.ctx) return;
    const jitter = 1 + (Math.random() * 2 - 1) * 0.003;
    const f0 = freq * jitter;
    const f1 = freqEnd ? freqEnd * jitter : null;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.7;
    filter.frequency.setValueAtTime(2800, t);
    filter.frequency.exponentialRampToValueAtTime(1900, t + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + Math.min(0.005, dur * 0.1));
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    filter.connect(env);
    env.connect(this.master);
    if (this.reverb) env.connect(this.reverb);

    [-4, 4].forEach((cents) => {
      const osc = this.ctx.createOscillator();
      osc.type = type || 'sine';
      const ratio = Math.pow(2, cents / 1200);
      osc.frequency.setValueAtTime(f0 * ratio, t);
      if (f1) osc.frequency.exponentialRampToValueAtTime(f1 * ratio, t + dur);
      osc.connect(filter);
      osc.start(t);
      osc.stop(t + dur + 0.1);
    });
  }

  async hover(idx = 0, opts = {}) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (opts.throttle !== false) {
      if (now - this._lastHover < 0.07) return;
      this._lastHover = now;
    }
    const octave = opts.octave || 0;
    const velocity = clamp(opts.velocity || 0, 0, 1);
    const g = 1 - velocity * 0.65;
    const f = this.scale[((idx % this.scale.length) + this.scale.length) % this.scale.length] * Math.pow(2, octave);
    this._v(f, 'sine', now, 0.18, 0.02 * g);
    this._v(f * 2, 'sine', now + 0.008, 0.12, 0.005 * g);
  }

  async switchSweep(fromKey, toKey) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const root = (k) => this.scale[((k % this.scale.length) + this.scale.length) % this.scale.length];
    const from = root(fromKey), to = root(toKey);
    const t = this.ctx.currentTime;
    this._v(from, 'sine', t, 0.18, 0.025, to);
    this._v(from * 1.5, 'sine', t, 0.18, 0.015, to * 1.5);
  }

  async click() {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    this._v(900, 'sine', t, 0.02, 0.03, 300);
    this._v(1046.50, 'sine', t, 0.4, 0.025);
    this._v(1318.51, 'sine', t + 0.02, 0.35, 0.015);
  }

  async tick(idx = 0) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const now = this.ctx.currentTime;
    if (now - this._lastTick < 0.045) return;
    this._lastTick = now;
    const f = this.scale[((idx % this.scale.length) + this.scale.length) % this.scale.length] * 0.5;
    this._v(f, 'sine', now, 0.09, 0.012);
    this._v(f * 3, 'sine', now + 0.004, 0.05, 0.0025);
  }

  _air(t, dur, vol) {
    if (!this.ctx) return;
    const n = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;

    const src = this.ctx.createBufferSource();
    src.buffer = buf;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.9;
    filter.frequency.setValueAtTime(700, t);
    filter.frequency.exponentialRampToValueAtTime(2200, t + dur);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.master);
    if (this.reverb) env.connect(this.reverb);

    src.start(t);
    src.stop(t + dur + 0.05);
  }

  async veil(opening) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const a = opening ? 392 : 587.33;
    const b = opening ? 587.33 : 392;
    this._v(a, 'sine', t, 0.42, 0.016, b);
    this._v(a * 2, 'sine', t + 0.03, 0.3, 0.006, b * 2);
    if (opening) this._air(t, 0.5, 0.02);
  }

  async arpUp() {
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => this._v(f, 'sine', t + i * 0.08, 0.25, 0.04 - i * 0.006));
  }

  async chime(toLight) {
    if (!this.enabled) return;
    await this._boot();
    if (!this.ok()) return;
    const t = this.ctx.currentTime;
    const ns = toLight ? [392, 493.88, 587.33, 698.46] : [698.46, 587.33, 493.88, 392];
    ns.forEach((f, i) => this._v(f, 'sine', t + i * 0.06, 0.25, 0.03));
  }

  ok() { return this.enabled && this.ctx && this.master && this.ctx.state === 'running'; }

  async resume() {
    await this._boot();
    if (this.ctx?.state === 'suspended') await this.ctx.resume();
  }
}

const sfx = new AudioEngine();

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const ICON_RE = /^fa-[a-z0-9]+(?:-[a-z0-9]+){0,6}$/;
const DEFAULT_ICON = 'fa-circle';
const ICON_CDN = 'https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.7.2/svgs/solid/';
const iconDefs = () => document.querySelector('body > svg defs');
const iconState = new Map();

const swapIconRefs = (from, to) => {
  document.querySelectorAll(`use[href="#${from}"]`).forEach((u) => {
    u.removeAttribute('href');
    u.setAttribute('href', `#${to}`);
    const svg = u.parentNode;
    if (svg && svg.classList && from !== to) { svg.classList.remove(from); svg.classList.add(to); }
  });
};

const ensureIcon = (name) => {
  if (!ICON_RE.test(name) || iconState.has(name)) return;
  if (document.getElementById(name)) { iconState.set(name, 'ok'); return; }
  iconState.set(name, 'loading');
  fetch(ICON_CDN + name.slice(3) + '.svg', { mode: 'cors', credentials: 'omit' })
    .then((r) => (r.ok ? r.text() : Promise.reject(r.status)))
    .then((text) => {
      const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
      const src = doc.documentElement;
      const vb = (src.getAttribute('viewBox') || '').trim();
      const paths = [...doc.querySelectorAll('path')].map((p) => p.getAttribute('d')).filter((d) => d && /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/.test(d));
      if (!/^[\d.\s-]+$/.test(vb) || !paths.length) throw new Error('icon');
      const NS = 'http://www.w3.org/2000/svg';
      const sym = document.createElementNS(NS, 'symbol');
      sym.id = name;
      sym.setAttribute('viewBox', vb);
      paths.forEach((d) => {
        const p = document.createElementNS(NS, 'path');
        p.setAttribute('fill', 'currentColor');
        p.setAttribute('d', d);
        sym.appendChild(p);
      });
      iconDefs()?.appendChild(sym);
      iconState.set(name, 'ok');
      swapIconRefs(name, name);
    })
    .catch(() => { iconState.set(name, 'missing'); swapIconRefs(name, DEFAULT_ICON); });
};

const resolveIcon = (name) => {
  if (typeof name !== 'string' || !ICON_RE.test(name)) return DEFAULT_ICON;
  if (iconState.get(name) === 'missing') return DEFAULT_ICON;
  ensureIcon(name);
  return name;
};

const icon = (name, extraClass = '') => {
  const safe = resolveIcon(name);
  const cls = extraClass ? `${extraClass} fas ${safe}` : `fas ${safe}`;
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${safe}"></use></svg>`;
};

const setIcon = (element, name) => {
  if (!element) return;
  const safe = resolveIcon(name);
  const use = element.querySelector('use');
  if (use) use.setAttribute('href', `#${safe}`);
  const kept = (element.getAttribute('class') || '').split(/\s+/).filter((c) => c && !c.startsWith('fa-'));
  kept.push(safe);
  element.setAttribute('class', kept.join(' '));
};

const GLYPH_RE = /^icons\/[a-z0-9-]+\.glyph\.png\?v=[0-9a-f]{8}$/;
const FAV_RE = /^icons\/[a-z0-9-]+\.png\?v=[0-9a-f]{8}$/;
const SYM_RE = /^g-[a-z0-9-]+$/;
const ATLAS_RE = /^icons\/(?:glyph-)?atlas\.[0-9a-f]{8}\.webp$/;
const SPRITE_RE = /^icons\/glyphs\.[0-9a-f]{8}\.svg$/;
const SYMBOL_ID_RE = /^(?:g|fa)-[a-z0-9-]+$/;
const PATH_D_RE = /^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]+$/;
const HEX6 = /^#[0-9a-f]{6}$/i;
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS_KEY = 'lx-icons';
const SPRITE_KEY = 'lx-glyphs';
const isV1Manifest = (m) => !!m && m.version === 1;
const validAtlasRef = (a) => !!a && typeof a === 'object' && ATLAS_RE.test(String(a.file)) && [a.width, a.height, a.cell].every((n) => Number.isInteger(n) && n > 0) && a.width % a.cell === 0 && a.height % a.cell === 0;
const validIconManifest = (m) => {
  if (!m || typeof m !== 'object' || !m.icons || typeof m.icons !== 'object' || Array.isArray(m.icons)) return false;
  if (m.version === 1) return true;
  return m.version === 2 && typeof m.hash === 'string' && validAtlasRef(m.atlas) && (m.glyphAtlas == null || validAtlasRef(m.glyphAtlas)) && !!m.glyphSprite && SPRITE_RE.test(String(m.glyphSprite.file));
};
const readIconsCache = () => {
  try {
    const m = JSON.parse(localStorage.getItem(ICONS_KEY) || 'null');
    return validIconManifest(m) ? m : null;
  } catch (e) { return null; }
};
const iconAssets = { sprite: false, atlas: false, glyphAtlas: false };
const needsFaviconAtlas = (m) => Object.values(m.icons).some((e) => e && e.favicon && !e.glyph && e.status !== 'default');
const inlineSpriteMatches = (m) => {
  const host = document.getElementById('lx-glyphs');
  return !!host && host.dataset.file === m.glyphSprite.file && !!host.querySelector('symbol');
};
const manifestSig = (m) => [m.hash, m.atlas.file, m.glyphSprite.file, m.glyphAtlas ? m.glyphAtlas.file : ''].join('|');
const spriteHost = () => {
  let host = document.getElementById('lx-glyphs');
  if (!host) {
    host = document.createElementNS(SVG_NS, 'svg');
    host.id = 'lx-glyphs';
    host.setAttribute('aria-hidden', 'true');
    host.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    document.body.insertBefore(host, document.body.firstChild);
  }
  return host;
};
const mountSprite = (text) => {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const frag = document.createDocumentFragment();
  doc.querySelectorAll('symbol').forEach((src) => {
    const id = src.getAttribute('id') || '';
    const vb = (src.getAttribute('viewBox') || '').trim();
    if (!SYMBOL_ID_RE.test(id) || !/^[\d.\s-]+$/.test(vb)) return;
    const paths = [...src.querySelectorAll('path')].filter((pa) => PATH_D_RE.test(pa.getAttribute('d') || ''));
    if (!paths.length) return;
    const sym = document.createElementNS(SVG_NS, 'symbol');
    sym.id = id;
    sym.setAttribute('viewBox', vb);
    paths.forEach((pa) => {
      const el = document.createElementNS(SVG_NS, 'path');
      el.setAttribute('d', pa.getAttribute('d'));
      if (pa.getAttribute('fill-rule') === 'evenodd') el.setAttribute('fill-rule', 'evenodd');
      if (pa.getAttribute('fill') === 'currentColor') el.setAttribute('fill', 'currentColor');
      if (/^(?:0|1|0?\.\d{1,3})$/.test(pa.getAttribute('fill-opacity') || '')) el.setAttribute('fill-opacity', pa.getAttribute('fill-opacity'));
      sym.appendChild(el);
    });
    frag.appendChild(sym);
  });
  spriteHost().replaceChildren(frag);
};
const readSpriteCache = (file) => {
  try {
    const c = JSON.parse(localStorage.getItem(SPRITE_KEY) || 'null');
    return c && c.file === file && typeof c.text === 'string' ? c.text : null;
  } catch (e) { return null; }
};
const writeSpriteCache = (m, text) => {
  try { localStorage.setItem(SPRITE_KEY, JSON.stringify({ file: m.glyphSprite.file, hash: m.hash, text })); } catch (e) { if (LX_DEBUG) console.warn(e); }
};
const fetchSpriteText = (m) => {
  const cached = readSpriteCache(m.glyphSprite.file);
  if (cached) return Promise.resolve(cached);
  return fetch(m.glyphSprite.file, { credentials: 'same-origin', mode: 'same-origin' }).then((r) => (r.ok ? r.text() : Promise.reject(r.status))).catch(() => null);
};
const ensureGlyphSprite = (m) => fetchSpriteText(m).then((text) => {
  if (!text) return false;
  mountSprite(text);
  writeSpriteCache(m, text);
  iconAssets.sprite = true;
  return true;
});
const decodeAtlas = (file) => new Promise((resolve) => {
  const img = new Image();
  img.decoding = 'async';
  img.src = file;
  if (!img.decode) { img.onload = () => resolve(true); img.onerror = () => resolve(false); return; }
  img.decode().then(() => resolve(true), () => resolve(false));
});
const applyAtlas = (m) => {
  const st = document.documentElement.style;
  const a = m.atlas;
  st.setProperty('--lx-atlas', `url(${a.file})`);
  st.setProperty('--an', String(a.width / a.cell));
  st.setProperty('--arows', String(a.height / a.cell));
  st.setProperty('--adx', String(Math.max(1, a.width / a.cell - 1)));
  st.setProperty('--ady', String(Math.max(1, a.height / a.cell - 1)));
};
const applyGlyphAtlas = (m) => {
  if (!m.glyphAtlas) return;
  const st = document.documentElement.style;
  const a = m.glyphAtlas;
  st.setProperty('--lx-gatlas', `url(${a.file})`);
  st.setProperty('--gn', String(a.width / a.cell));
  st.setProperty('--grows', String(a.height / a.cell));
  st.setProperty('--gdx', String(Math.max(1, a.width / a.cell - 1)));
  st.setProperty('--gdy', String(Math.max(1, a.height / a.cell - 1)));
};
const idleRun = (fn) => (window.requestIdleCallback ? window.requestIdleCallback(fn) : setTimeout(fn, 200));
const primeIconAssets = () => {
  const m = iconManifest;
  if (!m || isV1Manifest(m)) return;
  if (inlineSpriteMatches(m)) iconAssets.sprite = true;
  else {
    const text = readSpriteCache(m.glyphSprite.file);
    if (text) { mountSprite(text); iconAssets.sprite = true; }
  }
  const settled = () => { if (document.querySelector('#appGrid .app-card')) refreshMarks(); };
  if (m.glyphAtlas) {
    decodeAtlas(m.glyphAtlas.file).then((ok) => {
      if (!ok || iconManifest !== m) return;
      applyGlyphAtlas(m);
      iconAssets.glyphAtlas = true;
      settled();
    });
  }
  if (needsFaviconAtlas(m)) {
    idleRun(() => decodeAtlas(m.atlas.file).then((ok) => {
      if (!ok || iconManifest !== m) return;
      applyAtlas(m);
      iconAssets.atlas = true;
      settled();
    }));
  }
};
let iconManifest = readIconsCache();
if (isV1Manifest(iconManifest)) { iconManifest = null; try { localStorage.removeItem(ICONS_KEY); } catch (e) { if (LX_DEBUG) console.warn(e); } }
primeIconAssets();
const markKey = (app, variant) => (variant ? `${app.id}--${variant.id}` : String(app.id).replace('::', '--'));
const iconEntry = (key) => {
  if (location.protocol === 'file:' || !iconManifest || !Object.hasOwn(iconManifest.icons, key)) return null;
  const e = iconManifest.icons[key];
  return e && typeof e === 'object' ? e : null;
};
const cellRef = (a, pos, atlas) => (a && pos && Number.isInteger(pos.x) && Number.isInteger(pos.y) && pos.x >= 0 && pos.y >= 0 && pos.x < a.width && pos.y < a.height ? { atlas, c: pos.x / a.cell, r: pos.y / a.cell, sig: `${atlas}:${pos.x},${pos.y}` } : null);
const glyphRefFor = (key) => {
  const e = iconEntry(key);
  if (!e || e.status === 'default') return null;
  if (isV1Manifest(iconManifest)) return typeof e.glyph === 'string' && GLYPH_RE.test(e.glyph) ? { url: e.glyph, sig: `v1:${e.glyph}` } : null;
  const g = e.glyph;
  if (!g || typeof g !== 'object') return null;
  if (typeof g.symbol === 'string' && SYM_RE.test(g.symbol)) return iconAssets.sprite && document.getElementById(g.symbol) ? { sym: g.symbol, sig: `s:${g.symbol}` } : null;
  return iconAssets.glyphAtlas ? cellRef(iconManifest.glyphAtlas, g.atlas, 'g') : null;
};
const faviconRefFor = (key) => {
  const e = iconEntry(key);
  if (!e || e.status === 'default') return null;
  if (isV1Manifest(iconManifest)) return typeof e.favicon === 'string' && FAV_RE.test(e.favicon) ? { url: e.favicon, sig: `v1:${e.favicon}` } : null;
  return iconAssets.atlas ? cellRef(iconManifest.atlas, e.favicon, 'f') : null;
};
const findAppById = (id) => {
  for (const cat of categories) {
    const hit = cat.apps.find((a) => a.id === id);
    if (hit) return hit;
  }
  return null;
};
const tintOf = (key) => {
  const e = iconEntry(key);
  return e && e.status !== 'default' && Array.isArray(e.tint) && e.tint.length === 3 && e.tint.every((c) => typeof c === 'string' && HEX6.test(c)) ? e.tint : null;
};
const appGradient = (app, variant) => {
  const base = findAppById(app.parentId || app.id) || app;
  const vs = Array.isArray(base.variants) && base.variants.length ? base.variants : null;
  if (!vs) return tintOf(String(base.id)) || app.gradient;
  const pick = variant || (app.parentId && vs[app.variantIndex]) || vs[Number(base.defaultVariant) || 0];
  return tintOf(`${base.id}--${pick.id}`) || base.gradient || app.gradient;
};
const appMark = (app, variant) => {
  const base = findAppById(app.parentId || app.id) || app;
  const hasVariants = Array.isArray(base.variants) && base.variants.length > 0;
  const keys = hasVariants ? base.variants.map((v) => `${base.id}--${v.id}`) : [String(base.id)];
  const pick = variant || (hasVariants && !app.parentId ? base.variants[Number(base.defaultVariant) || 0] : null);
  const key = markKey(app, pick);
  const glyph = keys.every((k) => glyphRefFor(k)) ? glyphRefFor(key) : null;
  if (glyph) return { kind: 'glyph', ref: glyph };
  const fav = keys.every((k) => faviconRefFor(k)) ? faviconRefFor(key) : null;
  if (fav) return { kind: 'favicon', ref: fav };
  return { kind: 'fa', ref: null };
};
const glyphHtml = (m, cls) => {
  const c = cls ? `${cls} ` : '';
  const r = m.ref;
  if (r.url) return `<span class="${c}lx-glyph" data-ms="${r.sig}" style="--glyph:url(${r.url})" aria-hidden="true"></span>`;
  if (r.sym) return `<svg class="${c}lx-glyph mark-glyph" data-ms="${r.sig}" aria-hidden="true" focusable="false"><use href="#${r.sym}"></use></svg>`;
  return `<span class="${c}lx-glyph mark-glyph-atlas" data-ms="${r.sig}" style="--ac:${r.c};--ar:${r.r}" aria-hidden="true"></span>`;
};
const favHtml = (m, cls) => {
  const c = cls ? `${cls} ` : '';
  const r = m.ref;
  if (r.url) return `<img class="${c}lx-fav" data-ms="${r.sig}" src="${r.url}" alt="" decoding="async" draggable="false">`;
  return `<span class="${c}lx-fav mark-fav" data-ms="${r.sig}" style="--ac:${r.c};--ar:${r.r}" aria-hidden="true"></span>`;
};
const markHtml = (app, variant, iconName, cls) => {
  const m = appMark(app, variant);
  if (m.kind === 'glyph') return glyphHtml(m, cls);
  if (m.kind === 'favicon') return favHtml(m, cls);
  return icon(iconName, cls);
};
const wrapOpen = (app, variant) => `<div class="app-icon-wrapper" data-mark="${appMark(app, variant).kind}">`;
const markKind = (n) => (n.classList.contains('lx-glyph') ? 'glyph' : n.classList.contains('lx-fav') ? 'favicon' : 'fa');
const retileIcon = (host, app, variant, iconName, cls = 'app-icon') => {
  const m = appMark(app, variant);
  if (host.classList.contains('app-icon-wrapper') || host.classList.contains('ctx-head-icon')) host.dataset.mark = m.kind;
  const cur = host.querySelector(cls ? '.' + cls : ':scope > svg, :scope > .lx-glyph, :scope > .lx-fav');
  if (cur && markKind(cur) === m.kind) {
    if (m.kind === 'fa') { setIcon(cur, iconName); return cur; }
    const sig = m.ref.sig;
    if (cur.dataset.ms === sig) return cur;
    if (m.ref.url && m.kind === 'glyph' && cur.tagName === 'SPAN' && !cur.classList.contains('mark-glyph-atlas')) {
      cur.style.setProperty('--glyph', `url(${m.ref.url})`);
      cur.dataset.ms = sig;
      return cur;
    }
    if (m.ref.url && m.kind === 'favicon' && cur.tagName === 'IMG') {
      if (cur.getAttribute('src') !== m.ref.url) cur.setAttribute('src', m.ref.url);
      cur.dataset.ms = sig;
      return cur;
    }
  }
  const html = markHtml(app, variant, iconName, cls);
  if (!cur) { host.insertAdjacentHTML('afterbegin', html); return host.firstElementChild; }
  cur.insertAdjacentHTML('afterend', html);
  const next = cur.nextElementSibling;
  cur.remove();
  return next;
};

const variantRuleIds = new Set();
const ensureVariantRule = (id) => {
  if (variantRuleIds.has(id)) return;
  variantRuleIds.add(id);
  let el = document.getElementById('lx-variant-rules');
  if (!el) {
    el = document.createElement('style');
    el.id = 'lx-variant-rules';
    document.head.appendChild(el);
  }
  el.appendChild(document.createTextNode(`.app-card[data-active-variant="${id}"] .mark-stack > [data-variant="${id}"]{opacity:1;visibility:visible;transition:opacity var(--lx-version-ms,120ms) cubic-bezier(0.2,0,0,1)}`));
};
const stackableVariants = (app) => Array.isArray(app.variants) && app.variants.length > 1 && app.variants.every((v) => /^[a-z0-9-]+$/i.test(String(v.id)));
const renderMarkStack = (app, cls) => {
  app.variants.forEach((v) => ensureVariantRule(String(v.id)));
  const items = app.variants.map((v) => markHtml(app, v, v.icon, cls).replace(/^<([a-z]+)/, `<$1 data-variant="${String(v.id)}"`));
  return `<span class="mark-stack" aria-hidden="true">${items.join('')}</span>`;
};
const cardMarkHtml = (app, activeVariant, iconName, cls, stacked) => (stacked ? renderMarkStack(app, cls) : markHtml(app, activeVariant, iconName, cls));
const setActiveVariant = (cardEl, variantId, patch) => {
  cardEl.dataset.activeVariant = variantId;
  if (!patch) return;
  const link = cardEl.querySelector('.card-link-overlay');
  if (link) {
    link.href = patch.href;
    link.setAttribute('aria-label', patch.label);
  }
  const meta = cardEl.querySelector('.card-meta');
  if (meta) meta.textContent = patch.host;
  if (patch.c1) cardEl.style.setProperty('--c1', patch.c1);
};
const refreshStack = (card, app) => {
  const wrap = card.querySelector('.app-icon-wrapper');
  const mark = card.querySelector('.card-glyph');
  const active = app.variants.find((v) => String(v.id) === card.dataset.activeVariant) || app.variants[0];
  wrap.dataset.mark = appMark(app, active).kind;
  const old = wrap.querySelector('.mark-stack');
  old.outerHTML = renderMarkStack(app, 'app-icon');
  const fresh = wrap.querySelector('.mark-stack');
  fresh.style.opacity = '0';
  requestAnimationFrame(() => requestAnimationFrame(() => { fresh.style.opacity = ''; }));
  if (mark) mark.innerHTML = renderMarkStack(app, '');
};

const warmedOrigins = new Set();
const MAX_WARMED_ORIGINS = 6;

const warmOrigin = (url) => {
  if (!url || warmedOrigins.size >= MAX_WARMED_ORIGINS) return;
  let origin;
  try {
    origin = new URL(url, window.location.href).origin;
  } catch (e) {
    return;
  }
  if (warmedOrigins.has(origin)) return;
  warmedOrigins.add(origin);
  try {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    document.head.appendChild(link);
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

const attachDestinationWarming = (linkEl) => {
  if (!linkEl) return;
  let warmDwellTimer = null;
  linkEl.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    warmDwellTimer = setTimeout(() => warmOrigin(linkEl.href), 120);
  });
  linkEl.addEventListener('pointerleave', () => { clearTimeout(warmDwellTimer); });
  linkEl.addEventListener('focusin', () => warmOrigin(linkEl.href));
};

let paletteWarmTimer = null;
const scheduleWarmActiveEntry = () => {
  clearTimeout(paletteWarmTimer);
  const entry = paletteItems[paletteActiveIndex];
  if (!entry) return;
  paletteWarmTimer = setTimeout(() => warmOrigin(entry.app.url), 120);
};

const categories = [];

const STRINGS = {
  skipToContent: { ar: 'تخطي إلى المحتوى', en: 'Skip to content' },
  metaDescription: { ar: 'لوحة انطلاق للأدوات والروابط الداخلية', en: 'Launchpad for internal tools and links' },
  categoriesLabel: { ar: 'التصنيفات', en: 'Categories' },
  commandPaletteLabel: { ar: 'لوحة الأوامر', en: 'Command Palette' },
  resultsLabel: { ar: 'النتائج', en: 'Results' },
  actionsLabel: { ar: 'الإجراءات', en: 'Actions' },
  searchPlaceholder: { ar: 'ابحث عن تطبيق أو أداة…', en: 'Search for an app or tool…' },
  barSearchLabel: { ar: 'ابحث في كل الأدوات…', en: 'Search all tools…' },
  barSearchLabelShort: { ar: 'ابحث…', en: 'Search…' },
  quickSearch: { ar: 'بحث سريع', en: 'Quick search' },
  quickLaunch: { ar: 'وصول سريع', en: 'Quick launch' },
  soundEnable: { ar: 'تفعيل الصوت', en: 'Enable sound' },
  soundMute: { ar: 'كتم الصوت', en: 'Mute sound' },
  themeToDark: { ar: 'التبديل إلى المظهر الداكن', en: 'Switch to dark mode' },
  themeToLight: { ar: 'التبديل إلى المظهر الفاتح', en: 'Switch to light mode' },
  zenEnter: { ar: 'تفعيل الوضع الهادئ', en: 'Enter Zen mode' },
  zenExit: { ar: 'إنهاء الوضع الهادئ', en: 'Exit Zen mode' },
  zenEntered: { ar: 'تم تفعيل الوضع الهادئ', en: 'Zen mode enabled' },
  zenExited: { ar: 'تم إنهاء الوضع الهادئ', en: 'Zen mode disabled' },
  hintNavigate: { ar: 'تنقل', en: 'Navigate' },
  hintSwitchPanel: { ar: 'تبديل اللوحة', en: 'Switch panel' },
  hintOpen: { ar: 'فتح', en: 'Open' },
  hintClose: { ar: 'إغلاق', en: 'Close' },
  badgeNew: { ar: 'جديد', en: 'New' },
  badgeClosed: { ar: 'مغلق', en: 'Closed' },
  altShortcutHint: { ar: 'اضغط {n} للفتح', en: 'Press {n} to open' },
  closedReasonDefault: { ar: 'هذا الرابط مغلق مؤقتًا وقد لا يعمل عند فتحه.', en: 'This link is temporarily closed and may not work.' },
  chooseVersionOf: { ar: 'اختر نسخة', en: 'Choose a version of' },
  actionNewTab: { ar: 'فتح في تبويب جديد', en: 'Open in new tab' },
  actionSameTab: { ar: 'فتح في نفس التبويب', en: 'Open in same tab' },
  actionCopyLink: { ar: 'نسخ الرابط', en: 'Copy link' },
  actionCopyTitle: { ar: 'نسخ الاسم', en: 'Copy name' },
  actionReveal: { ar: 'إظهار في الشبكة', en: 'Reveal in grid' },
  linkCopied: { ar: 'تم نسخ الرابط', en: 'Link copied' },
  copyFailed: { ar: 'تعذر النسخ', en: "Couldn't copy" },
  nameCopied: { ar: 'تم نسخ الاسم', en: 'Name copied' },
  noResults: { ar: 'لا توجد نتائج', en: 'No results' },
  ctxOpen: { ar: 'فتح', en: 'Open' },
  ctxCopyLink: { ar: 'نسخ الرابط', en: 'Copy link' },
  ctxCopyName: { ar: 'نسخ الاسم', en: 'Copy name' },
  ctxDetails: { ar: 'عرض التفاصيل', en: 'Show details' },
  ctxVersions: { ar: 'النسخة', en: 'Version' },
  ctxDefault: { ar: 'افتراضي', en: 'Default' },
  ctxCurrent: { ar: 'الحالية', en: 'Current' },
  ctxUseVersion: { ar: 'اعتمادها للبطاقة', en: 'Keep on card' },
  ctxOpenWith: { ar: 'الفتح الافتراضي', en: 'Default open' },
  openMode: { ar: 'فتح الروابط', en: 'Open links' },
  openMode_new: { ar: 'تبويب جديد', en: 'New tab' },
  openMode_same: { ar: 'نفس التبويب', en: 'Same tab' },
  openModeHint_new: { ar: 'تبقى LinkExpress مفتوحة', en: 'Keeps LinkExpress open' },
  openModeHint_same: { ar: 'يستبدل هذه الصفحة', en: 'Replaces this page' },
  openModeSet: { ar: 'الروابط تُفتح في {m}', en: 'Links open in {m}' },
  cmdOpenMode: { ar: 'فتح الروابط في {m}', en: 'Open links in {m}' },
  emptyCategory: { ar: 'لا توجد عناصر هنا بعد', en: 'Nothing here yet' },
  catalogUnavailable: { ar: 'تعذر تحميل قائمة الأدوات', en: 'Could not load the tool list' },
  resultsCountLabel: { ar: 'نتيجة', en: 'results' },
  noResultsMatch: { ar: 'لا توجد نتائج مطابقة', en: 'No matching results' },
  recentGroup: { ar: 'الأخيرة', en: 'Recent' },
  allGroup: { ar: 'الكل', en: 'All' },
  tryGroup: { ar: 'جرّب', en: 'Try' },
  langSwitchToEn: { ar: 'التبديل إلى الإنجليزية', en: 'Switch to English' },
  langSwitchToAr: { ar: 'التبديل إلى العربية', en: 'Switch to Arabic' },
  dataMenu: { ar: 'بياناتي', en: 'My data' },
  dataImport: { ar: 'استيراد روابط (JSON)', en: 'Import links (JSON)' },
  dataExport: { ar: 'تصدير بياناتي', en: 'Export my data' },
  dataReset: { ar: 'حذف روابطي', en: 'Remove my links' },
  userCategory: { ar: 'روابطي', en: 'My Links' },
  importConfirm: { ar: 'سيتم استبدال روابطك الحالية ({m}) بـ {n} رابط من الملف. متابعة؟', en: 'Replace your {m} current link(s) with {n} from this file?' },
  importConfirmNew: { ar: 'إضافة {n} رابط من الملف إلى «روابطي»؟', en: 'Add {n} link(s) from this file to “My Links”?' },
  importDone: { ar: 'تم استيراد {n} رابط', en: 'Imported {n} link(s)' },
  importPrefsDone: { ar: 'تم استيراد إعداداتك', en: 'Your settings were imported' },
  importSkipped: { ar: '(تم تجاهل {n} غير صالح)', en: '({n} invalid skipped)' },
  exportDone: { ar: 'تم تصدير بياناتك', en: 'Your data was exported' },
  resetConfirm: { ar: 'حذف كل روابطك المستوردة؟', en: 'Remove all your imported links?' },
  resetDone: { ar: 'تم حذف روابطك', en: 'Your links were removed' },
  importTooLarge: { ar: 'الملف أكبر من {n} كيلوبايت.', en: 'File is larger than {n} KB.' },
  importTooMany: { ar: 'الحد الأقصى {n} رابطًا.', en: 'Maximum is {n} links.' },
  importEmpty: { ar: 'لا توجد روابط صالحة (يجب أن تبدأ بـ https://).', en: 'No valid links (must start with https://).' },
  importInvalid: { ar: 'ملف غير صالح.', en: 'Invalid file.' },
  storageFailed: { ar: 'تعذر الحفظ في المتصفح.', en: "Couldn't save in this browser." },
  commandsGroup: { ar: 'الأوامر', en: 'Commands' },
  commandKind: { ar: 'أمر', en: 'Command' },
  actionRun: { ar: 'تنفيذ الأمر', en: 'Run command' },
  cmdGoTo: { ar: 'الانتقال إلى', en: 'Go to' },
  hintCommands: { ar: 'الأوامر', en: 'Commands' },
  cmdPlaceholder: { ar: 'اكتب أمرًا…', en: 'Type a command…' },
  factRun: { ar: 'التنفيذ', en: 'Run' },
  factLink: { ar: 'الرابط', en: 'Link' },
  factActivity: { ar: 'النشاط', en: 'Activity' },
  factShortcut: { ar: 'الاختصار', en: 'Shortcut' },
  statOpened: { ar: 'فُتح {n} مرة', en: 'Opened {n}×' },
  statNever: { ar: 'لم يُفتح بعد', en: 'Not opened yet' },
  barSearchCount: { ar: 'ابحث في {n} أداة…', en: 'Search {n} tools…' },
  refreshCatalog: { ar: 'تحديث الأدوات من links.json', en: 'Refresh tools from links.json' },
  refreshUpdated: { ar: 'تم تحديث قائمة الأدوات', en: 'Tool list updated' },
  refreshSame: { ar: 'القائمة محدّثة بالفعل', en: 'Already up to date' },
  refreshMissing: { ar: 'لم يُعثر على links.json، تم استخدام النسخة المدمجة', en: 'links.json not found, using the built-in list' },
  refreshOffline: { ar: 'التحديث يتطلب فتح الموقع عبر الإنترنت', en: 'Refresh needs the site to be served over http(s)' },
  refreshFailed: { ar: 'تعذر التحديث، تم الإبقاء على النسخة الحالية', en: 'Refresh failed, kept the current list' },
  scopesLabel: { ar: 'النطاق', en: 'Scope' },
  scopeAll: { ar: 'الكل', en: 'All' },
  hintScope: { ar: 'النطاق', en: 'Scope' },
  lookMenu: { ar: 'التفضيلات', en: 'Preferences' },
  lookColors: { ar: 'الألوان', en: 'Colors' },
  lookCorners: { ar: 'الزوايا', en: 'Corners' },
  palette_curated: { ar: 'منسقة', en: 'Curated' },
  palette_muted: { ar: 'هادئة', en: 'Muted' },
  palette_vivid: { ar: 'زاهية', en: 'Vivid' },
  palette_mono: { ar: 'أحادية', en: 'Monochrome' },
  corners_soft: { ar: 'ناعمة', en: 'Soft' },
  corners_balanced: { ar: 'متوازنة', en: 'Balanced' },
  corners_crisp: { ar: 'حادة', en: 'Crisp' },
  lookLayout: { ar: 'التخطيط', en: 'Layout' },
  view_bento: { ar: 'بطاقات', en: 'Bento' },
  view_list: { ar: 'قائمة', en: 'List' },
  view_icons: { ar: 'أيقونات', en: 'Icons' },
  cmdSwitchView: { ar: 'تبديل التخطيط', en: 'Switch layout' },
  viewChanged: { ar: 'تم تغيير التخطيط إلى {m}', en: 'Layout changed to {m}' },
  cmdNextColors: { ar: 'الألوان التالية', en: 'Next colors' },
  cmdNextCorners: { ar: 'الزوايا التالية', en: 'Next corners' },
  actionQr: { ar: 'رمز QR', en: 'QR code' },
  ctxQr: { ar: 'عرض رمز QR', en: 'Show QR code' },
  qrPng: { ar: 'تنزيل PNG', en: 'Download PNG' },
  qrSvg: { ar: 'تنزيل SVG', en: 'Download SVG' },
  qrImage: { ar: 'نسخ الصورة', en: 'Copy image' },
  qrImageShort: { ar: 'صورة', en: 'Image' },
  qrReady: { ar: 'الرمز جاهز', en: 'QR ready' },
  qrImageCopied: { ar: 'تم نسخ الصورة', en: 'Image copied' },
  qrShare: { ar: 'مشاركة', en: 'Share' },
  qrHint: { ar: 'امسح الرمز بكاميرا الهاتف لفتح الرابط', en: 'Scan with a phone camera to open the link' },
  qrTooLong: { ar: 'الرابط أطول من أن يُعرض كرمز QR', en: 'This link is too long for a QR code' },
  qrSaved: { ar: 'تم تنزيل الرمز', en: 'QR code downloaded' },
  cmdShareSite: { ar: 'مشاركة LinkExpress برمز QR', en: 'Share LinkExpress as a QR code' }
};

const OPEN_MODES = ['new', 'same'];
const openMode = () => {
  let v = null;
  try { v = localStorage.getItem('lx-open'); } catch (e) { if (LX_DEBUG) console.warn(e); }
  return v === 'same' ? 'same' : 'new';
};
const otherOpenMode = (m = openMode()) => (m === 'same' ? 'new' : 'same');
const openModeAction = (m = openMode()) => (m === 'same' ? 'same-tab' : 'new-tab');
const openModeIcon = (m = openMode()) => (m === 'same' ? 'fa-arrow-right-to-bracket' : 'fa-arrow-up-right-from-square');
const openInSameTab = (url) => { if (url) window.location.href = url; };
const openUrlWith = (url, m = openMode()) => (m === 'same' ? openInSameTab(url) : openInNewTab(url));

let lang = 'ar';
const t = (key) => { const e = STRINGS[key]; return e ? (e[lang] ?? e.ar) : key; };
const loc = (obj) => obj ? (obj[lang] ?? obj.ar ?? obj.en ?? '') : '';

const getStoredLang = () => {
  try { return localStorage.getItem('lx-lang'); } catch (e) { return null; }
};

const resolveInitialLang = () => {
  const stored = getStoredLang();
  if (stored === 'ar' || stored === 'en') return stored;
  return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'ar';
};

const SCHEMA = 2;
const LEGACY_IDS = {
  'خارجي 2': 'ledger-form',
  'خارجي 0': 'parser',
  'مجموعات دوائية': 'workspace',
  'لستة الادوية': 'drug-list',
  'المنفذ والتحمل': 'paid-calculator',
  'بروتوكولات الصرف': 'protocols',
  'فهرس الادوية': 'index-builder',
  'الرقم القومي والتاريخ': 'id-dates',
  'عائد الاستثمار': 'roi',
  'تحليل البيانات': 'data-analysis',
  'بيان جهات متعاقدة': 'entity-tracker',
  'تقارير': 'to-do',
  'دفتر الحركة': 'dafter',
  'قسمة العوائد': 'qisma-mizan'
};

(function migrate() {
  try {
    if (Number(localStorage.getItem('lx-schema')) >= SCHEMA) return;
    for (const [ar, id] of Object.entries(LEGACY_IDS)) {
      const v = localStorage.getItem('lx-variant-' + ar);
      if (v !== null) {
        localStorage.setItem('lx-variant-' + id, v);
        localStorage.removeItem('lx-variant-' + ar);
      }
    }
    const recents = JSON.parse(localStorage.getItem('lx-recents') || '[]');
    if (Array.isArray(recents)) {
      localStorage.setItem('lx-recents',
        JSON.stringify(recents.map(tt => LEGACY_IDS[tt] || tt).filter(x => typeof x === 'string')));
    }
    localStorage.setItem('lx-schema', String(SCHEMA));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
})();

let baseManifest = null;
try {
  const href = document.querySelector('link[rel="manifest"]').getAttribute('href');
  baseManifest = JSON.parse(decodeURIComponent(href.slice(href.indexOf(',') + 1)));
} catch (e) { if (LX_DEBUG) console.warn(e); }

const applyManifest = () => {
  if (!baseManifest) return;
  const link = document.querySelector('link[rel="manifest"]');
  if (!link) return;
  const m = {
    ...baseManifest,
    name: 'LinkExpress',
    short_name: 'LinkExpress',
    description: t('metaDescription'),
    dir: lang === 'ar' ? 'rtl' : 'ltr',
    lang
  };
  link.setAttribute('href', 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(m)));
};

const Motion = (() => {
  const subs = new Set();
  let raf = null, last = 0;

  const tick = (now) => {
    const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
    last = now;
    if (dt > 0) for (const s of subs) s.fixed?.(dt);
    let alive = false;
    for (const s of subs) { if (s.render?.(now / 1000, 1) !== false) alive = true; }
    raf = alive && !document.hidden ? requestAnimationFrame(tick) : null;
  };

  return {
    add(s) { subs.add(s); this.wake(); },
    remove(s) { subs.delete(s); },
    wake() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } },
    get subCount() { return subs.size; },
    get awake() { return !!raf; }
  };
})();

document.addEventListener('visibilitychange', () => { if (!document.hidden) Motion.wake(); });


const MQ = (() => {
  const specs = {
    reducedMotion: '(prefers-reduced-motion: reduce)',
    hoverFine: '(hover: hover) and (pointer: fine)',
    reducedTransparency: '(prefers-reduced-transparency: reduce)',
    narrow: '(max-width: 1024px)'
  };
  const state = {};
  for (const key in specs) {
    const mql = window.matchMedia(specs[key]);
    state[key] = mql.matches;
    mql.addEventListener('change', (e) => { state[key] = e.matches; });
  }
  return state;
})();

const EASE_LUX = 'cubic-bezier(0.16, 1, 0.3, 1)';
const nativeAnimate = Element.prototype.animate;
Element.prototype.animate = function (keyframes, options) {
  if (!MQ.reducedMotion) return nativeAnimate.call(this, keyframes, options);
  const instant = typeof options === 'number' || options == null ? { duration: 0 } : { ...options, duration: 0, delay: 0, endDelay: 0 };
  return nativeAnimate.call(this, keyframes, instant);
};
const isLowEnd = () => navigator.hardwareConcurrency <= 4 || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4);
const MOTION_SHARED = { outEase: 'cubic-bezier(0.4, 0, 0.7, 0.2)', travelOut: 10, travelIn: 14, liftIn: 8, scaleOut: 0.988, scaleIn: 0.982 };
const MOTION_LEGACY = {
  ...MOTION_SHARED,
  tab: { outMs: 190, inMs: 620, inDelay: 60, stagger: 150, railMs: 460, clampMs: 0 },
  view: { outMs: 190, inMs: 620, inDelay: 60, stagger: 150, railMs: 460, clampMs: 0 },
  version: { inMs: 240, clampMs: 0 },
  paletteOpen: { inMs: 420 },
  paletteClose: { outMs: 250 },
  qr: { inMs: 420, outMs: 250, variantMs: 240 },
  crossfade: { inMs: 280 },
  theme: { inMs: 460 },
  boot: { inMs: 0, offset: 120, spread: 260 },
  hover: { inMs: 0 }
};
const MOTION_NEW = {
  ...MOTION_SHARED,
  tab: { outMs: 120, inMs: 220, inDelay: 60, stagger: 0, railMs: 220, clampMs: 220 },
  view: { outMs: 120, inMs: 220, inDelay: 60, stagger: 0, railMs: 220, clampMs: 220 },
  version: { inMs: 120, clampMs: 120 },
  paletteOpen: { inMs: 200 },
  paletteClose: { outMs: 140 },
  qr: { inMs: 220, outMs: 150, variantMs: 160 },
  crossfade: { inMs: 200 },
  theme: { inMs: 320 },
  boot: { inMs: 360, offset: 120, spread: 180 },
  hover: { inMs: 160 }
};
const MOTION = document.documentElement.dataset.motion === 'legacy' ? MOTION_LEGACY : MOTION_NEW;
document.documentElement.style.setProperty('--lx-version-ms', `${MOTION.version.inMs}ms`);
document.documentElement.style.setProperty('--lx-qr-in-ms', `${MOTION.qr.inMs}ms`);
document.documentElement.style.setProperty('--lx-qr-out-ms', `${MOTION.qr.outMs}ms`);
document.documentElement.style.setProperty('--lx-qr-variant-ms', `${MOTION.qr.variantMs}ms`);
if (MOTION.boot.inMs) document.documentElement.style.setProperty('--lx-boot-ms', `${MOTION.boot.inMs}ms`);
if (MOTION.hover.inMs) document.documentElement.style.setProperty('--lx-hover-ms', `${MOTION.hover.inMs}ms`);
let scrollingTimer = 0;
const onAnyScroll = () => {
  const root = document.documentElement;
  if (!root.classList.contains('lx-scrolling')) root.classList.add('lx-scrolling');
  clearTimeout(scrollingTimer);
  scrollingTimer = setTimeout(() => { root.classList.remove('lx-scrolling'); pointerFieldDirty = true; Motion.wake(); }, 150);
};
document.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
if (isLowEnd()) document.documentElement.setAttribute('data-lowend', '');
let switchClampTimer = 0;
const clampTargets = () => document.querySelectorAll('.lx-bar, .controls-pill');
const switchClamp = (kind) => {
  const m = MOTION[kind];
  if (!m || !m.clampMs || MQ.reducedMotion) return;
  clampTargets().forEach((el) => {
    el.style.setProperty('--lx-switch-ms', `${m.clampMs}ms`);
    el.classList.add('lx-switching');
  });
  clearTimeout(switchClampTimer);
  switchClampTimer = setTimeout(() => clampTargets().forEach((el) => el.classList.remove('lx-switching')), (m.inDelay || 0) + (m.inMs || 0) + 100);
};
const EASE_ACCEL = 'cubic-bezier(0.4, 0, 1, 1)';

class Spring {
  constructor(k = 190, c = 24, v = 0, scale = 1, px = false) {
    this.k = k; this.c = c; this.v = v; this.dv = 0; this.to = v;
    this.scale = scale; this.px = px;
  }
  fixed(dt) {
    let t = Math.min(dt, 1 / 20);
    while (t > 1e-6) {
      const h = Math.min(t, 1 / 240);
      const a = -this.k * (this.v - this.to) - this.c * this.dv;
      this.dv += a * h;
      this.v += this.dv * h;
      t -= h;
    }
  }

  snap() { this.v = this.to; this.dv = 0; }
  get settled() {
    const eps = this.px ? Math.max(1e-3 * this.scale, 0.5) : 1e-3 * this.scale;
    return Math.abs(this.dv) < eps && Math.abs(this.v - this.to) < eps;
  }
}

const spring = (responseSec, damping = 1.0, scale = 1, px = false) => {
  const w = (2 * Math.PI) / responseSec;
  return new Spring(w * w, 2 * damping * w, 0, scale, px);
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

const LAYOUTS = {
  3: [['1/3', '1/3'], ['3/5', '1/3'], ['1/5', '3/4']],
  4: [['1/3', '1/2'], ['3/5', '1/2'], ['1/3', '2/4'], ['3/5', '2/4']],
  5: [['1/3', '1/2'], ['3/5', '1/2'], ['1/2', '2/4'], ['2/4', '2/4'], ['4/5', '2/4']],
  6: [['1/3', '1/2'], ['3/5', '1/2'], ['1/2', '2/4'], ['2/4', '2/3'], ['4/5', '2/4'], ['2/4', '3/4']],
  7: [['1/2', '1/2'], ['2/4', '1/2'], ['4/5', '1/2'], ['1/3', '2/3'], ['3/4', '2/3'], ['4/5', '2/3'], ['1/5', '3/4']]
};

const spanOf = (track) => {
  if (!track) return 1;
  const [a, b] = track.split('/').map(Number);
  return b - a;
};

const variantFor = (colTrack) => {
  const span = spanOf(colTrack);
  if (span >= 4) return 'card-hero';
  if (span >= 2) return 'card-wide';
  return null;
};

const BentoSolver = (() => {
  const COLS = 12;
  const MAX_ROWS = 4;

  const MAX_PER_ROW = 4;
  const EXTRA_ROW_COST = 4;
  const U = COLS / 4;
  const WIDE_CYCLE = [1, 0, 2];
  const cache = new Map();

  const rowCost = (k, last, only, prev) => {
    let c;
    if (k === 3) c = 0;
    else if (k === 4) c = 1.2;
    else if (k === 2) c = only ? 0 : last ? 1 : 2.5;
    else c = only ? 0 : last ? 1 : Infinity;
    if (prev && k > prev) c += 1.5;
    return c;
  };

  const plan = (n) => {
    let best = null, bestScore = Infinity;
    const ks = [];
    const walk = (left, score) => {
      if (score >= bestScore) return;
      if (left === 0) {
        const rows = ks.length;
        const total = score + Math.max(0, rows - 3) * EXTRA_ROW_COST;
        if (total < bestScore) { bestScore = total; best = ks.slice(); }
        return;
      }
      if (ks.length === MAX_ROWS || left > (MAX_ROWS - ks.length) * MAX_PER_ROW) return;
      for (let k = Math.min(MAX_PER_ROW, left); k >= 1; k--) {
        const i = ks.length;
        const last = left === k;
        const c = rowCost(k, last, last && i === 0, ks[i - 1]);
        if (c === Infinity) continue;
        ks.push(k);
        walk(left - k, score + c);
        ks.pop();
      }
    };
    walk(n, 0);
    return best;
  };

  const rowWidths = (k, wideAt) => {
    if (k === 1) return [4 * U];
    if (k === 2) return [2 * U, 2 * U];
    if (k === 4) return [U, U, U, U];
    const w = [U, U, U];
    w[wideAt] = 2 * U;
    return w;
  };

  const generate = (n) => {
    if (!Number.isInteger(n) || n <= 0 || n > MAX_ROWS * MAX_PER_ROW) return null;
    if (cache.has(n)) return cache.get(n);
    const ks = plan(n);
    let result = null;
    if (ks) {
      const items = [];
      let triads = 0;
      ks.forEach((k, rowIndex) => {
        const wideAt = k === 3 ? WIDE_CYCLE[triads++ % WIDE_CYCLE.length] : 0;
        rowWidths(k, wideAt).forEach((col) => items.push({ col, row: 1, rowIndex }));
      });
      result = { rows: ks.length, items };
    }
    cache.set(n, result);
    return result;
  };

  return { generate, COLS };
})();

const variantForSpan = (col, row) => {
  if (row >= 2) return 'card-tall';
  if (col >= 12) return 'card-hero';
  if (col >= 6) return 'card-wide';
  return null;
};

const getSelectedVariantIndex = (app) => {
  if (!app.variants) return -1;
  try {
    const stored = localStorage.getItem('lx-variant-' + app.id);
    if (stored !== null && app.variants[Number(stored)]) return Number(stored);
  } catch (e) { if (LX_DEBUG) console.warn(e); }
  return Number.isInteger(app.defaultVariant) && app.variants[app.defaultVariant] ? app.defaultVariant : 0;
};

const supportsAnchor = typeof CSS !== 'undefined' && CSS.supports('anchor-name', '--a');

const moveVariantIndicatorLegacy = (chipsEl, btn, instant) => {
  const indicator = chipsEl.querySelector('.variant-chip-indicator');
  if (!indicator || !btn) return;
  const p = chipsEl.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const x = b.left - p.left, w = b.width;
  const prevX = chipsEl._lastX ?? x;
  const dx = x - prevX;
  const stretch = Math.min(Math.abs(dx) / Math.max(w, 1), 0.3);

  indicator.style.width = `${w}px`;
  indicator.style.transformOrigin = dx >= 0 ? 'left center' : 'right center';

  if (instant) {
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${x}px)`;
  } else {
    indicator.style.transition = 'transform 0.3s var(--ease-lux)';
    indicator.style.transform = `translateX(${x}px) scaleX(${1 + stretch})`;
    clearTimeout(chipsEl._settleTimer);
    chipsEl._settleTimer = setTimeout(() => {
      indicator.style.transition = 'transform 0.25s var(--ease-spring)';
      indicator.style.transform = `translateX(${x}px) scaleX(1)`;
    }, 140);
  }
  chipsEl._lastX = x;
};

const gradVars = (g) => `--c1:${tone(g[0])};`;

const NEW_TTL_DAYS = 30;
const isFresh = (app) => {
  if (!app.since) return !!app.isNew;
  const t = Date.parse(app.since + 'T00:00:00');
  if (Number.isNaN(t)) return !!app.isNew;
  return (Date.now() - t) < NEW_TTL_DAYS * 86400000;
};

let pointerFieldDirty = true;
let pointerVX = 0;

const createCard = (app, idx, placement, cat, opts = {}) => {
  const el = document.createElement('div');
  const forcedIndex = Number.isInteger(opts.variantIndex) && app.variants && app.variants[opts.variantIndex] ? opts.variantIndex : -1;
  const isTile = forcedIndex >= 0;
  const variantIndex = isTile ? forcedIndex : getSelectedVariantIndex(app);
  const carriesDigit = idx < 9 && (!isTile || variantIndex === getSelectedVariantIndex(app));
  const activeVariant = app.variants ? app.variants[variantIndex] : null;
  const activeUrl = activeVariant ? activeVariant.url : app.url;
  const title = loc(app.title);
  const activeLabel = activeVariant ? `${title} — ${loc(activeVariant.label)}` : title;
  el.classList.add('app-card');
  el.dataset.appId = app.id;
  const listView = viewMode() === 'list';
  const iconsView = viewMode() === 'icons';
  if (listView) {
    el.classList.add('app-card--row');
    el.style.setProperty('--row', String(idx));
  }
  if (iconsView) {
    el.classList.add('app-card--icon');
    el.style.setProperty('--row', String(idx));
  }

  let octave = 0;
  let variant = null;
  if (placement && placement.type === 'explicit') {
    el.style.gridColumn = placement.col || '';
    el.style.gridRow = placement.row || '';
    const rowStart = placement.row ? Number(placement.row.split('/')[0]) : null;
    octave = rowStart ? clamp(1 - (rowStart - 1), -1, 1) : 0;
    variant = variantFor(placement.col);
  } else if (placement && placement.type === 'span') {
    el.style.gridColumn = `span ${placement.col}`;
    el.style.gridRow = placement.row > 1 ? `span ${placement.row}` : '';
    octave = clamp(1 - placement.rowIndex, -1, 1);
    variant = variantForSpan(placement.col, placement.row);
  } else {
    el.style.gridColumn = '';
    el.style.gridRow = '';
  }

  el.style.setProperty('--c1', tone(appGradient(app, activeVariant)[0]));
  if (app.variants) el.dataset.variantIndex = String(variantIndex);
  el.style.setProperty('--i', idx);

  const soundIndex = cat ? cat.key + idx : idx;

  if (variant) el.classList.add(variant);
  if (app.closed) el.classList.add('status-closed');

  const fresh = isFresh(app);
  let badgesHtml = '';
  if (fresh) badgesHtml += `<div class="badge badge-new"><span class="badge-dot"></span>${escapeHtml(t('badgeNew'))}</div>`;
  if (app.closed) badgesHtml += `<div class="badge badge-closed"><span class="badge-dot"></span>${escapeHtml(t('badgeClosed'))}</div>`;
  if (app.variantBadge) badgesHtml += `<div class="badge badge-variant">${icon('fa-clone')}${escapeHtml(app.variantBadge)}</div>`;

  const iconClass = activeVariant ? activeVariant.icon : app.icon;
  const stackable = !!app.variants && !iconsView && !isTile && stackableVariants(app);
  if (stackable) el.dataset.activeVariant = String(activeVariant.id);
  const digitHtml = carriesDigit ? `<span class="digit-badge" aria-hidden="true" title="${escapeHtml(t('altShortcutHint').replace('{n}', String(idx + 1)))}">${idx + 1}</span>` : '';

  const chipsHtml = app.variants ? `
      <div class="variant-chips" role="radiogroup" aria-label="${escapeHtml(t('chooseVersionOf'))} ${escapeHtml(title)}">
        <div class="variant-chip-indicator" aria-hidden="true"></div>
        ${app.variants.map((v, i) => `
          <button type="button" class="variant-chip${i === variantIndex ? ' is-active' : ''}" role="radio" aria-checked="${i === variantIndex}" data-variant-index="${i}">${escapeHtml(loc(v.label))}</button>
        `).join('')}
      </div>` : '';

  const qrLabel = `${t('ctxQr')} — ${title}`;
  const qrBtnHtml = (cls, compact = false) => `<button type="button" class="card-qr ${cls}" aria-label="${escapeHtml(qrLabel)}"${compact ? ' tabindex="-1"' : ''}>${icon('fa-qrcode')}${compact ? '' : '<span class="card-qr-label" aria-hidden="true">QR</span>'}</button>`;

  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const host = hostOf(activeUrl);

  const overlayLabel = app.closed ? `${activeLabel} — ${t('badgeClosed')}` : activeLabel;
  const overlayTarget = openMode() === 'same' ? '' : ' target="_blank"';
  const overlayAttrs = `href="${escapeHtml(activeUrl)}"${overlayTarget} rel="noopener noreferrer" aria-label="${escapeHtml(overlayLabel)}"`;

  const overlayHtml = `<a class="card-link-overlay" ${overlayAttrs} data-open-mode="${openMode()}"${carriesDigit ? ` aria-keyshortcuts="${idx + 1}"` : ''}></a>`;
  const surfaceHtml = `
      <div class="card-aura" aria-hidden="true"></div>
      ${listView ? '' : `<div class="card-glyph" aria-hidden="true">${cardMarkHtml(app, activeVariant, iconClass, '', stackable)}</div>`}
      <div class="card-glow"></div>
      <div class="card-sheen" aria-hidden="true"></div>
      ${app.closed ? '<div class="closed-tint" aria-hidden="true"></div>' : ''}`;
  const iconHtml = `${wrapOpen(app, activeVariant)}${cardMarkHtml(app, activeVariant, iconClass, 'app-icon', stackable)}${digitHtml}</div>`;
  const titleHtml = `<h3 class="app-title">${escapeHtml(title)}</h3>`;
  const hostHtml = host ? `<span class="card-meta" dir="ltr">${escapeHtml(host)}</span>` : '';

  const bentoBody = `
      <div class="bento-header">
        ${iconHtml}
        <div class="header-end">
          ${badgesHtml ? `<div class="badges">${badgesHtml}</div>` : ''}
          ${qrBtnHtml('card-qr--bento')}
        </div>
      </div>
      <div class="bento-footer">
        <div class="title-stack">
          <div class="title-row">
            ${titleHtml}
            <span class="open-affordance" aria-hidden="true">${icon(openModeIcon())}</span>
          </div>
          ${hostHtml}
        </div>
        ${chipsHtml}
      </div>`;
  const listBody = `
      <div class="row-icon">${iconHtml}</div>
      <div class="row-text">${titleHtml}${hostHtml}</div>
      ${chipsHtml ? `<div class="row-chips">${chipsHtml}</div>` : ''}
      ${badgesHtml ? `<div class="badges row-badges">${badgesHtml}</div>` : ''}
      ${qrBtnHtml('card-qr--row')}
      <span class="open-affordance row-go" aria-hidden="true">${icon(openModeIcon())}</span>`;

  const iconsBody = `
      ${wrapOpen(app, activeVariant)}${markHtml(app, activeVariant, iconClass, 'app-icon')}${digitHtml}${fresh && !isTile ? '<span class="icon-new-dot" aria-hidden="true"></span>' : ''}</div>
      <span class="icon-label">${escapeHtml(isTile ? loc(activeVariant.label) : title)}</span>`;

  if (iconsView) {
    el.innerHTML = `${overlayHtml}${iconsBody}${qrBtnHtml('card-qr--icon', true)}`;
    if (app.closed) el.title = app.closedReason ? `${t('badgeClosed')} — ${loc(app.closedReason)}` : t('badgeClosed');
  } else {
    el.innerHTML = `
    <div class="card-shadow" aria-hidden="true"></div>
    <div class="card-clip">
      ${overlayHtml}${surfaceHtml}${listView ? listBody : bentoBody}
    </div>
  `;
  }

  const recordLaunch = () => {
    const vi = isTile ? variantIndex : getSelectedVariantIndex(app);
    const recentId = vi >= 0 && app.variants[vi] ? `${app.id}::${app.variants[vi].id}` : app.id;
    pushRecent(recentId);
    bumpFreq(recentId);
  };
  el.addEventListener('click', (e) => {
    const launched = !!e.target.closest('.card-link-overlay');
    setTimeout(() => {
      sfx.click();
      try { localStorage.setItem('lx-last-open', app.id); } catch (err) { if (LX_DEBUG) console.warn(err); }
      if (launched && isTile) {
        try { localStorage.setItem('lx-variant-' + app.id, String(variantIndex)); } catch (err) { if (LX_DEBUG) console.warn(err); }
      }
      if (launched) recordLaunch();
    }, 0);
  });
  el.addEventListener('auxclick', (e) => {
    if (e.button !== 1 || !e.target.closest('.card-link-overlay')) return;
    try { localStorage.setItem('lx-last-open', app.id); } catch (err) { if (LX_DEBUG) console.warn(err); }
    recordLaunch();
  });
  el.addEventListener('mouseenter', () => { sfx.hover(soundIndex, { octave, velocity: clamp(Math.abs(pointerVX) / 2000, 0, 1) }); setInteractionOrigin(el); });
  el.addEventListener('focusin', (e) => {
    let kb = false;
    try { kb = e.target.matches(':focus-visible'); } catch (err) { kb = true; }
    el.classList.toggle('is-kb-focus', kb);
    if (kb) sfx.hover(soundIndex, { octave });
    setInteractionOrigin(el);
  });
  el.addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !el.contains(e.relatedTarget)) el.classList.remove('is-kb-focus');
  });
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') { el._pressed = true; Motion.wake(); } }, { passive: true });
  const releasePress = () => { if (el._pressed) { el._pressed = false; Motion.wake(); } };
  el.addEventListener('pointerup', releasePress, { passive: true });
  el.addEventListener('pointercancel', releasePress, { passive: true });
  el.addEventListener('pointerleave', releasePress, { passive: true });
  el.addEventListener('pointerdown', () => { el._pdAt = performance.now(); el.classList.remove('is-kb-focus'); }, { passive: true, capture: true });
  const qrBtn = el.querySelector('.card-qr');
  if (qrBtn) {
    qrBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfx.click();
      const vi = app.variants ? Number(el.dataset.variantIndex) : undefined;
      openQrForApp(app, Number.isFinite(vi) ? vi : undefined, qrBtn);
    });
  }
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const kb = (e.clientX === 0 && e.clientY === 0) || !(el._pdAt && performance.now() - el._pdAt < 2000);
    const r = el.getBoundingClientRect();
    openCardContextMenu(el, kb ? r.left + r.width / 2 : e.clientX, kb ? r.top + r.height / 2 : e.clientY, kb);
  });

  if (app.variants && !iconsView) {
    const chipsEl = el.querySelector('.variant-chips');
    const tileEl = el.querySelector('.app-icon-wrapper');
    const linkEl = el.querySelector('.card-link-overlay');

    let currentVariantIndex = variantIndex;
    const applyVariant = (i) => {
      if (i === currentVariantIndex) return;
      chipsEl.dataset.dir = i > currentVariantIndex ? 'fwd' : 'back';
      currentVariantIndex = i;
      el.dataset.variantIndex = String(i);
      const v = app.variants[i];
      if (!v) return;
      const metaEl = el.querySelector('.card-meta');
      const markEl = el.querySelector('.card-glyph');
      const vLabel = loc(v.label);
      const ariaLabel = app.closed ? `${title} — ${vLabel} — ${t('badgeClosed')}` : `${title} — ${vLabel}`;
      chipsEl.querySelectorAll('.variant-chip').forEach((chip, ci) => {
        chip.classList.toggle('is-active', ci === i);
        chip.setAttribute('aria-checked', String(ci === i));
      });
      if (!supportsAnchor) moveVariantIndicatorLegacy(chipsEl, chipsEl.querySelector('.variant-chip.is-active'), false);
      if (stackable) {
        setActiveVariant(el, String(v.id), { href: v.url, host: hostOf(v.url), label: ariaLabel, c1: tone(appGradient(app, v)[0]) });
      } else {
        linkEl.href = v.url;
        if (metaEl) metaEl.textContent = hostOf(v.url);
        linkEl.setAttribute('aria-label', ariaLabel);
        clearTimeout(el._iconTimer);
        cancelAnimationFrame(el._iconRaf);
        const outgoing = tileEl.querySelector('.app-icon');
        if (outgoing) outgoing.style.opacity = '0';
        el._iconTimer = setTimeout(() => {
          const incoming = retileIcon(tileEl, app, v, v.icon);
          if (markEl) retileIcon(markEl, app, v, v.icon, '');
          el.style.setProperty('--c1', tone(appGradient(app, v)[0]));
          if (incoming === outgoing) {
            incoming.style.opacity = '1';
          } else {
            incoming.style.opacity = '0';
            el._iconRaf = requestAnimationFrame(() => {
              el._iconRaf = requestAnimationFrame(() => { incoming.style.opacity = '1'; });
            });
          }
        }, 120);
      }
      try { localStorage.setItem('lx-variant-' + app.id, String(i)); } catch (e) { if (LX_DEBUG) console.warn(e); }
      sfx.click();
    };

    chipsEl.querySelectorAll('.variant-chip').forEach((chip, i) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyVariant(i);
      });
    });

    if (!supportsAnchor) {
      requestAnimationFrame(() => moveVariantIndicatorLegacy(chipsEl, chipsEl.querySelector('.variant-chip.is-active'), true));
    }
  }

  attachDestinationWarming(el.querySelector('.card-link-overlay'));

  return el;
};

let lastInteractionPoint = null;

const railCenter = () => {
  const rail = document.getElementById('tabRail');
  const r = rail.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const setInteractionOrigin = (el) => {
  const r = el.getBoundingClientRect();
  lastInteractionPoint = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

const openInNewTab = (url) => {
  if (!url) return;
  try {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.style.cssText = 'position:fixed;top:-9999px;inset-inline-start:-9999px;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (e) {
    if (LX_DEBUG) console.warn(e);
    try { window.open(url, '_blank', 'noopener'); } catch (e2) { if (LX_DEBUG) console.warn(e2); }
  }
};

let contextMenuEl = null;
let contextMenuAC = null;
let contextMenuReturn = null;

const closeContextMenu = () => {
  if (!contextMenuEl || !contextMenuEl.classList.contains('is-open')) return;
  const hadFocus = contextMenuEl.contains(document.activeElement);
  contextMenuEl.classList.remove('is-open');
  contextMenuEl.inert = true;
  contextMenuEl.style.removeProperty('--menu-accent');
  delete contextMenuEl.dataset.owner;
  document.getElementById('dataToggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('lookToggle')?.setAttribute('aria-expanded', 'false');
  if (contextMenuAC) { contextMenuAC.abort(); contextMenuAC = null; }
  const back = contextMenuReturn;
  contextMenuReturn = null;
  if (hadFocus && back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
};

const buildContextMenu = () => {
  if (contextMenuEl) return contextMenuEl;
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'lx-context-menu';
  contextMenuEl.setAttribute('role', 'menu');
  contextMenuEl.tabIndex = -1;
  contextMenuEl.inert = true;
  document.body.appendChild(contextMenuEl);
  return contextMenuEl;
};

const placeContextMenu = (menu, x, y) => {
  const pad = 8;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${clamp(x, pad, Math.max(pad, window.innerWidth - w - pad))}px`;
  menu.style.top = `${clamp(y, pad, Math.max(pad, window.innerHeight - h - pad))}px`;
};

const showContextMenu = (menu, { anchor = null, returnTo = null, focusFirst = false } = {}) => {
  contextMenuReturn = returnTo;
  menu.inert = false;
  menu.classList.add('is-open');
  contextMenuAC = new AbortController();
  const { signal } = contextMenuAC;
  document.addEventListener('pointerdown', (e) => {
    if (menu.contains(e.target) || (anchor && anchor.contains(e.target))) return;
    contextMenuReturn = null;
    closeContextMenu();
  }, { passive: true, signal });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeContextMenu();
      return;
    }
    if (!menu.contains(document.activeElement)) return;
    e.stopImmediatePropagation();
    if (e.key === 'Tab') { e.preventDefault(); closeContextMenu(); return; }
    const row = document.activeElement.closest('.ctx-vrow');
    if (row && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const rowBtns = [...row.querySelectorAll('button')];
      const ri = rowBtns.indexOf(document.activeElement);
      const fwd = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
      const target = rowBtns[(ri + (fwd ? 1 : rowBtns.length - 1)) % rowBtns.length];
      if (target) { e.preventDefault(); target.focus({ preventScroll: true }); }
      return;
    }
    const items = [...menu.querySelectorAll('button:not(.ctx-side)')];
    if (!items.length) return;
    const cur = row ? row.querySelector('.ctx-vopen') : document.activeElement;
    const i = items.indexOf(cur);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[i <= 0 ? items.length - 1 : i - 1];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    if (next) { e.preventDefault(); next.focus({ preventScroll: true }); }
  }, { signal, capture: true });
  window.addEventListener('resize', () => { contextMenuReturn = null; closeContextMenu(); }, { passive: true, signal });
  window.addEventListener('scroll', () => { contextMenuReturn = null; closeContextMenu(); }, { passive: true, capture: true, signal });
  const first = menu.querySelector('.ctx-vopen.is-default') || menu.querySelector('button:not(.ctx-side)');
  (focusFirst && first ? first : menu).focus({ preventScroll: true });
};

const syncCardMenuMode = (menu, mode) => {
  const seg = menu.querySelector('.ctx-seg');
  if (seg) seg.dataset.mode = mode;
  menu.querySelectorAll('[data-open-mode]').forEach((b) => {
    const on = b.dataset.openMode === mode;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const other = otherOpenMode(mode);
  const otherLabel = t(other === 'new' ? 'actionNewTab' : 'actionSameTab');
  menu.querySelectorAll('[data-vother]').forEach((b) => {
    setIcon(b.querySelector('svg'), openModeIcon(other));
    b.title = otherLabel;
    const vLabel = b.parentElement?.querySelector('.ctx-vopen .ctx-label')?.textContent || '';
    b.setAttribute('aria-label', `${vLabel} — ${otherLabel}`);
  });
  const group = menu.querySelector('[data-action="open-new"]')?.parentElement;
  if (group) {
    const first = group.querySelector(`[data-action="open-${mode}"]`);
    const second = group.querySelector(`[data-action="open-${other}"]`);
    if (first && second) {
      group.querySelectorAll('.ctx-tag').forEach(tag => tag.remove());
      first.classList.add('is-default');
      second.classList.remove('is-default');
      const tag = document.createElement('span');
      tag.className = 'ctx-tag';
      tag.textContent = t('ctxDefault');
      first.appendChild(tag);
      group.insertBefore(first, group.firstChild);
    }
  }
  menu.dataset.mode = mode;
};

const openCardContextMenu = (card, clientX, clientY, fromKeyboard = false) => {
  closeContextMenu();
  const menu = buildContextMenu();
  menu.dataset.owner = 'card';
  const linkEl = card.querySelector('.card-link-overlay');
  const activeUrl = linkEl ? linkEl.href : '';
  const variantChips = Array.from(card.querySelectorAll('.variant-chip'));

  const appId = card.dataset.appId;
  const cat = categories.find(c => c.apps.some(a => a.id === appId));
  const app = cat ? cat.apps.find(a => a.id === appId) : null;
  const activeChip = card.querySelector('.variant-chip.is-active');
  const chipIndex = activeChip ? Number(activeChip.dataset.variantIndex) : (card.classList.contains('app-card--icon') && card.dataset.variantIndex !== undefined ? Number(card.dataset.variantIndex) : -1);
  const activeVariant = app && app.variants && app.variants[chipIndex] ? app.variants[chipIndex] : null;
  const title = app ? loc(app.title) : '';
  const iconName = activeVariant ? activeVariant.icon : (app ? app.icon : 'fa-circle');
  let host = '';
  try { host = new URL(activeUrl).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
  const mode = openMode();
  if (app) menu.style.setProperty('--menu-accent', tone(appGradient(app, activeVariant)[0]));
  const kbdHint = (txt) => `<span class="ctx-kbd" aria-hidden="true">${escapeHtml(txt)}</span>`;
  const defaultTag = `<span class="ctx-tag">${escapeHtml(t('ctxDefault'))}</span>`;
  const openRow = (m) => `<button type="button" data-action="open-${m}" role="menuitem" class="ctx-item${m === mode ? ' is-default' : ''}">${icon(openModeIcon(m))}<span class="ctx-label">${escapeHtml(t(m === 'new' ? 'actionNewTab' : 'actionSameTab'))}</span>${m === mode ? defaultTag : ''}</button>`;

  const otherMode = otherOpenMode(mode);
  const otherLabel = t(otherMode === 'new' ? 'actionNewTab' : 'actionSameTab');
  const isVariantApp = !!(app && app.variants && variantChips.length);
  const openGroupHtml = isVariantApp
    ? `<div class="lx-context-menu-label" role="presentation">${escapeHtml(t('ctxOpen'))}</div><div class="ctx-group" role="group">${app.variants.map((v, i) => {
        const current = !!variantChips[i]?.classList.contains('is-active');
        const vLabel = loc(v.label);
        return `<div class="ctx-vrow${current ? ' is-current' : ''}" role="presentation">
          <button type="button" role="menuitem" class="ctx-item ctx-vopen${current ? ' is-default' : ''}" data-vopen="${i}">${icon(v.icon || 'fa-circle')}<span class="ctx-label">${escapeHtml(vLabel)}</span></button>
          <button type="button" role="menuitem" class="ctx-side" data-vother="${i}" aria-label="${escapeHtml(vLabel + ' — ' + otherLabel)}" title="${escapeHtml(otherLabel)}">${icon(openModeIcon(otherMode))}</button>
          <button type="button" role="menuitemradio" aria-checked="${current}" class="ctx-side ctx-pin${current ? ' is-pinned' : ''}" data-vpin="${i}" aria-label="${escapeHtml(vLabel + ' — ' + t('ctxUseVersion'))}" title="${escapeHtml(current ? t('ctxCurrent') : t('ctxUseVersion'))}">${icon('fa-thumbtack')}</button>
        </div>`;
      }).join('')}</div>`
    : `<div class="ctx-group" role="group">${openRow(mode)}${openRow(otherMode)}</div>`;

  let itemsHtml = `
    <div class="ctx-head" role="presentation" style="--c1:${escapeHtml(tone(app ? appGradient(app, activeVariant)[0] : '#7c9bff'))}">
      <span class="ctx-head-icon" data-mark="${app ? appMark(app, activeVariant).kind : 'fa'}">${app ? markHtml(app, activeVariant, iconName, '') : icon(iconName)}</span>
      <span class="ctx-head-text">
        <span class="ctx-head-title">${escapeHtml(title)}${activeVariant ? `<span class="ctx-head-variant">${escapeHtml(loc(activeVariant.label))}</span>` : ''}</span>
        <span class="ctx-head-sub">${host ? `<span dir="ltr">${escapeHtml(host)}</span>` : ''}${app && app.closed ? `<span class="ctx-head-closed">${escapeHtml(t('badgeClosed'))}</span>` : ''}</span>
      </span>
    </div>
    ${openGroupHtml}
    <div class="lx-context-menu-sep" role="separator"></div>
    <div class="ctx-group" role="group">
      <button type="button" data-action="copy" role="menuitem" class="ctx-item">${icon('fa-copy')}<span class="ctx-label">${escapeHtml(t('ctxCopyLink'))}</span></button>
      <button type="button" data-action="copy-name" role="menuitem" class="ctx-item">${icon('fa-font')}<span class="ctx-label">${escapeHtml(t('ctxCopyName'))}</span></button>
      <button type="button" data-action="qr" role="menuitem" class="ctx-item">${icon('fa-qrcode')}<span class="ctx-label">${escapeHtml(t('ctxQr'))}</span>${kbdHint(isMacPlatform() ? '⌥Q' : 'Alt Q')}</button>
      <button type="button" data-action="details" role="menuitem" class="ctx-item">${icon('fa-magnifying-glass')}<span class="ctx-label">${escapeHtml(t('ctxDetails'))}</span>${kbdHint(isMacPlatform() ? '⌘K' : 'Ctrl K')}</button>
    </div>
  `;
  itemsHtml += `
    <div class="lx-context-menu-sep" role="separator"></div>
    <div class="ctx-mode" role="group" aria-label="${escapeHtml(t('ctxOpenWith'))}">
      <span class="ctx-mode-label">${escapeHtml(t('ctxOpenWith'))}</span>
      <span class="ctx-seg" data-mode="${mode}">
        <span class="ctx-seg-thumb" aria-hidden="true"></span>
        ${OPEN_MODES.map(m => `<button type="button" role="menuitemradio" aria-checked="${m === mode}" data-open-mode="${m}" class="${m === mode ? 'is-active' : ''}" title="${escapeHtml(t('openModeHint_' + m))}">${escapeHtml(t('openMode_' + m))}</button>`).join('')}
      </span>
    </div>
  `;
  menu.innerHTML = itemsHtml;

  const recordCardLaunch = () => {
    const recentId = activeVariant ? `${appId}::${activeVariant.id}` : appId;
    pushRecent(recentId);
    bumpFreq(recentId);
    try { localStorage.setItem('lx-last-open', appId); } catch (err) { if (LX_DEBUG) console.warn(err); }
  };
  OPEN_MODES.forEach((m) => {
    menu.querySelector(`[data-action="open-${m}"]`)?.addEventListener('click', () => {
      sfx.click();
      contextMenuReturn = null;
      closeContextMenu();
      if (!activeUrl) return;
      recordCardLaunch();
      openUrlWith(activeUrl, m);
    });
  });
  const flashItem = (btn, ok, okText) => {
    btn.classList.add(ok ? 'is-done' : 'is-failed');
    const label = btn.querySelector('.ctx-label');
    setIcon(btn.querySelector('svg'), ok ? 'fa-check' : 'fa-triangle-exclamation');
    if (label) label.textContent = ok ? okText : t('copyFailed');
    setTimeout(() => { if (btn.isConnected && menu.contains(btn)) closeContextMenu(); }, 700);
  };
  menu.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = activeUrl ? await copyToClipboard(activeUrl) : false;
    sfx.click();
    flashItem(btn, ok, t('linkCopied'));
  });
  menu.querySelector('[data-action="copy-name"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = title ? await copyToClipboard(title) : false;
    sfx.click();
    flashItem(btn, ok, t('nameCopied'));
  });
  menu.querySelector('[data-action="qr"]').addEventListener('click', () => {
    sfx.click();
    const back = linkEl || card;
    const liveChip = card.querySelector('.variant-chip.is-active');
    const vi = liveChip ? Number(liveChip.dataset.variantIndex) : (chipIndex >= 0 ? chipIndex : undefined);
    contextMenuReturn = null;
    closeContextMenu();
    openQrForApp(app, vi, back);
  });
  menu.querySelector('[data-action="details"]').addEventListener('click', () => {
    sfx.click();
    contextMenuReturn = null;
    closeContextMenu();
    heroReturnFocus = false;
    openPalette(title);
  });
  const launchVariant = (i, m) => {
    const v = app && app.variants ? app.variants[i] : null;
    if (!v || !v.url) return;
    sfx.click();
    contextMenuReturn = null;
    closeContextMenu();
    const recentId = `${appId}::${v.id}`;
    pushRecent(recentId);
    bumpFreq(recentId);
    try { localStorage.setItem('lx-last-open', appId); } catch (err) { if (LX_DEBUG) console.warn(err); }
    openUrlWith(v.url, m);
  };
  menu.querySelectorAll('[data-vopen]').forEach((btn) => {
    const i = Number(btn.dataset.vopen);
    btn.addEventListener('click', (e) => launchVariant(i, e.shiftKey || e.metaKey || e.ctrlKey ? otherOpenMode(openMode()) : openMode()));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); launchVariant(i, 'new'); } });
  });
  menu.querySelectorAll('[data-vother]').forEach((btn) => {
    btn.addEventListener('click', () => launchVariant(Number(btn.dataset.vother), otherOpenMode(openMode())));
  });
  menu.querySelectorAll('[data-vpin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.vpin);
      if (btn.classList.contains('is-pinned')) {
        btn.classList.remove('is-nudge');
        void btn.offsetWidth;
        btn.classList.add('is-nudge');
        return;
      }
      variantChips[i]?.click();
      menu.querySelectorAll('.ctx-vrow').forEach((rowEl, ri) => {
        const on = ri === i;
        rowEl.classList.toggle('is-current', on);
        rowEl.querySelector('.ctx-vopen')?.classList.toggle('is-default', on);
        const pin = rowEl.querySelector('.ctx-pin');
        if (pin) {
          pin.classList.toggle('is-pinned', on);
          pin.setAttribute('aria-checked', String(on));
          pin.title = on ? t('ctxCurrent') : t('ctxUseVersion');
        }
      });
      const v = app && app.variants ? app.variants[i] : null;
      if (v) {
        const tint = tone(appGradient(app, v)[0]);
        menu.style.setProperty('--menu-accent', tint);
        const headEl = menu.querySelector('.ctx-head');
        if (headEl) headEl.style.setProperty('--c1', tint);
        const headVar = menu.querySelector('.ctx-head-variant');
        if (headVar) headVar.textContent = loc(v.label);
        const headIcon = menu.querySelector('.ctx-head-icon');
        if (headIcon && app) retileIcon(headIcon, app, v, v.icon, '');
        const headHost = menu.querySelector('.ctx-head-sub > span[dir]');
        if (headHost) { try { headHost.textContent = new URL(v.url).hostname.replace(/^www\./, ''); } catch (err) { if (LX_DEBUG) console.warn(err); } }
      }
    });
  });
  menu.querySelectorAll('[data-open-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.openMode;
      if (m === openMode()) return;
      sfx.click();
      setOpenMode(m);
      syncCardMenuMode(menu, m);
      btn.focus({ preventScroll: true });
    });
  });

  placeContextMenu(menu, clientX, clientY);
  const returnTo = fromKeyboard || card.contains(document.activeElement) ? (linkEl || card) : document.activeElement;
  showContextMenu(menu, { returnTo, focusFirst: fromKeyboard });
};

const IC_MIN = 104;

const iconItems = (cat) => cat.apps.map((app, i) => ({ app, idx: i, n: Array.isArray(app.variants) && app.variants.length > 1 ? app.variants.length : 1, el: null }));

const packIcons = (items, cols) => {
  const rest = items.slice();
  const out = [];
  let col = 0;
  while (rest.length) {
    const it = rest[0];
    const span = Math.min(it.n, cols);
    if (col + span <= cols) {
      out.push(rest.shift());
      col = (col + span) % cols;
      continue;
    }
    let free = cols - col;
    let j = 1;
    while (free > 0 && j < Math.min(rest.length, cols + 1)) {
      if (rest[j].n === 1) {
        out.push(rest.splice(j, 1)[0]);
        free -= 1;
      } else {
        j += 1;
      }
    }
    col = 0;
  }
  return out;
};

const centerIconRows = (order, cols) => {
  let row = [];
  let used = 0;
  const flush = () => {
    if (!row.length) return;
    const left = cols - used;
    const start = left > 0 ? Math.floor(left / 2) + 1 : 1;
    row.forEach((it, i) => {
      if (i === 0 && start > 1) it.el.style.setProperty('grid-column', `${start} / span ${Math.min(it.n, cols)}`, 'important');
      else it.el.style.removeProperty('grid-column');
      it.el.classList.toggle('ic-half', left > 0 && left % 2 === 1);
    });
    row = [];
    used = 0;
  };
  order.forEach((it) => {
    const span = Math.min(it.n, cols);
    if (used + span > cols) flush();
    row.push(it);
    used += span;
  });
  flush();
};

const iconCols = (grid) => {
  const cs = getComputedStyle(grid);
  const w = grid.clientWidth - (parseFloat(cs.paddingInlineStart) || 0) - (parseFloat(cs.paddingInlineEnd) || 0);
  const min = parseFloat(cs.getPropertyValue('--ic-min')) || IC_MIN;
  return Math.max(4, Math.floor(w / min));
};

const fitIconLabels = (grid) => {
  const labels = [...grid.querySelectorAll('.icon-label')];
  labels.forEach((l) => l.classList.remove('is-tight'));
  const tight = labels.filter((l) => {
    const lh = parseFloat(getComputedStyle(l).lineHeight) || 16;
    return l.getBoundingClientRect().height > lh * 2 + 1 || l.scrollWidth > l.clientWidth + 1;
  });
  tight.forEach((l) => l.classList.add('is-tight'));
};

const buildIconPlate = (it, cat, isBootBatch) => {
  const { app, idx } = it;
  const plate = document.createElement('div');
  plate.className = 'icon-plate' + (app.closed ? ' is-closed' : '');
  plate.setAttribute('role', 'group');
  plate.setAttribute('aria-label', loc(app.title));
  plate.style.setProperty('--n', String(it.n));
  plate.style.setProperty('--c1', tone(appGradient(app)[0]));
  const cap = document.createElement('span');
  cap.className = 'icon-plate-cap';
  cap.setAttribute('aria-hidden', 'true');
  const capText = document.createElement('span');
  capText.textContent = loc(app.title);
  cap.appendChild(capText);
  if (isFresh(app)) {
    const dot = document.createElement('i');
    dot.className = 'icon-new-dot';
    cap.appendChild(dot);
  }
  plate.appendChild(cap);
  app.variants.forEach((v, vi) => {
    const card = createCard(app, idx, null, cat, { variantIndex: vi });
    card.classList.add('no-enter');
    plate.appendChild(card);
  });
  if (isBootBatch) plate.classList.add('is-boot-card');
  return plate;
};

const repackIcons = (grid) => {
  const items = grid._icItems;
  if (!items || grid.dataset.layout !== 'icons') return;
  if (gridSwitch) { grid._icDeferred = true; return; }
  const cols = iconCols(grid);
  if (cols === grid._icCols) return;
  grid._icCols = cols;
  grid.style.setProperty('--ic-cols', String(cols));
  grid.querySelectorAll('.app-card, .icon-plate').forEach((c) => c.classList.add('no-enter'));
  const active = document.activeElement;
  const keep = active && grid.contains(active) ? active : null;
  const frag = document.createDocumentFragment();
  const order = packIcons(items, cols);
  centerIconRows(order, cols);
  order.forEach((it) => frag.appendChild(it.el));
  grid.appendChild(frag);
  if (keep) keep.focus({ preventScroll: true });
  fitIconLabels(grid);
};

let iconsResizeRaf = 0;
const iconsResizeTargets = new Set();
const iconsRO = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  entries.forEach((e) => iconsResizeTargets.add(e.target));
  cancelAnimationFrame(iconsResizeRaf);
  iconsResizeRaf = requestAnimationFrame(() => {
    iconsResizeTargets.forEach((g) => repackIcons(g));
    iconsResizeTargets.clear();
  });
}) : null;

const renderCards = (grid, categoryId) => {
  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return false;
  const hadFocusInGrid = grid.contains(document.activeElement) && document.activeElement !== grid;
  grid.classList.remove('has-overflow', 'at-bottom');

  if (!cat.apps.length) {
    grid.classList.remove('is-auto-flow');
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = '';
    delete grid.dataset.layout;
    grid.innerHTML = `<div class="grid-empty">${icon('fa-box-open')}<span>${escapeHtml(t('emptyCategory'))}</span></div>`;
    pointerFieldDirty = true;
    if (hadFocusInGrid) document.getElementById(`tab-${categoryId}`)?.focus({ preventScroll: true });
    return false;
  }

  const n = cat.apps.length;
  const listView = viewMode() === 'list';
  const iconsView = viewMode() === 'icons';
  const curated = listView || iconsView ? null : LAYOUTS[n];
  const generated = curated || listView || iconsView ? null : BentoSolver.generate(n);

  grid.classList.toggle('is-auto-flow', !listView && !iconsView && !curated && !generated);
  if (listView) grid.dataset.layout = 'list';
  else if (iconsView) grid.dataset.layout = 'icons';
  else delete grid.dataset.layout;

  if (curated) {
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gridTemplateRows = 'repeat(3, 1fr)';
  } else if (generated) {
    grid.style.gridTemplateColumns = `repeat(${BentoSolver.COLS}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${generated.rows}, 1fr)`;
  } else {
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = '';
  }

  const frag = document.createDocumentFragment();
  const isBootBatch = !firstCardBatchDone;
  if (iconsView) {
    const cols = iconCols(grid);
    grid.style.setProperty('--ic-cols', String(cols));
    const entries = iconItems(cat);
    entries.forEach((it) => {
      if (it.n > 1) {
        it.el = buildIconPlate(it, cat, isBootBatch);
      } else {
        it.el = createCard(it.app, it.idx, null, cat);
        if (isBootBatch) it.el.classList.add('is-boot-card');
      }
    });
    grid._icItems = entries;
    grid._icCols = cols;
    const order = packIcons(entries, cols);
    centerIconRows(order, cols);
    order.forEach((it) => frag.appendChild(it.el));
    if (iconsRO) iconsRO.observe(grid);
  } else {
    grid._icItems = null;
    grid.style.removeProperty('--ic-cols');
  }
  if (!iconsView) cat.apps.forEach((app, i) => {
    let placement = null;
    if (curated) {
      const track = curated[i];
      placement = { type: 'explicit', col: track[0], row: track[1] };
    } else if (generated) {
      const item = generated.items[i];
      placement = { type: 'span', col: item.col, row: item.row, rowIndex: item.rowIndex };
    }
    const card = createCard(app, i, placement, cat);
    if (isBootBatch) card.classList.add('is-boot-card');
    if (!curated && !generated && !listView && !iconsView && i === 0) card.classList.add('card-wide');
    frag.appendChild(card);
  });
  grid.innerHTML = '';
  grid.appendChild(frag);
  if (iconsView) fitIconLabels(grid);
  firstCardBatchDone = true;
  pointerFieldDirty = true;
  if (hadFocusInGrid) grid.querySelector('.card-link-overlay')?.focus({ preventScroll: true });
  return isBootBatch;
};

const staggerDelay = (kind, dist, max) => {
  if (kind === 'boot') return MOTION.boot.offset + Math.round((dist / max) * MOTION.boot.spread);
  const m = MOTION[kind];
  return m && m.stagger ? Math.round((dist / max) * m.stagger) : 0;
};

const gridUnits = (grid) => [...grid.querySelectorAll(':scope > .app-card, :scope > .icon-plate, :scope > .grid-empty')];

const cardDistances = (cards) => {
  const origin = lastInteractionPoint ?? railCenter();
  let max = 1;
  const dists = cards.map((c) => {
    const r = c.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - origin.x, r.top + r.height / 2 - origin.y);
    max = Math.max(max, d);
    return d;
  });
  return { dists, max };
};

const staggerCardEntry = (grid, isBootBatch) => {
  const cards = gridUnits(grid);
  const skipEntryAnim = MQ.reducedMotion;
  const isAutoFlow = grid.classList.contains('is-auto-flow');
  const scrollDriven = supportsViewTimeline && isNarrowViewport();

  const overflowAmount = isAutoFlow ? grid.scrollHeight - grid.clientHeight : 0;
  const { dists, max } = cardDistances(cards);

  if (isAutoFlow) grid.classList.toggle('has-overflow', overflowAmount > 4);
  cards.forEach((c, i) => {
    c.style.animationDelay = scrollDriven ? '0s' : `${isBootBatch ? staggerDelay('boot', dists[i], max) : 0}ms`;
    if (!skipEntryAnim) {
      c.style.willChange = 'transform, opacity';
      c.addEventListener('animationend', () => { c.style.willChange = ''; }, { once: true });
    }
  });
};

const initPointerField = () => {
  const grid = document.getElementById('appGrid');
  const container = document.querySelector('.container');
  const spot = document.getElementById('spotlight');
  if (!grid || !container) return;
  if (!MQ.hoverFine) return;

  const paletteEl = document.getElementById('lx-palette');
  const qrEl = document.getElementById('lx-qr');
  const isSuspended = () => !!((paletteEl && paletteEl.open) || (qrEl && qrEl.open));
  let REVEAL_RADIUS = Math.max(150, Math.min(260, window.innerWidth * 0.22));
  let cards = [];
  let px = -9999, py = -9999;
  let sx = -9999, sy = -9999;
  let hasPointer = false;
  let lastMove = 0;
  let hoveredAccentCard = null;
  let lastHoverAccent = '';
  let gridRect = null;
  let focal = null;
  let focalSince = 0;
  let gapSince = 0;
  let cardHoverFlag = false;
  let intentPending = false;
  const engage = spring(0.46, 1.0);
  const DIM_BASE = 0.07;
  const DIM_FAR = 0.18;
  const DIM_INTENT_MS = 110;
  const GAP_HOLD_MS = 480;
  grid.classList.add('has-dim-engine');

  const measure = () => {
    cards = viewMode() === 'icons' ? [] : Array.from(grid.querySelectorAll('.app-card'));
    if (LX_DEBUG) window.__lxDebugPointerFieldCount = cards.length;
    const gr = grid.getBoundingClientRect();
    gridRect = gr;
    if (focal && !focal.isConnected) {
      const id = focal.dataset.appId;
      focal = cards.find(c => c.dataset.appId === id) || null;
      if (focal) cards.forEach(c => { if (c._springs) return; c._seedDim = true; });
    }
    const gl = gr.left - grid.scrollLeft, gt = gr.top - grid.scrollTop;
    cards.forEach(c => {
      const w = c.offsetWidth, h = c.offsetHeight;
      let left, top;
      if (c.offsetParent === grid) { left = gl + c.offsetLeft; top = gt + c.offsetTop; }
      else { const r = c.getBoundingClientRect(); left = r.left; top = r.top; }
      c._r = { left, top, right: left + w, bottom: top + h };
      if (!c._clip) c._clip = c.querySelector('.card-clip');
      if (!c._shadow) c._shadow = c.querySelector('.card-shadow');
      if (!c._springs) {

        c._springs = {
          tx: spring(0.44, 1.0),
          ty: spring(0.44, 1.0),
          tz: spring(0.4, 1.0, 7, true),
          reveal: spring(0.48, 1.0),
          sc: spring(0.36, 0.94, 0.02),
          hov: spring(0.34, 1.0),
          dim: spring(0.5, 1.0)
        };
        c._springs.sc.v = 1;
        c._springs.sc.to = 1;
        if (c._seedDim && focal && c !== focal) c._springs.dim.v = c._springs.dim.to = DIM_BASE * engage.v;
        c._seedDim = false;
      }
      if (!c._last) c._last = {};
    });
    pointerFieldDirty = false;
    falloffFor = undefined;
  };

  let falloffFor;
  const computeFalloff = () => {
    if (falloffFor === focal) return;
    falloffFor = focal;
    const f = focal && focal._r ? focal._r : null;
    let maxD = 1;
    cards.forEach(c => {
      if (!f || !c._r) { c._fd = 0; return; }
      const d = Math.hypot((c._r.left + c._r.right - f.left - f.right) / 2, (c._r.top + c._r.bottom - f.top - f.bottom) / 2);
      c._fd = d;
      maxD = Math.max(maxD, d);
    });
    cards.forEach(c => { c._fd = (c._fd || 0) / maxD; });
  };

  const setFocal = (next, now) => {
    if (next === focal) return;
    if (!focal) focalSince = now;
    focal = next;
  };

  const setIfChanged = (c, key, val, eps, unit) => {
    const prev = c._last[key];
    if (prev !== undefined && Math.abs(prev - val) < eps) return;
    c._last[key] = val;
    c.style.setProperty(key, unit ? `${val}${unit}` : String(val));
  };

  const subscriber = {
    fixed(dt) {
      pointerVX *= Math.exp(-dt / 0.14);
      if (gridSwitch || document.documentElement.classList.contains('lx-scrolling')) return;
      if (pointerFieldDirty) measure();
      const zenTransitioning = document.documentElement.classList.contains('is-zen-transitioning') || !!(qrEl && qrEl.open);
      const wantsTilt = !MQ.reducedMotion && !zenTransitioning;
      const suspended = isSuspended();
      const fx = suspended ? -9999 : px;
      const fy = suspended ? -9999 : py;
      const now = performance.now();
      hoveredAccentCard = null;

      let under = null;
      for (const c of cards) {
        const r = c._r;
        if (r && fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom) { under = c; break; }
      }
      const kb = suspended ? null : cards.find(c => c.classList.contains('is-kb-focus')) || null;
      if (under) {
        gapSince = 0;
        setFocal(under, now);
      } else if (focal && focal !== kb && !suspended && !zenTransitioning && gridRect && hasPointer &&
                 fx >= gridRect.left && fx <= gridRect.right && fy >= gridRect.top && fy <= gridRect.bottom) {
        if (!gapSince) gapSince = now;
        if (now - gapSince > GAP_HOLD_MS) { gapSince = 0; setFocal(kb, now); }
      } else {
        gapSince = 0;
        setFocal(kb, now);
      }
      computeFalloff();
      const listMode = isFlatView();
      const engaged = !!focal && !zenTransitioning && !gridSwitch && !listMode && cards.length > 1 && (kb === focal || now - focalSince >= DIM_INTENT_MS);
      intentPending = !!focal && !engaged && !zenTransitioning && !listMode && cards.length > 1;
      engage.to = engaged ? 1 : 0;
      if (zenTransitioning) engage.snap(); else engage.fixed(dt);
      if (engaged !== cardHoverFlag) {
        cardHoverFlag = engaged;
        document.body.classList.toggle('is-card-hover', engaged);
      }

      cards.forEach(c => {
        const r = c._r;
        const s = c._springs;
        if (!r || !s) return;

        const fd = c._fd || 0;
        const depth = c === focal ? 0 : (DIM_BASE + (DIM_FAR - DIM_BASE) * fd * fd) * (c.classList.contains('status-closed') ? 1.15 : 1);
        s.dim.to = depth * engage.v;
        if (zenTransitioning) s.dim.snap(); else s.dim.fixed(dt);

        if (zenTransitioning) {
          s.tx.to = 0; s.ty.to = 0; s.tz.to = 0; s.reveal.to = 0; s.hov.to = 0; s.sc.to = 1;
          s.tx.snap(); s.ty.snap(); s.tz.snap(); s.reveal.snap(); s.sc.snap(); s.hov.snap();
          return;
        }

        const dx = fx < r.left ? r.left - fx : fx > r.right ? fx - r.right : 0;
        const dy = fy < r.top ? r.top - fy : fy > r.bottom ? fy - r.bottom : 0;
        const d = Math.hypot(dx, dy);
        let o = d >= REVEAL_RADIUS ? 0 : 1 - d / REVEAL_RADIUS;
        o *= o;
        s.reveal.to = o * 0.9;

        const inside = fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom;
        if (inside) hoveredAccentCard = c;
        if (inside && wantsTilt) {
          const nx = (fx - r.left - (r.right - r.left) / 2) / ((r.right - r.left) / 2);
          const ny = (fy - r.top - (r.bottom - r.top) / 2) / ((r.bottom - r.top) / 2);
          const lean = clamp(pointerVX * 0.0006, -0.25, 0.25);
          s.tx.to = nx + lean;
          s.ty.to = ny;
          s.tz.to = 7;
        } else {
          s.tx.to = 0; s.ty.to = 0; s.tz.to = 0;
        }

        const focused = !suspended && c.classList.contains('is-kb-focus');
        const active = inside || focused;
        s.hov.to = active ? 1 : 0;
        s.sc.to = c._pressed ? 0.988 : (active ? 1.004 : 1 - 0.018 * s.dim.v);

        if (wantsTilt) {
          s.tx.fixed(dt); s.ty.fixed(dt); s.tz.fixed(dt); s.reveal.fixed(dt);
          s.sc.fixed(dt); s.hov.fixed(dt);
        } else {

          s.tx.snap(); s.ty.snap(); s.tz.snap(); s.reveal.snap();
          s.sc.snap(); s.hov.snap();
        }
      });

      const nextAccent = hoveredAccentCard ? hoveredAccentCard.style.getPropertyValue('--c1') : '';
      if (nextAccent !== lastHoverAccent && spot) {
        lastHoverAccent = nextAccent;
        if (nextAccent) spot.style.setProperty('--hover-accent', nextAccent);
        else spot.style.removeProperty('--hover-accent');
      }

      if (hasPointer && !suspended) {
        const k = 1 - Math.exp(-dt / 0.09);
        sx += (px - sx) * k;
        sy += (py - sy) * k;
      } else {
        sx = px; sy = py;
      }
    },

    render() {
      let alive = false;
      const suspended = isSuspended();
      const fx = suspended ? -9999 : px;
      const fy = suspended ? -9999 : py;

      cards.forEach(c => {
        const r = c._r;
        const s = c._springs;
        if (!r || !s) return;

        const clip = c._clip || c;
        const lp = clip._last || (clip._last = {});
        const setLeaf = (key, val, eps, unit) => {
          const prev = lp[key];
          if (prev !== undefined && Math.abs(prev - val) < eps) return;
          lp[key] = val;
          clip.style.setProperty(key, unit ? `${val}${unit}` : String(val));
        };
        setLeaf('--reveal-o', s.reveal.v, 0.001);
        if (s.reveal.to > 0) {
          setLeaf('--rx', fx - r.left, 0.5, 'px');
          setLeaf('--ry', fy - r.top, 0.5, 'px');
        } else if (s.reveal.v <= 0.002 && '--rx' in lp) {
          clip.style.removeProperty('--rx');
          clip.style.removeProperty('--ry');
          delete lp['--rx'];
          delete lp['--ry'];
        }
        setIfChanged(c, '--tx', s.tx.v, 0.002);
        setIfChanged(c, '--ty', s.ty.v, 0.002);
        setIfChanged(c, '--hov', s.hov.v, 0.002);
        const op = 1 - s.dim.v;
        if (op > 0.999) {
          if (c._last.op !== undefined) { c.style.opacity = ''; c._last.op = undefined; }
        } else if (c._last.op === undefined || Math.abs(c._last.op - op) > 0.002) {
          c._last.op = op;
          c.style.opacity = op.toFixed(3);
        }

        const inside = fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom;
        if (inside) {
          if (!c._hasPos) { c._hasPos = true; c.classList.add('has-pointer-pos'); }
          c.classList.add('is-tracking');
          setLeaf('--gx', fx - r.left, 0.5, 'px');
          setLeaf('--gy', fy - r.top, 0.5, 'px');
        } else if (c.classList.contains('is-tracking')) {
          c.classList.remove('is-tracking');
        }

        const tx = s.tx.v, ty = s.ty.v, tz = s.tz.v, sc = s.sc.v;
        const rest = Math.abs(tx) < 0.001 && Math.abs(ty) < 0.001 && Math.abs(tz) < 0.05 && Math.abs(sc - 1) < 0.0002;
        const L = c._last;
        if (rest) {
          if (L.tf !== '') { c.style.transform = ''; L.tf = ''; L.tx = L.ty = L.tz = L.sc = undefined; }
        } else if (L.tx === undefined || Math.abs(L.tx - tx) > 0.0015 || Math.abs(L.ty - ty) > 0.0015 || Math.abs(L.tz - tz) > 0.05 || Math.abs(L.sc - sc) > 0.0002) {
          L.tx = tx; L.ty = ty; L.tz = tz; L.sc = sc;
          L.tf = `perspective(1600px) rotateX(${(-ty * 1.1).toFixed(3)}deg) rotateY(${(tx * 1.1).toFixed(3)}deg) translateZ(${tz.toFixed(2)}px) scale(${sc.toFixed(4)})`;
          c.style.transform = L.tf;
        }

        const moving = !(s.tx.settled && s.ty.settled && s.tz.settled && s.reveal.settled && s.sc.settled && s.hov.settled);
        const settled = !moving && s.dim.settled;
        const live = inside || moving;
        if (live !== !!c._wc) { c._wc = live; c.classList.toggle('is-live', live); }

        if (!settled) alive = true;
      });
      if (!engage.settled || gapSince || intentPending) alive = true;

      if (spot && !document.body.classList.contains('is-cinema')) {
        if (hasPointer && !suspended) {
          const idle = performance.now() - lastMove > 2200;
          spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
          spot.classList.add('is-active');
          spot.classList.toggle('is-idle', idle);
          if (!idle || Math.abs(px - sx) > 0.1 || Math.abs(py - sy) > 0.1) alive = true;
        } else {
          if (hasPointer) spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
          spot.classList.remove('is-active', 'is-idle');
        }
      }

      return alive;
    }
  };

  document.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const now = performance.now();
    if (!hasPointer) {
      px = e.clientX; py = e.clientY;
      sx = px; sy = py;
      pointerVX = 0;
      hasPointer = true;
      lastMove = now;
      pointerFieldDirty = true;
      Motion.wake();
      return;
    }
    if (isSuspended()) {
      px = e.clientX; py = e.clientY;
      sx = px; sy = py;
      pointerVX = 0;
      lastMove = now;
      return;
    }
    const dt = Math.max((now - lastMove) / 1000, 1 / 240);
    const rawVx = clamp((e.clientX - px) / dt, -4000, 4000);
    pointerVX += (rawVx - pointerVX) * (1 - Math.exp(-dt / 0.05));
    px = e.clientX; py = e.clientY;
    lastMove = now;
    Motion.wake();
  }, { passive: true });

  if (paletteEl) {
    paletteEl.addEventListener('close', () => { pointerFieldDirty = true; Motion.wake(); });
  }
  if (qrEl) {
    qrEl.addEventListener('close', () => { pointerFieldDirty = true; Motion.wake(); });
    qrEl.addEventListener('toggle', () => { Motion.wake(); });
  }
  grid.addEventListener('focusin', () => Motion.wake());
  grid.addEventListener('focusout', () => Motion.wake());
  grid.addEventListener('animationend', (e) => {
    if (!e.target.classList || !e.target.classList.contains('app-card')) return;
    pointerFieldDirty = true;
    Motion.wake();
  });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || hasPointer) return;
    px = e.clientX; py = e.clientY;
    sx = px; sy = py;
    hasPointer = true;
    lastMove = performance.now();
    pointerFieldDirty = true;
    Motion.wake();
  }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { pointerFieldDirty = true; Motion.wake(); });
  container.addEventListener('transitionend', (e) => {
    if (e.target !== container || e.propertyName !== 'transform') return;
    pointerFieldDirty = true;
    Motion.wake();
  });

  document.addEventListener('pointerleave', () => {
    px = -9999; py = -9999;
    hasPointer = false;
    Motion.wake();
  });

  window.addEventListener('blur', () => {
    px = -9999; py = -9999;
    hasPointer = false;
    Motion.wake();
  });

  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget === null) {
      px = -9999; py = -9999;
      hasPointer = false;
      Motion.wake();
    }
  });

  window.addEventListener('resize', () => { REVEAL_RADIUS = Math.max(150, Math.min(260, window.innerWidth * 0.22)); pointerFieldDirty = true; Motion.wake(); }, { passive: true });
  window.addEventListener('scroll', (e) => {
    const tgt = e.target;
    if (tgt && tgt !== document && paletteEl && paletteEl.contains(tgt)) return;
    pointerFieldDirty = true;
    Motion.wake();
  }, { passive: true, capture: true });
  if (typeof ResizeObserver === 'function') {
    const gridResizeObserver = new ResizeObserver(() => { pointerFieldDirty = true; Motion.wake(); });
    gridResizeObserver.observe(grid);
  }

  measure();
  Motion.add(subscriber);
};

const initMagneticControls = () => {
  const pill = document.querySelector('.controls-pill');
  if (!pill) return;
  if (!MQ.hoverFine) return;
  if (MQ.reducedMotion) return;

  const FIELD = 40, MAX_PULL = 6;
  const paletteEl = document.getElementById('lx-palette');
  let buttons = [];
  let px = -9999, py = -9999;
  let dirty = true;
  let pillRect = null;

  const measure = () => {
    pillRect = pill.getBoundingClientRect();
    buttons = Array.from(pill.querySelectorAll('button')).map(btn => {
      if (!btn._mag) {
        btn._mag = { x: spring(0.22, 1.0, MAX_PULL, true), y: spring(0.22, 1.0, MAX_PULL, true), s: spring(0.22, 1.0, 0.06) };
        btn._mag.s.v = 1; btn._mag.s.to = 1;
        btn.addEventListener('pointerenter', () => { btn._mag.s.to = 1.06; Motion.wake(); });
        btn.addEventListener('pointerleave', () => { btn._mag.s.to = 1; Motion.wake(); });
      }
      const r = btn.getBoundingClientRect();
      return { btn, cx: r.left + r.width / 2, cy: r.top + r.height / 2, m: btn._mag };
    });
    dirty = false;
  };

  const subscriber = {
    fixed(dt) {
      if (dirty) measure();
      buttons.forEach(({ cx, cy, m }) => {
        const d = Math.hypot(px - cx, py - cy);
        if (d < FIELD) {
          const pull = (1 - d / FIELD) * MAX_PULL;
          const ang = Math.atan2(py - cy, px - cx);
          m.x.to = Math.cos(ang) * pull;
          m.y.to = Math.sin(ang) * pull;
        } else {
          m.x.to = 0; m.y.to = 0;
        }
        m.x.fixed(dt); m.y.fixed(dt); m.s.fixed(dt);
      });
    },
    render() {
      let alive = false;
      buttons.forEach(({ btn, m }) => {
        btn.style.translate = `${m.x.v.toFixed(2)}px ${m.y.v.toFixed(2)}px`;
        btn.style.scale = m.s.v.toFixed(3);
        if (!m.x.settled || !m.y.settled || !m.s.settled) alive = true;
      });
      return alive;
    }
  };

  window.addEventListener('resize', () => { dirty = true; Motion.wake(); }, { passive: true });
  window.addEventListener('scroll', () => { dirty = true; Motion.wake(); }, { passive: true, capture: true });
  if (typeof ResizeObserver === 'function') {
    const pillResizeObserver = new ResizeObserver(() => { dirty = true; Motion.wake(); });
    pillResizeObserver.observe(pill);
  }
  document.addEventListener('pointermove', (e) => {
    if (paletteEl && paletteEl.open) {
      if (px !== -9999) { px = -9999; py = -9999; Motion.wake(); }
      return;
    }
    if (!pillRect || dirty) measure();
    const r = pillRect;
    const inField = e.clientX >= r.left - FIELD && e.clientX <= r.right + FIELD &&
                    e.clientY >= r.top - FIELD && e.clientY <= r.bottom + FIELD;
    if (inField) { px = e.clientX; py = e.clientY; Motion.wake(); }
    else if (px !== -9999) { px = -9999; py = -9999; Motion.wake(); }
  }, { passive: true });
  pill.addEventListener('transitionend', (e) => {
    if (e.target !== pill || e.propertyName !== 'transform') return;
    dirty = true;
  });

  pill.classList.add('is-magnetic');
  measure();
  Motion.add(subscriber);
};

let isLightTheme = false;

const hueFromHex = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 220;
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
  return h * 60;
};

const hexBlend = (hex, mix, ratio) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  const r = Math.round(((n >> 16) & 255) + (mix[0] - ((n >> 16) & 255)) * ratio);
  const g = Math.round(((n >> 8) & 255) + (mix[1] - ((n >> 8) & 255)) * ratio);
  const b = Math.round((n & 255) + (mix[2] - (n & 255)) * ratio);
  return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
};

const CURATED_TONES = ['#6d82ad', '#5f9a94', '#7c9a7e', '#a99563', '#b07f66', '#ad7a80', '#9c7a9e', '#8379ab'];
const CURATED_NEUTRAL = '#76808f';
let curatedHues = null;
const toneCache = new Map();
const PALETTES = ['vivid', 'curated', 'muted', 'mono'];
const CORNERS = ['balanced', 'soft', 'crisp'];
const VIEWS = ['bento', 'list', 'icons'];
const VIEW_ICONS = { bento: 'fa-table-cells-large', list: 'fa-list', icons: 'fa-grip' };
const PALETTE_SWATCHES = {
  curated: ['#6d82ad', '#5f9a94', '#a99563', '#ad7a80'],
  muted: ['#8c95b6', '#7ea198', '#b9a47c', '#b48b94'],
  vivid: ['#7c9bff', '#2dd4bf', '#f5b445', '#f472b6'],
  mono: ['#dcdcdb', '#9c9d9f', '#67686b', '#3a3b3d']
};
const CORNER_SAMPLES = { soft: '9px', balanced: '5px', crisp: '1.5px' };
const ORB_SAT = { curated: 0.88, muted: 0.5, vivid: 1.45, mono: 0.04 };
const MUTED_GREY = [140, 133, 124];
const paletteMode = () => {
  const p = document.documentElement.dataset.palette;
  return PALETTES.includes(p) ? p : 'vivid';
};
const cornersMode = () => {
  const c = document.documentElement.dataset.corners;
  return CORNERS.includes(c) ? c : 'balanced';
};
const viewMode = () => (VIEWS.includes(document.documentElement.dataset.view) ? document.documentElement.dataset.view : 'bento');
const isFlatView = (v = viewMode()) => v === 'list' || v === 'icons';
const tone = (hex) => {
  const mode = paletteMode();
  if ((mode !== 'curated' && mode !== 'mono' && mode !== 'muted') || typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const key = mode + hex.toLowerCase();
  if (toneCache.has(key)) return toneCache.get(key);
  const out = mode === 'muted' ? hexBlend(hex.toLowerCase(), MUTED_GREY, 0.42) : mode === 'mono' ? hexBlend(curatedTone(hex.toLowerCase()), [134, 135, 138], 0.9) : curatedTone(hex.toLowerCase());
  toneCache.set(key, out);
  return out;
};
const curatedTone = (key) => {
  if (!curatedHues) curatedHues = CURATED_TONES.map(hueFromHex);
  const n = parseInt(key.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  const s = mx === mn ? 0 : (mx - mn) / (1 - Math.abs(2 * l - 1));
  let out = CURATED_NEUTRAL;
  if (s >= 0.18) {
    const h = hueFromHex(key);
    let best = 0, bestD = 361;
    curatedHues.forEach((ch, i) => {
      const d = Math.min(Math.abs(ch - h), 360 - Math.abs(ch - h));
      if (d < bestD) { bestD = d; best = i; }
    });
    out = CURATED_TONES[best];
  }
  return out;
};

const withCrossfade = (apply) => {
  const rootEl = document.documentElement;
  if (!document.startViewTransition || MQ.reducedMotion || isLowEnd()) { apply(); return; }
  const vt = withViewTransition(() => { rootEl.classList.add('lx-theme-swapping'); apply(); });
  if (!vt) { requestAnimationFrame(() => rootEl.classList.remove('lx-theme-swapping')); return; }
  vt.ready.then(() => {
    rootEl.animate({ opacity: [0, 1] }, { duration: MOTION.crossfade.inMs, easing: EASE_LUX, pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
  vt.finished.catch(() => {}).finally(() => { rootEl.classList.remove('lx-theme-swapping'); if (activeViewTransition === vt) activeViewTransition = null; });
};

const retintUI = () => {
  const appById = new Map();
  categories.forEach(c => c.apps.forEach(a => appById.set(a.id, a)));
  document.querySelectorAll('#appGrid .app-card[data-app-id]').forEach((el) => {
    const app = appById.get(el.dataset.appId);
    if (!app || !app.gradient) return;
    const vi = el.dataset.variantIndex;
    const variant = app.variants && vi !== undefined ? app.variants[Number(vi)] : null;
    el.style.setProperty('--c1', tone(appGradient(app, variant)[0]));
  });
  if (contextMenuEl && contextMenuEl.dataset.owner === 'card') closeContextMenu();
  const activeCat = categories.find(c => c.id === currentTabId);
  if (activeCat) applyTabAccent(activeCat);
  const scopes = document.getElementById('paletteScopes');
  if (scopes) {
    const accents = new Map(scopeList().map(s => [s.id, s.accent || '#7c9bff']));
    scopes.querySelectorAll('.palette-scope').forEach((b) => {
      b.style.setProperty('--scope-accent', tone(accents.get(b.dataset.scope) || '#7c9bff'));
    });
    syncScopeIndicator();
  }
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open) {
    renderPaletteResults(document.getElementById('paletteInput')?.value || '');
    const entry = paletteItems[paletteActiveIndex];
    const detail = document.getElementById('paletteDetail');
    if (detail && entry) detail.style.setProperty('--c1', tone(appGradient(entry.app)[0]));
  }
};

const setPaletteMode = (mode, { silent = false, persist = true } = {}) => {
  const root = document.documentElement;
  if (!PALETTES.includes(mode) || root.dataset.palette === mode) return;
  withCrossfade(() => {
    root.dataset.palette = mode;
    window.bgAnim?.retarget();
    retintUI();
    updateLookButtonLabel();
  });
  if (persist && !root.dataset.paletteLocked) {
    try { localStorage.setItem('lx-palette', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (!silent) showToast(`${t('lookColors')}: ${t('palette_' + mode)}`);
};

const setCornersMode = (mode, { silent = false, persist = true } = {}) => {
  const root = document.documentElement;
  if (!CORNERS.includes(mode) || root.dataset.corners === mode) return;
  withCrossfade(() => {
    root.dataset.corners = mode;
    pointerFieldDirty = true;
    updateLookButtonLabel();
    requestAnimationFrame(() => measureRail());
  });
  if (persist && !root.dataset.cornersLocked) {
    try { localStorage.setItem('lx-corners', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (!silent) showToast(`${t('lookCorners')}: ${t('corners_' + mode)}`);
};

const setViewMode = (mode, { silent = false, persist = true } = {}) => {
  const root = document.documentElement;
  if (!VIEWS.includes(mode) || viewMode() === mode) return;
  if (contextMenuEl && contextMenuEl.dataset.owner === 'card') closeContextMenu();
  const grid = document.getElementById('appGrid');
  const focusedCard = grid && grid.contains(document.activeElement) ? document.activeElement.closest('.app-card') : null;
  const focusedId = focusedCard ? focusedCard.dataset.appId : null;
  const run = () => {
    root.dataset.view = mode;
    const rendered = currentTabId ? renderCards(grid, currentTabId) : false;
    if (focusedId) {
      const next = Array.from(grid.querySelectorAll('.app-card')).find((c) => c.dataset.appId === focusedId);
      next?.querySelector('.card-link-overlay')?.focus({ preventScroll: true });
    }
    return rendered;
  };
  if (!grid || !currentTabId) {
    root.dataset.view = mode;
  } else if (MQ.reducedMotion || typeof grid.animate !== 'function') {
    settleGridSwitch();
    run();
    grid.querySelectorAll('.app-card, .icon-plate').forEach((c) => c.classList.add('no-enter'));
    if (grid.classList.contains('is-auto-flow')) grid.classList.toggle('has-overflow', grid.scrollHeight - grid.clientHeight > 4);
  } else {
    switchClamp('view');
    runGridSwitch(grid, run, 0, mode, 'view');
  }
  pointerFieldDirty = true;
  Motion.wake();
  if (persist && !root.dataset.viewLocked) {
    try { localStorage.setItem('lx-view', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (!silent) showToast(fmt('viewChanged', { m: t('view_' + mode) }));
};

const cycle = (list, cur) => list[(list.indexOf(cur) + 1) % list.length];

const syncOpenModeUI = () => {
  const m = openMode();
  document.documentElement.dataset.openMode = m;
  document.querySelectorAll('#appGrid .card-link-overlay').forEach((a) => {
    if (m === 'same') a.removeAttribute('target');
    else a.setAttribute('target', '_blank');
    a.dataset.openMode = m;
  });
  document.querySelectorAll('#appGrid .open-affordance svg').forEach((s) => setIcon(s, openModeIcon(m)));
  lastDetailKey = null;
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open && typeof renderPaletteDetail === 'function') renderPaletteDetail();
  updateLookButtonLabel();
};

const setOpenMode = (mode, { silent = true, persist = true } = {}) => {
  if (!OPEN_MODES.includes(mode)) return;
  if (persist) {
    try { localStorage.setItem('lx-open', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  syncOpenModeUI();
  if (!silent) showToast(fmt('openModeSet', { m: t('openMode_' + mode) }));
};

const updateFavicon = (cat) => {
  const accent = tone((cat && cat.accent) || '#7c9bff');
  const light = hexBlend(accent, [255, 255, 255], 0.45);
  const dark = hexBlend(accent, [0, 0, 0], 0.55);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect x="1" y="1" width="62" height="62" rx="16" fill="url(#g)"/><rect x="20" y="30" width="18" height="18" rx="3" fill="none" stroke="#fff" stroke-width="4"/><path d="M27 37 L44 20 M44 20 L34 20 M44 20 L44 30" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

class OrbField {
  constructor(canvas) {
    this.cv = canvas;
    this.cx = canvas.getContext('2d');
    this.t = 0;
    this.orbs = [];
    this.idleScale = 1;
    this.frameCount = 0;
    this.bloomStart = performance.now();
    this.lastActive = performance.now();
    this.resize();
    this.spawn();

    if (!MQ.reducedMotion) {
      Motion.add(this);
    } else {
      this.bloomStart = 0;
      this.render();
    }
  }

  resize() {
    const oldW = this.cv.width, oldH = this.cv.height;
    const scale = 0.35;
    const dpr = 1;
    this.cv.width = Math.round(window.innerWidth * scale * dpr);
    this.cv.height = Math.round(window.innerHeight * scale * dpr);
    this.cv.style.width = '100%';
    this.cv.style.height = '100%';
    if (oldW && oldH && this.orbs.length) {
      const rx = this.cv.width / oldW, ry = this.cv.height / oldH;
      this.orbs.forEach(o => {
        o.ax *= rx; o.ay *= ry;
        o.orbitR *= (rx + ry) / 2;
      });
    }
    this.lastActive = performance.now();
    Motion.wake();
  }

  spawn() {
    const n = window.innerWidth < 768 ? 4 : 6;
    const palette = isLightTheme ? [205, 225, 195] : [222, 258, 195];
    const minSide = Math.min(this.cv.width, this.cv.height);
    this.orbs = Array.from({ length: n }, (_, i) => {
      const hue = palette[i % 3];
      const ang = i * 2.399;
      const rad = 0.34 * minSide * Math.sqrt(i / n);
      const ax = this.cv.width / 2 + Math.cos(ang) * rad;
      const ay = this.cv.height / 2 + Math.sin(ang) * rad;
      return {
        ax, ay,
        x: ax, y: ay,
        orbitR: minSide * (0.06 + Math.random() * 0.03),
        orbitSpeed: 0.15 + Math.random() * 0.1,
        r: Math.random() * 160 + 120,
        hue,
        hueSpring: new Spring(40, 14, hue),
        phase: Math.random() * Math.PI * 2
      };
    });
  }

  retarget() {
    const palette = isLightTheme ? [205, 225, 195] : [222, 258, 195];
    const reduced = MQ.reducedMotion;
    this.orbs.forEach((o, i) => {
      o.hueSpring.to = palette[i % 3];
      if (reduced) { o.hueSpring.snap(); o.hue = o.hueSpring.v; }
    });
    this.lastActive = performance.now();
    if (reduced) this.render(performance.now() / 1000);
    else Motion.wake();
  }

  retargetCategory(hex, impulseDir = 0) {
    const hue = hueFromHex(hex);
    this.hotUntil = performance.now() + 1400;
    const reduced = MQ.reducedMotion;
    this.orbs.forEach((o, i) => {
      o.hueSpring.to = (hue + (i - (this.orbs.length - 1) / 2) * 22 + 360) % 360;
      if (reduced) { o.hueSpring.snap(); o.hue = o.hueSpring.v; }
      else if (impulseDir) o.hueSpring.dv += impulseDir * (i % 2 ? 26 : -26);
    });
    this.lastActive = performance.now();
    if (reduced) this.render(performance.now() / 1000);
    else Motion.wake();
  }

  fixed(dt) {
    const idleFor = performance.now() - this.lastActive;
    const idleTarget = idleFor > 20000 ? 0 : 1;
    this.idleScale += (idleTarget - this.idleScale) * Math.min(dt * 1.5, 1);
    if (this.idleScale < 0.0005) this.idleScale = 0;
    const scaledDt = dt * this.idleScale;
    this.t += scaledDt * 0.06;
    this.orbs.forEach(o => {
      o.hueSpring.fixed(scaledDt);
      o.hue = o.hueSpring.v;
      const ang = this.t * o.orbitSpeed + o.phase;
      o.x = o.ax + Math.cos(ang) * o.orbitR;
      o.y = o.ay + Math.sin(ang) * o.orbitR;
    });
  }

  render(now) {
    if (document.hidden) return true;

    const idleFor = performance.now() - this.lastActive;
    if (idleFor > 20000 && this.idleScale === 0) return false;

    const minInterval = performance.now() < (this.hotUntil || 0) ? 1 / 60 : (idleFor > 20000 ? 1 / 12 : 1 / 30);
    if (this._lastDraw && now - this._lastDraw < minInterval) return true;
    this._lastDraw = now;

    this.cx.clearRect(0, 0, this.cv.width, this.cv.height);
    this.cx.globalCompositeOperation = isLightTheme ? 'multiply' : 'screen';
    const bloom = Math.max(0, 1 - (performance.now() - this.bloomStart) / 7000) * 0.15;
    const sat = ORB_SAT[paletteMode()] ?? 1;
    const s1 = Math.round(52 * sat), s2 = Math.round(44 * sat);

    this.orbs.forEach(o => {
      const rr = o.r * (1 + bloom) * 1.25;
      const g = this.cx.createRadialGradient(o.x, o.y, 0, o.x, o.y, rr);
      const a = (isLightTheme ? 0.07 : 0.1) * (1 + bloom);
      g.addColorStop(0, `hsla(${o.hue}, ${s1}%, ${isLightTheme ? 62 : 38}%, ${a})`);
      g.addColorStop(0.3, `hsla(${o.hue}, ${s2}%, ${isLightTheme ? 72 : 28}%, ${a * 0.4})`);
      g.addColorStop(0.65, `hsla(${o.hue}, ${s2}%, ${isLightTheme ? 72 : 28}%, ${a * 0.12})`);
      g.addColorStop(1, 'transparent');

      this.cx.fillStyle = g;
      this.cx.beginPath();
      this.cx.arc(o.x, o.y, rr, 0, Math.PI * 2);
      this.cx.fill();
    });

    return true;
  }
}

const getStoredTheme = () => {
  try { return localStorage.getItem('lx-theme'); } catch (e) { return null; }
};

const getStoredSound = () => {
  try { return localStorage.getItem('lx-sound'); } catch (e) { return null; }
};

const applyStoredSoundPref = () => {
  if (getStoredSound() !== '1') return;
  sfx.enabled = true;
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', 'true');
  setIcon(btn.querySelector('svg'), 'fa-volume-up');
  updateSoundButtonLabel();
};

const applyTheme = (explicit) => {
  const stored = explicit !== undefined ? explicit : getStoredTheme();
  const isLight = stored === 'light' || stored === 'dark'
    ? stored === 'light'
    : window.matchMedia('(prefers-color-scheme: light)').matches;

  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  isLightTheme = isLight;

  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.setAttribute('content', isLight ? '#f3f1ec' : '#030406');

  if (explicit !== undefined) {
    try { localStorage.setItem('lx-theme', explicit); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }

  const btn = document.getElementById('themeToggle');
  btn.setAttribute('aria-pressed', String(isLight));
  updateThemeButtonLabel();
  setIcon(btn.querySelector('svg'), isLight ? 'fa-moon' : 'fa-sun');

  if (window.bgAnim) {
    window.bgAnim.retarget();
    const activeCat = categories.find(c => c.id === currentTabId);
    if (activeCat) window.bgAnim.retargetCategory(tone(activeCat.accent));
  }
};

const updateThemeButtonLabel = () => {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const label = isLightTheme ? t('themeToDark') : t('themeToLight');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
};

const updateSoundButtonLabel = () => {
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  const label = sfx.enabled ? t('soundMute') : t('soundEnable');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
};

const updateLangButtonLabel = () => {
  const btn = document.getElementById('langToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(lang === 'en'));
  const label = lang === 'ar' ? t('langSwitchToEn') : t('langSwitchToAr');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
};

const updateZenButtonLabel = () => {
  const btn = document.getElementById('zenToggle');
  if (!btn) return;
  const zen = document.body.classList.contains('is-zen');
  btn.setAttribute('aria-pressed', String(zen));
  const label = zen ? t('zenExit') : t('zenEnter');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  setIcon(btn.querySelector('svg'), zen ? 'fa-compress' : 'fa-expand');
};

const sweepStaticStrings = () => {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  updateBarKbd();
  updateBarLabel();
  if (typeof updateRefreshButtonLabel === 'function') updateRefreshButtonLabel();
};

const isMacPlatform = () => {
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(p);
};

const updateBarLabel = () => {
  const el = document.getElementById('lxBarLabelLong');
  if (!el) return;
  const n = categories.reduce((sum, c) => sum + c.apps.length, 0);
  el.textContent = n ? t('barSearchCount').replace('{n}', String(n)) : t('barSearchLabel');
};

const updateBarKbd = () => {
  const btn = document.getElementById('lxBarSearch');
  if (!btn) return;
  const kbd = document.getElementById('lxBarKbd');
  const shortcut = isMacPlatform() ? '⌘K' : 'Ctrl K';
  if (kbd) kbd.textContent = shortcut;
  btn.setAttribute('aria-label', t('quickSearch'));
  btn.title = `${t('quickSearch')} (${shortcut})`;
};

const applyI18n = (opts = {}) => {
  const { rebuild = true } = opts;

  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.querySelector('meta[name="description"]')?.setAttribute('content', t('metaDescription'));
  applyManifest();
  sweepStaticStrings();
  updateSoundButtonLabel();
  updateThemeButtonLabel();
  updateLangButtonLabel();
  updateZenButtonLabel();
  updateDataButtonLabel();
  updateLookButtonLabel();
  syncZenMetrics();
  if (document.getElementById('lx-qr')?.open) renderQr();

  if (!rebuild) return;

  const preservedTab = currentTabId;
  buildTabRail();
  if (preservedTab) {
    setActiveButtonStates(preservedTab);
    applyTabAccent(categories.find(c => c.id === preservedTab));
  }

  pointerFieldDirty = true;

  if (preservedTab) {
    const grid = document.getElementById('appGrid');

    settleGridSwitch();
    renderCards(grid, preservedTab);
    grid.querySelectorAll('.app-card, .icon-plate').forEach(c => c.classList.add('no-enter'));
    if (grid.classList.contains('is-auto-flow')) grid.classList.toggle('has-overflow', grid.scrollHeight - grid.clientHeight > 4);
    requestAnimationFrame(() => measureRail());
  }

  const paletteDialog = document.getElementById('lx-palette');
  if (paletteDialog && paletteDialog.open) {
    const input = document.getElementById('paletteInput');
    const query = input ? input.value : '';
    const activeEntry = paletteItems[paletteActiveIndex];
    const activeId = activeEntry ? activeEntry.app.id : null;
    renderPaletteResults(query);
    if (activeId) {
      const idx = paletteItems.findIndex(it => it.app.id === activeId);
      if (idx >= 0) setPaletteActive(idx);
    }
  }
};

let activeViewTransition = null;
let currentTabId = null;
let firstCardBatchDone = false;

const supportsTileTransitions = typeof CSS !== 'undefined' && CSS.supports('view-transition-class', 'x');
const supportsViewTimeline = typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'view()');
const isNarrowViewport = () => MQ.narrow;

let vtDebounceTimer = null;
const VT_DEBOUNCE_MS = 80;

const withViewTransition = (fn) => {
  if (!document.startViewTransition || MQ.reducedMotion || isLowEnd()) { fn(); return null; }
  if (vtDebounceTimer) {
    clearTimeout(vtDebounceTimer);
    vtDebounceTimer = setTimeout(() => { vtDebounceTimer = null; }, VT_DEBOUNCE_MS);
    fn();
    return activeViewTransition;
  }
  vtDebounceTimer = setTimeout(() => { vtDebounceTimer = null; }, VT_DEBOUNCE_MS);
  if (activeViewTransition) { try { activeViewTransition.skipTransition(); } catch (e) { if (LX_DEBUG) console.warn(e); } }
  activeViewTransition = document.startViewTransition(fn);
  return activeViewTransition;
};

const nameTiles = (grid, on) => {
  grid.querySelectorAll('.app-card').forEach((c, i) => {
    if (on) { c.style.viewTransitionName = `tile-${i}`; c.style.viewTransitionClass = 'tile'; }
    else { c.style.viewTransitionName = ''; c.style.viewTransitionClass = ''; }
  });
};

const TILE_STAGGER_COUNT = 12;
const TILE_STAGGER_STEP_MS = 10;
let tileStaggerStyleEl = null;

const setTileStagger = (dir) => {
  if (!tileStaggerStyleEl) {
    tileStaggerStyleEl = document.createElement('style');
    document.head.appendChild(tileStaggerStyleEl);
  }
  const forward = dir >= 0;
  let css = '';
  for (let i = 0; i < TILE_STAGGER_COUNT; i++) {
    const order = forward ? i : (TILE_STAGGER_COUNT - 1 - i);
    css += `::view-transition-group(tile-${i}) { animation-delay: ${order * TILE_STAGGER_STEP_MS}ms; }\n`;
  }
  tileStaggerStyleEl.textContent = css;
};

const clearTileStagger = () => {
  if (tileStaggerStyleEl) tileStaggerStyleEl.textContent = '';
};

const catIndex = (id) => categories.findIndex(c => c.id === id);

const applyTabAccent = (cat, impulseDir = 0) => {
  const bar = document.getElementById('lxBar');
  if (bar && cat) bar.style.setProperty('--tab-accent', tone(cat.accent));
  if (cat) document.documentElement.style.setProperty('--tab-accent', tone(cat.accent));
  if (cat) updateFavicon(cat);
  if (cat) window.bgAnim?.retargetCategory(tone(cat.accent), impulseDir);
};

const ins = (g) => `inset(0px ${g.r}px 0px ${g.l}px round var(--r-rail, 999px))`;
const railBox = (g) => ({ left: `${g.l}px`, right: `${g.r}px` });
const placeIndicator = (ind, g) => { ind.style.left = `${g.l}px`; ind.style.right = `${g.r}px`; };
let railGeom = new Map();
let railAnim = null;

const measureRail = () => {
  const rail = document.getElementById('tabRail');
  const btns = [...rail.querySelectorAll('.tab-btn')];
  if (!btns.length) return;

  btns.forEach((btn) => {
    const span = btn.querySelector('.label > span');
    if (!span) return;
    const width = Math.max(span.scrollWidth, span.getBoundingClientRect().width);
    btn.style.setProperty('--tab-label-width', `${Math.ceil(width) + 8}px`);
  });

  const stage = document.createElement('div');
  stage.inert = true;
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:absolute;top:-9999px;inset-inline-start:-9999px;visibility:hidden;pointer-events:none;';

  const rigs = btns.map((b) => {
    const cr = rail.cloneNode(true);
    cr.removeAttribute('id');
    cr.classList.add('is-measuring');
    cr.style.width = 'auto';
    const cBtns = [...cr.querySelectorAll('.tab-btn')];
    cBtns.forEach(x => x.removeAttribute('id'));
    const idx = btns.indexOf(b);
    cBtns.forEach((x, i) => x.setAttribute('aria-selected', String(i === idx)));
    stage.appendChild(cr);
    return { id: b.dataset.id, rail: cr, btn: cBtns[idx] };
  });

  document.body.appendChild(stage);

  let maxW = 0;
  const geom = new Map();
  rigs.forEach(({ id, rail: cr, btn }) => {
    const rr = cr.getBoundingClientRect(), br = btn.getBoundingClientRect();
    maxW = Math.max(maxW, rr.width);
    const l = br.left - rr.left;
    geom.set(id, { l, r: rr.width - l - br.width });
  });

  stage.remove();

  railGeom = geom;
  rail.style.width = `${Math.ceil(maxW)}px`;

  const g = railGeom.get(currentTabId);
  if (g) {
    railAnim?.cancel(); railAnim = null;
    const ind = document.getElementById('tabIndicator');
    if (ind) placeIndicator(ind, g);
  }
};

const moveIndicator = (toId, fromId) => {
  const ind = document.getElementById('tabIndicator');
  const to = railGeom.get(toId);
  if (!ind || !to) return;
  const from = railGeom.get(fromId) || to;

  railAnim?.cancel(); railAnim = null;

  if (fromId === toId || MQ.reducedMotion) {
    placeIndicator(ind, to);
    return;
  }

  const mid = { l: Math.min(from.l, to.l), r: Math.min(from.r, to.r) };

  railAnim = ind.animate(
    [railBox(from), { ...railBox(mid), offset: 0.42 }, railBox(to)],
    { duration: MOTION.tab.railMs, easing: EASE_LUX, fill: 'both' }
  );
  railAnim.finished.then(() => {
    placeIndicator(ind, to);
    railAnim?.cancel(); railAnim = null;
  }).catch(() => {});
};

const initTabGhost = () => {
  const rail = document.getElementById('tabRail');
  const ghost = document.getElementById('tabGhost');
  if (!rail || !ghost) return;
  if (!MQ.hoverFine) return;

  rail.addEventListener('pointerover', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn || btn.dataset.id === currentTabId) { ghost.style.opacity = '0'; return; }
    const g = railGeom.get(btn.dataset.id);
    if (!g) return;
    ghost.style.clipPath = ins(g);
    ghost.style.opacity = '1';
  });
  rail.addEventListener('pointerleave', () => { ghost.style.opacity = '0'; });
};

const setActiveButtonStates = (id) => {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const active = btn.dataset.id === id;
    btn.setAttribute('aria-selected', String(active));
    btn.tabIndex = active ? 0 : -1;
  });
};

const flipTabRail = (mutate) => {
  const rail = document.getElementById('tabRail');
  const btns = rail ? [...rail.querySelectorAll('.tab-btn')] : [];
  if (!btns.length || MQ.reducedMotion) { mutate(); return; }

  const first = btns.map(b => b.getBoundingClientRect().left);
  mutate();
  const last = btns.map(b => b.getBoundingClientRect().left);

  btns.forEach((b, i) => {
    const delta = first[i] - last[i];
    if (Math.abs(delta) < 0.5) return;
    b.style.transition = 'none';
    b.style.translate = `${delta}px 0`;
    b.getBoundingClientRect();
    b.style.transition = `translate ${MOTION.tab.railMs}ms var(--ease-lux)`;
    b.style.translate = '0 0';
    b.addEventListener('transitionend', function cleanup(e) {
      if (e.propertyName !== 'translate') return;
      b.style.transition = '';
      b.style.translate = '';
      b.removeEventListener('transitionend', cleanup);
    });
  });
};

let gridSwitch = null;

const settleGridSwitch = () => {
  if (!gridSwitch) return;
  const s = gridSwitch;
  gridSwitch = null;
  s.anims.forEach((a) => { try { a.cancel(); } catch (e) { if (LX_DEBUG) console.warn(e); } });
  s.ghost?.remove();
  s.cards.forEach((c) => { c.style.willChange = ''; });
};

const runGridSwitch = (g, run, travel, nextView = viewMode(), kind = 'tab') => {
  settleGridSwitch();
  const mo = MOTION[kind];
  const outFlat = isFlatView(g.dataset.layout || 'bento');
  const inFlat = isFlatView(nextView);
  const container = g.parentElement;
  const hadCards = g.querySelector('.app-card, .grid-empty');
  let ghost = null;
  const anims = [];

  if (hadCards) {
    ghost = g.cloneNode(true);
    ghost.removeAttribute('id');
    ghost.removeAttribute('role');
    ghost.removeAttribute('tabindex');
    ghost.removeAttribute('aria-labelledby');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.inert = true;
    ghost.classList.add('is-switching', 'grid-ghost');
    ghost.querySelectorAll('[id]').forEach((n) => n.removeAttribute('id'));
    ghost.classList.remove('has-dim-engine');
    ghost.querySelectorAll('.app-card').forEach((c) => { c.classList.remove('is-tracking', 'is-live', 'is-kb-focus'); c.style.transform = ''; c.style.willChange = ''; });
    ghost.querySelectorAll('.card-clip, .card-shadow').forEach((n) => { n.style.opacity = ''; });
    ghost.style.cssText += `;contain:layout paint style;position:absolute;left:${g.offsetLeft}px;top:${g.offsetTop}px;width:${g.offsetWidth}px;height:${g.offsetHeight}px;margin:0;pointer-events:none;z-index:0;overflow:hidden;`;
    ghost.scrollTop = g.scrollTop;
    container.insertBefore(ghost, g);
    const out = ghost.animate(
      [{ opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }, { opacity: 0, transform: `translate3d(${-travel * MOTION.travelOut}px,0,0) scale(${MOTION.scaleOut})` }],
      { duration: mo.outMs, easing: MOTION.outEase, fill: 'forwards' }
    );
    anims.push(out);
  }

  const wasBoot = run();
  const scrollDriven = supportsViewTimeline && isNarrowViewport();
  const cards = gridUnits(g);
  const { dists, max } = mo.stagger ? cardDistances(cards) : { dists: [], max: 1 };

  if (g.classList.contains('is-auto-flow')) g.classList.toggle('has-overflow', g.scrollHeight - g.clientHeight > 4);

  if (!scrollDriven) {
    cards.forEach((c, i) => {
      c.classList.add('no-enter');
      c.style.willChange = 'opacity, translate, scale';
      const from = inFlat && !travel ? `0 ${MOTION.liftIn}px` : `${travel * MOTION.travelIn}px 0`;
      const a = c.animate(
        [{ opacity: 0, translate: from, scale: String(MOTION.scaleIn) }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: mo.inMs, delay: mo.inDelay + staggerDelay(kind, dists[i], max), easing: EASE_LUX, fill: 'backwards' }
      );
      anims.push(a);
    });
  } else if (wasBoot) {
    staggerCardEntry(g, wasBoot);
  }

  const state = { anims, ghost, cards };
  gridSwitch = state;
  pointerFieldDirty = true;
  Motion.wake();

  return Promise.allSettled(anims.map((a) => a.finished)).then(() => {
    if (gridSwitch !== state) return;
    gridSwitch = null;
    ghost?.remove();
    cards.forEach((c) => { c.style.willChange = ''; });
    if (g._icDeferred) { g._icDeferred = false; repackIcons(g); }
    pointerFieldDirty = true;
    Motion.wake();
  });
};

const activateTab = (id, opts = {}) => {
  const { pushHash = true, playSound = true, instant = false } = opts;
  if (!categories.some(c => c.id === id)) return Promise.resolve();
  const prevId = currentTabId;
  const dir = prevId ? (catIndex(id) > catIndex(prevId) ? 1 : -1) : 1;
  currentTabId = id;

  const cat = categories.find(c => c.id === id);

  if (!instant && prevId && prevId !== id) switchClamp('tab');
  flipTabRail(() => setActiveButtonStates(id));
  applyTabAccent(cat, prevId && prevId !== id ? dir : 0);
  moveIndicator(id, instant ? id : prevId);

  if (!instant && prevId && prevId !== id) {
    const tabLive = document.getElementById('tabLive');
    if (tabLive) tabLive.textContent = loc(cat.label);
  }

  const g = document.getElementById('appGrid');
  g.setAttribute('aria-labelledby', `tab-${id}`);

  const reducedMotion = MQ.reducedMotion;
  const rtl = document.documentElement.dir === 'rtl';
  document.documentElement.style.setProperty('--dir', String(dir * (rtl ? 1 : -1)));

  const run = () => renderCards(g, id);

  let rendered;
  if (instant || reducedMotion || !prevId || prevId === id || typeof g.animate !== 'function') {
    settleGridSwitch();
    const wasBoot = run();
    staggerCardEntry(g, wasBoot);
    rendered = Promise.resolve();
  } else {
    rendered = runGridSwitch(g, run, dir * (rtl ? -1 : 1), undefined, 'tab');
  }

  try { localStorage.setItem('lx-last-tab', id); } catch (e) { if (LX_DEBUG) console.warn(e); }
  if (pushHash && location.hash.replace('#', '') !== id) location.hash = id;

  if (playSound && prevId && prevId !== id) {
    const prevCat = categories.find(c => c.id === prevId);
    if (prevCat) sfx.switchSweep(prevCat.key, cat.key);
  }

  return rendered;
};

const buildTabRail = () => {
  const rail = document.getElementById('tabRail');
  rail.querySelectorAll('.tab-btn').forEach(btn => btn.remove());
  categories.forEach((cat, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tab-btn';
    btn.id = `tab-${cat.id}`;
    btn.dataset.id = cat.id;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('aria-controls', 'appGrid');
    btn.setAttribute('aria-label', loc(cat.label));
    btn.title = loc(cat.label);
    btn.tabIndex = -1;
    btn.innerHTML = `${icon(cat.icon)}<span class="label" aria-hidden="true"><span>${escapeHtml(loc(cat.label))}</span></span>`;
    btn.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      btn._pdActivated = true;
      setInteractionOrigin(btn);
      if (currentTabId !== cat.id) activateTab(cat.id);
    });
    btn.addEventListener('click', () => {
      if (currentTabId === cat.id) { btn._pdActivated = false; return; }
      if (btn._pdActivated) { btn._pdActivated = false; return; }
      setInteractionOrigin(btn);
      activateTab(cat.id);
    });
    btn.addEventListener('mouseenter', () => sfx.hover(cat.key + i, { throttle: false }));
    btn.addEventListener('focus', () => sfx.hover(cat.key + i, { throttle: false }));
    rail.appendChild(btn);
  });
  measureRail();
};

const getInitialTab = () => {
  const fromHash = location.hash.replace('#', '');
  if (categories.some(c => c.id === fromHash)) return fromHash;
  let stored = null;
  try { stored = localStorage.getItem('lx-last-tab'); } catch (e) { if (LX_DEBUG) console.warn(e); }
  if (categories.some(c => c.id === stored)) return stored;
  return categories[0]?.id;
};

const handleHashNav = () => {
  const id = location.hash.replace('#', '');
  if (categories.some(c => c.id === id) && id !== currentTabId) {
    activateTab(id, { pushHash: false, playSound: false });
  }
};

const normalizeAr = (s) => s.toLowerCase()
  .replace(/[\u200c\u200f\u202b\u202c]/g, '')
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[ةه]/g, 'ه').replace(/[ؤئ]/g, 'ء')
  .replace(/\s+/g, ' ').trim();

const normMap = (s) => {
  let out = '', map = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i].toLowerCase();
    if (/[\u200c\u200f\u202b\u202c\u064B-\u0652\u0670\u0640]/.test(c)) continue;
    c = c.replace(/[أإآٱ]/, 'ا').replace(/ى/, 'ي').replace(/[ةه]/, 'ه').replace(/[ؤئ]/, 'ء');
    out += c; map.push(i);
  }
  return { out, map };
};

const highlightTitle = (title, query) => {
  const nq = normalizeAr(query);
  if (!nq) return escapeHtml(title);
  const { out, map } = normMap(title);
  const hits = new Set();

  const i = out.indexOf(nq);
  if (i >= 0) {
    for (let k = i; k < i + nq.length; k++) hits.add(map[k]);
  } else {
    let qi = 0;
    for (let k = 0; k < out.length && qi < nq.length; k++) {
      if (out[k] === nq[qi]) { hits.add(map[k]); qi++; }
    }
    if (qi < nq.length) return escapeHtml(title);
  }

  let out2 = '';
  let i2 = 0;
  while (i2 < title.length) {
    if (hits.has(i2)) {
      let j = i2;
      while (j < title.length && hits.has(j)) j++;
      out2 += `<mark>${escapeHtml(title.slice(i2, j))}</mark>`;
      i2 = j;
    } else {
      let j = i2;
      while (j < title.length && !hits.has(j)) j++;
      out2 += escapeHtml(title.slice(i2, j));
      i2 = j;
    }
  }
  return out2;
};

const fuzzyScore = (query, target) => {
  const t = normalizeAr(target), q = normalizeAr(query);
  if (!q) return 0;
  const i = t.indexOf(q);
  if (i === 0) return 1000;
  if (i > 0 && t[i - 1] === ' ') return 850;
  if (i > 0) return 700 - i;
  let qi = 0, run = 0, s = 0;
  for (let k = 0; k < t.length && qi < q.length; k++) {
    if (t[k] === q[qi]) { qi++; run++; s += 4 + run * 3; } else run = 0;
  }
  return qi === q.length ? s : -1;
};

const EXTRA_CAT = { id: '_extra', label: { ar: 'مشغّل بديل', en: 'Alt launcher' } };
const extraEntries = [
  { app: { id: 'alt', title: { ar: 'الحساب البديل', en: 'Alt Account' }, url: 'https://alt-app-lanucher.vercel.app/', icon: 'fa-user-secret', gradient: ['#334155', '#94a3b8', '#0f172a'] }, cat: EXTRA_CAT },
  { app: { id: 'harvest', title: { ar: 'الحصاد', en: 'Harvest' }, url: 'https://harvest-studio-phi.vercel.app/', icon: 'fa-rotate-right', gradient: ['#3f6212', '#a3e635', '#1a2e05'] }, cat: EXTRA_CAT }
];
try { localStorage.removeItem('lx-unlocked-secrets'); } catch (e) { if (LX_DEBUG) console.warn(e); }

const allPaletteEntries = () => {
  const normal = categories.flatMap(cat => cat.apps.flatMap(app => {
    if (app.variants) {
      return app.variants.map((v, i) => ({
        app: {
          id: `${app.id}::${v.id}`,
          title: { ar: `${app.title.ar} · ${v.label.ar}`, en: `${app.title.en} · ${v.label.en}` },
          url: v.url,
          icon: v.icon,
          gradient: app.gradient,
          isNew: app.isNew,
          since: app.since,
          closed: app.closed,
          parentId: app.id,
          parentTitle: app.title,
          variantIndex: i
        },
        cat
      }));
    }
    return [{ app, cat }];
  }));
  return normal.concat(extraEntries);
};

const RECENTS_KEY = 'lx-recents';
const RECENTS_CAP = 8;
const FREQ_KEY = 'lx-freq';
const FREQ_CAP = 10;

const getRecentIds = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (e) { return []; }
};

const pushRecent = (id) => {
  try {
    const list = getRecentIds().filter(x => x !== id);
    list.unshift(id);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_CAP)));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

const getFreqMap = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(FREQ_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (e) { return {}; }
};

const bumpFreq = (id) => {
  try {
    const map = getFreqMap();
    map[id] = (map[id] || 0) + 1;
    localStorage.setItem(FREQ_KEY, JSON.stringify(map));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

const getRecentEntries = (allEntries, limit) => {
  const ids = getRecentIds();
  const freq = getFreqMap();
  const byId = new Map();
  allEntries.forEach(e => { if (!byId.has(e.app.id)) byId.set(e.app.id, e); });
  allEntries.forEach(e => { if (e.app.parentId && !byId.has(e.app.parentId)) byId.set(e.app.parentId, e); });

  const candidateIds = new Set([...ids, ...Object.keys(freq)]);
  const scored = [];
  candidateIds.forEach(id => {
    const e = byId.get(id);
    if (!e) return;
    const pos = ids.indexOf(id);
    const recencyScore = pos === -1 ? 0 : (RECENTS_CAP - pos) / RECENTS_CAP;
    const freqScore = Math.min(freq[id] || 0, FREQ_CAP) / FREQ_CAP;
    scored.push({ entry: e, score: recencyScore * 0.6 + freqScore * 0.4 });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
};

let paletteItems = [];
let paletteActiveIndex = -1;
let paletteActionIndex = 0;
let paletteZone = 'list';
let paletteTryPicks = null;

let paletteEntranceArmed = false;

let lastDetailKey = null;
let paletteSkipCloseChime = false;
let paletteBusy = false;
let heroReturnFocus = false;
let heroRestBox = null;

const syncHeroRestBox = () => {
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open) return;
  const hero = document.getElementById('lxBarSearch');
  if (hero) heroRestBox = hero.getBoundingClientRect();
};

const getActionsForEntry = (entry) => {
  if (entry && entry.app.command) return [{ id: 'run', icon: 'fa-bolt', label: t('actionRun'), kbd: 'Enter' }];
  const newTab = { id: 'new-tab', icon: 'fa-arrow-up-right-from-square', label: t('actionNewTab') };
  const sameTab = { id: 'same-tab', icon: 'fa-arrow-right-to-bracket', label: t('actionSameTab') };
  const [primary, secondary] = openMode() === 'same' ? [sameTab, newTab] : [newTab, sameTab];
  const actions = [
    { ...primary, kbd: 'Enter' },
    { ...secondary, kbd: 'Shift+Enter' },
    { id: 'copy-link', icon: 'fa-copy', label: t('actionCopyLink'), kbd: 'Ctrl/Cmd+Enter' },
    { id: 'copy-title', icon: 'fa-font', label: t('actionCopyTitle'), kbd: '' },
    { id: 'qr', icon: 'fa-qrcode', label: t('actionQr'), kbd: 'Alt+Q' }
  ];
  if (entry && entry.cat.id !== '_extra') {
    actions.push({ id: 'reveal', icon: 'fa-crosshairs', label: t('actionReveal'), kbd: '' });
  }
  return actions;
};

const CMD_CAT = { id: '_cmd', label: STRINGS.commandsGroup };

const commandEntries = () => {
  const zen = document.body.classList.contains('is-zen');
  const cmd = (id, title, iconName, accent, run, kbd = '') => ({
    app: { id: 'cmd-' + id, title, icon: iconName, gradient: [accent], command: true, run, kbd },
    cat: CMD_CAT
  });
  const press = (id) => () => document.getElementById(id)?.click();
  const list = [
    cmd('theme', isLightTheme ? STRINGS.themeToDark : STRINGS.themeToLight, isLightTheme ? 'fa-moon' : 'fa-sun', '#c6a04e', press('themeToggle')),
    cmd('lang', lang === 'ar' ? STRINGS.langSwitchToEn : STRINGS.langSwitchToAr, 'fa-language', '#3ea88d', press('langToggle')),
    cmd('zen', zen ? STRINGS.zenExit : STRINGS.zenEnter, zen ? 'fa-compress' : 'fa-expand', '#8f7ae8', press('zenToggle'), 'Alt+Z'),
    cmd('sound', sfx.enabled ? STRINGS.soundMute : STRINGS.soundEnable, sfx.enabled ? 'fa-volume-mute' : 'fa-volume-up', '#5e8df0', press('soundToggle')),
  ];
  const nextOpen = otherOpenMode();
  list.push(cmd('open-mode', {
    ar: STRINGS.cmdOpenMode.ar.replace('{m}', STRINGS['openMode_' + nextOpen].ar),
    en: STRINGS.cmdOpenMode.en.replace('{m}', STRINGS['openMode_' + nextOpen].en)
  }, openModeIcon(nextOpen), '#5aa9a0', () => setOpenMode(nextOpen, { silent: false }), 'Alt+O'));
  const curP = paletteMode(), curC = cornersMode(), curV = viewMode();
  PALETTES.forEach((p) => {
    if (p === curP) return;
    list.push(cmd('palette-' + p, {
      ar: `${STRINGS.lookColors.ar}: ${STRINGS['palette_' + p].ar}`,
      en: `${STRINGS.lookColors.en}: ${STRINGS['palette_' + p].en}`
    }, 'fa-sliders', PALETTE_SWATCHES[p][0], () => setPaletteMode(p), p === cycle(PALETTES, curP) ? 'Alt+P' : ''));
  });
  CORNERS.forEach((c) => {
    if (c === curC) return;
    list.push(cmd('corners-' + c, {
      ar: `${STRINGS.lookCorners.ar}: ${STRINGS['corners_' + c].ar}`,
      en: `${STRINGS.lookCorners.en}: ${STRINGS['corners_' + c].en}`
    }, 'fa-clone', '#8a93a6', () => setCornersMode(c), c === cycle(CORNERS, curC) ? 'Alt+R' : ''));
  });
  const nextView = cycle(VIEWS, curV);
  list.push(cmd('view', STRINGS.cmdSwitchView, VIEW_ICONS[nextView], '#8a93a6', () => setViewMode(nextView, { silent: false }), 'Alt+V'));
  categories.forEach((c) => {
    if (c.id === currentTabId) return;
    const label = c.label || {};
    list.push(cmd('tab-' + c.id, {
      ar: `${STRINGS.cmdGoTo.ar} ${label.ar ?? label.en ?? ''}`,
      en: `${STRINGS.cmdGoTo.en} ${label.en ?? label.ar ?? ''}`
    }, c.icon, c.accent || '#7c9bff', () => activateTab(c.id)));
  });
  list.push(cmd('share-site', STRINGS.cmdShareSite, 'fa-qrcode', '#6d8cff', () => openQrForSite(), 'Alt+Q'));
  list.push(cmd('refresh', STRINGS.refreshCatalog, 'fa-rotate-right', '#22c1a4', () => hardRefreshCatalog()));
  list.push(cmd('import', STRINGS.dataImport, 'fa-box-open', '#cf8350', () => importUserLinks()));
  list.push(cmd('export', STRINGS.dataExport, 'fa-file-lines', '#4aa5c5', () => exportUserData()));
  return list;
};

const scoreCommand = (query, entry) => Math.max(fuzzyScore(query, entry.app.title.ar), fuzzyScore(query, entry.app.title.en));

const keyGlyph = (k) => {
  const mac = isMacPlatform();
  if (k === 'Enter') return '↵';
  if (k === 'Shift') return mac ? '⇧' : 'Shift';
  if (k === 'Alt') return mac ? '⌥' : 'Alt';
  if (k === 'Ctrl/Cmd') return mac ? '⌘' : 'Ctrl';
  return k;
};

const keycapsHtml = (combo) => combo ? combo.split('+').map((k) => `<kbd>${escapeHtml(keyGlyph(k))}</kbd>`).join('') : '';

const runCommand = (entry) => {
  const dialog = document.getElementById('lx-palette');
  const go = () => requestAnimationFrame(() => entry.app.run());
  if (!dialog.open) { go(); return; }
  dialog.addEventListener('close', go, { once: true });
  if (paletteBusy) closePaletteImmediate(); else requestClosePalette();
};

let paletteCmdMode = false;

const updatePaletteMode = (isCmd) => {
  const el = document.getElementById('paletteMode');
  if (el && el.hidden === isCmd) el.hidden = !isCmd;
  document.getElementById('lx-palette')?.classList.toggle('is-command-mode', isCmd);
  const input = document.getElementById('paletteInput');
  if (input) input.setAttribute('placeholder', t(isCmd ? 'cmdPlaceholder' : 'searchPlaceholder'));
};

const syncPaletteCursor = (instant = false) => {
  const list = document.getElementById('paletteResults');
  if (!list) return;
  let cursor = list.querySelector(':scope > .palette-cursor');
  if (!cursor) {
    cursor = document.createElement('li');
    cursor.className = 'palette-cursor';
    cursor.setAttribute('role', 'presentation');
    cursor.setAttribute('aria-hidden', 'true');
    list.prepend(cursor);
    instant = true;
  }
  const entry = paletteItems[paletteActiveIndex];
  const li = entry ? document.getElementById('palette-item-' + sanitizeDomId(paletteEntryKey(entry))) : null;
  if (!li) { cursor.classList.remove('is-visible'); return; }
  const h = li.offsetHeight;
  if (!h) return;
  const snap = instant || !cursor.classList.contains('is-visible');
  if (snap) cursor.classList.add('is-snapping');
  cursor.style.transform = `translate3d(0, ${li.offsetTop}px, 0)`;
  cursor.style.height = `${h}px`;
  cursor.classList.add('is-visible');
  cursor.classList.toggle('is-dimmed', paletteZone === 'actions');
  if (snap) {
    void cursor.offsetHeight;
    cursor.classList.remove('is-snapping');
  }
};

const scoreEntry = (query, entry) => {
  const titleArScore = fuzzyScore(query, entry.app.title.ar);
  const titleEnScore = fuzzyScore(query, entry.app.title.en);
  const catScore = fuzzyScore(query, loc(entry.cat.label));
  let hostScore = -1;
  try { hostScore = fuzzyScore(query, new URL(entry.app.url).hostname) * 0.4; } catch (e) { if (LX_DEBUG) console.warn(e); }
  let s = Math.max(titleArScore, titleEnScore, catScore, hostScore);
  if (s >= 0 && entry.cat.id === currentTabId) s += 40;
  return s;
};

const paletteEntryKey = (e) => e.app.id;

const sanitizeDomId = (key) => String(key).replace(/[^a-zA-Z0-9_-]/g, '-');

const paletteTrailHtml = (e) => e.app.command && e.app.kbd ? keycapsHtml(e.app.kbd) : '<kbd>↵</kbd>';
const paletteTrailClass = (e) => 'palette-item-trail' + (e.app.command && e.app.kbd ? ' is-persistent' : '');

const paletteItemContentHtml = (e, query) => `${wrapOpen(e.app, null)}${markHtml(e.app, null, e.app.icon, 'app-icon')}</div><div class="palette-item-text"><span class="palette-item-title">${highlightTitle(loc(e.app.title), query)}</span><span class="palette-item-cat">${escapeHtml(loc(e.cat.label))}</span></div><span class="${paletteTrailClass(e)}" aria-hidden="true">${paletteTrailHtml(e)}</span><button type="button" class="palette-qr" tabindex="-1" aria-label="${escapeHtml(t('ctxQr'))}"${e.app.command ? ' hidden' : ''}>${icon('fa-qrcode')}<span aria-hidden="true">QR</span></button>`;

const buildPaletteItemNode = (e, globalIndex, query, isActive) => {
  const li = document.createElement('li');
  li.className = 'palette-item' + (isActive ? ' is-active' : '');
  li.setAttribute('role', 'option');
  li.id = 'palette-item-' + sanitizeDomId(paletteEntryKey(e));
  li.setAttribute('aria-selected', String(isActive));
  li.dataset.key = paletteEntryKey(e);
  li.dataset.index = String(globalIndex);
  li.setAttribute('style', `${gradVars(appGradient(e.app))}--n:${globalIndex};`);
  li.innerHTML = paletteItemContentHtml(e, query);
  return li;
};

const updatePaletteItemNode = (li, e, globalIndex, query, isActive) => {
  li.classList.toggle('is-active', isActive);
  li.setAttribute('aria-selected', String(isActive));
  li.dataset.index = String(globalIndex);
  li.style.setProperty('--n', globalIndex);
  if (e.app.gradient) li.style.setProperty('--c1', tone(appGradient(e.app)[0]));
  const tileEl = li.querySelector('.app-icon-wrapper');
  if (tileEl) retileIcon(tileEl, e.app, null, e.app.icon);
  const titleEl = li.querySelector('.palette-item-title');
  if (titleEl) titleEl.innerHTML = highlightTitle(loc(e.app.title), query);
  const catEl = li.querySelector('.palette-item-cat');
  if (catEl) catEl.textContent = loc(e.cat.label);
  const qrEl = li.querySelector('.palette-qr');
  if (qrEl) {
    qrEl.hidden = !!e.app.command;
    qrEl.setAttribute('aria-label', t('ctxQr'));
  }
  const trailEl = li.querySelector('.palette-item-trail');
  if (trailEl) {
    trailEl.className = paletteTrailClass(e);
    trailEl.innerHTML = paletteTrailHtml(e);
  }
};

const buildPaletteHeaderNode = (text) => {
  const li = document.createElement('li');
  li.className = 'palette-group-header';
  li.setAttribute('role', 'presentation');
  li.textContent = text;
  return li;
};

let paletteScope = 'all';
let paletteScopesKey = '';

const scopeList = () => [{ id: 'all', label: STRINGS.scopeAll, accent: '#7c9bff', icon: 'fa-layer-group' }, ...categories];

const renderPaletteScopes = (counts, isCmd) => {
  const host = document.getElementById('paletteScopes');
  if (!host) return;
  host.hidden = isCmd || categories.length < 2;
  if (host.hidden) return;
  const list = scopeList();
  const key = `${lang}|${list.map(s => s.id).join(',')}`;
  if (key !== paletteScopesKey) {
    paletteScopesKey = key;
    host.querySelectorAll('.palette-scope').forEach(b => b.remove());
    list.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'palette-scope';
      b.dataset.scope = s.id;
      b.setAttribute('role', 'radio');
      b.tabIndex = -1;
      b.style.setProperty('--scope-accent', tone(s.accent || '#7c9bff'));
      b.innerHTML = `${s.id === 'all' ? '' : icon(s.icon)}<span class="palette-scope-label">${escapeHtml(loc(s.label))}</span><span class="palette-scope-count"></span>`;
      b.addEventListener('click', () => setPaletteScope(s.id));
      host.appendChild(b);
    });
  }
  host.querySelectorAll('.palette-scope').forEach((b) => {
    const on = b.dataset.scope === paletteScope;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
    const n = counts[b.dataset.scope] || 0;
    const countEl = b.querySelector('.palette-scope-count');
    if (countEl.textContent !== String(n)) countEl.textContent = String(n);
    b.classList.toggle('is-empty', !n);
  });
  requestAnimationFrame(syncScopeIndicator);
};

const syncScopeIndicator = () => {
  const host = document.getElementById('paletteScopes');
  const ind = host?.querySelector('.palette-scope-indicator');
  const active = host?.querySelector('.palette-scope.is-active');
  if (!ind || !active) return;
  const first = !ind.classList.contains('is-ready');
  if (first) ind.style.transition = 'none';
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translate3d(${active.offsetLeft}px, 0, 0)`;
  ind.style.setProperty('--scope-accent', active.style.getPropertyValue('--scope-accent'));
  if (first) { void ind.offsetWidth; ind.style.transition = ''; ind.classList.add('is-ready'); }
};

const setPaletteScope = (id) => {
  if (id === paletteScope) return;
  paletteScope = id;
  sfx.tick(scopeList().findIndex(s => s.id === id));
  const input = document.getElementById('paletteInput');
  renderPaletteResults(input ? input.value : '');
  input?.focus({ preventScroll: true });
};

const cyclePaletteScope = (step) => {
  const list = scopeList();
  const i = Math.max(0, list.findIndex(s => s.id === paletteScope));
  setPaletteScope(list[(i + step + list.length) % list.length].id);
};

const renderPaletteResults = (rawQuery) => {
  const paletteResults = document.getElementById('paletteResults');
  const isCmd = paletteCmdMode;
  const query = isCmd ? rawQuery.trim() : rawQuery;
  if (paletteScope !== 'all' && !categories.some(c => c.id === paletteScope)) paletteScope = 'all';
  const everyEntry = allPaletteEntries();
  const scopeCounts = { all: 0 };
  if (!isCmd) {
    everyEntry.forEach((e) => {
      if (query && scoreEntry(query, e) < 0) return;
      scopeCounts.all++;
      scopeCounts[e.cat.id] = (scopeCounts[e.cat.id] || 0) + 1;
    });
  }
  const scoped = paletteScope !== 'all';
  const allEntries = scoped ? everyEntry.filter(e => e.cat.id === paletteScope) : everyEntry;
  const commands = commandEntries();
  const rankCommands = (q) => commands
    .map(e => ({ app: e.app, cat: e.cat, score: scoreCommand(q, e) }))
    .filter(e => e.score >= 0)
    .sort((a, b) => b.score - a.score);
  const scored = isCmd ? [] : allEntries
    .map(e => ({ app: e.app, cat: e.cat, score: scoreEntry(query, e) }))
    .filter(e => e.score >= 0)
    .sort((a, b) => b.score - a.score);
  const cmdHits = !isCmd && !scoped && query.trim().length >= 2
    ? rankCommands(query).filter(e => e.score >= 100).slice(0, 3)
    : [];

  const prevActiveEntry = paletteItems[paletteActiveIndex];
  const prevActiveKey = prevActiveEntry ? paletteEntryKey(prevActiveEntry) : null;

  const rows = [];

  if (isCmd) {
    paletteTryPicks = null;
    paletteItems = query ? rankCommands(query) : commands;
    if (paletteItems.length) rows.push({ type: 'header', text: t('commandsGroup') });
    paletteItems.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
  } else if (!query && !scored.length) {
    paletteItems = [];
  } else if (!query) {
    paletteTryPicks = null;
    const recents = scoped ? [] : getRecentEntries(allEntries, 5);
    const recentIds = new Set(recents.map(e => e.app.id));
    const rest = scored.filter(e => !recentIds.has(e.app.id));
    paletteItems = [...recents, ...rest];
    if (recents.length) {
      rows.push({ type: 'header', text: t('recentGroup') });
      recents.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
      rows.push({ type: 'header', text: t('allGroup') });
      rest.forEach((e, i) => rows.push({ type: 'item', entry: e, index: recents.length + i }));
    } else {
      rest.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
    }
  } else if (scored.length || cmdHits.length) {
    paletteTryPicks = null;
    paletteItems = [...scored, ...cmdHits];
    scored.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
    if (cmdHits.length) {
      rows.push({ type: 'header', text: t('commandsGroup') });
      cmdHits.forEach((e, i) => rows.push({ type: 'item', entry: e, index: scored.length + i }));
    }
  } else {
    if (!paletteTryPicks) {
      const pool = allEntries.filter(e => e.cat.id !== '_extra');
      const picks = [];
      const used = new Set();
      while (picks.length < Math.min(3, pool.length)) {
        const idx = Math.floor(Math.random() * pool.length);
        if (used.has(idx)) continue;
        used.add(idx);
        picks.push(pool[idx]);
      }
      paletteTryPicks = picks;
    }
    paletteItems = paletteTryPicks;
    rows.push({ type: 'header', text: t('tryGroup') });
    paletteTryPicks.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
  }

  let newActiveIndex = prevActiveKey ? paletteItems.findIndex(e => paletteEntryKey(e) === prevActiveKey) : -1;
  if (newActiveIndex === -1) newActiveIndex = paletteItems.length ? 0 : -1;
  paletteActiveIndex = newActiveIndex;
  paletteActionIndex = 0;
  paletteZone = 'list';

  paletteResults.classList.toggle('entrance-armed', paletteEntranceArmed);
  paletteEntranceArmed = false;

  if (!rows.length) {
    paletteResults.innerHTML = `<li class="palette-empty">${escapeHtml(t('noResults'))}</li>`;
  } else {
    const pool = new Map();
    paletteResults.querySelectorAll('.palette-item').forEach(li => pool.set(li.dataset.key, li));
    paletteResults.querySelectorAll('.palette-group-header, .palette-empty').forEach(el => el.remove());

    const usedKeys = new Set();
    rows.forEach(row => {
      if (row.type === 'header') {
        paletteResults.appendChild(buildPaletteHeaderNode(row.text));
        return;
      }
      const key = paletteEntryKey(row.entry);
      const isActive = row.index === paletteActiveIndex;
      let li = pool.get(key);
      if (li) {
        updatePaletteItemNode(li, row.entry, row.index, query, isActive);
      } else {
        li = buildPaletteItemNode(row.entry, row.index, query, isActive);
      }
      usedKeys.add(key);
      paletteResults.appendChild(li);
    });
    pool.forEach((li, key) => { if (!usedKeys.has(key)) li.remove(); });
  }

  updateActiveDescendant();
  updateLiveAccent();
  renderPaletteDetail();
  updatePaletteGhost(isCmd ? '' : query);
  updatePaletteStatus(query, isCmd ? paletteItems.length : scored.length + cmdHits.length, isCmd);
  updatePaletteMode(isCmd);
  renderPaletteScopes(scopeCounts, isCmd);
  syncPaletteCursor();
  scheduleWarmActiveEntry();
};

let paletteGhostTail = '';

const updatePaletteGhost = (query) => {
  const ghostEl = document.getElementById('paletteGhost');
  if (!ghostEl) return;
  const top = paletteItems[0];
  paletteGhostTail = '';
  if (query && top) {
    const title = loc(top.app.title);
    const nq = normalizeAr(query);
    const { out, map } = normMap(title);
    if (nq && out.startsWith(nq)) {
      paletteGhostTail = title.slice(nq.length < map.length ? map[nq.length] : title.length);
    }
  }
  ghostEl.innerHTML = paletteGhostTail
    ? `<span class="ghost-typed">${escapeHtml(query)}</span><span class="ghost-tail">${escapeHtml(paletteGhostTail)}</span>`
    : '';
};

let paletteStatusAnnounceTimer;
const updatePaletteStatus = (query, resultCount, isCmd = false) => {
  const statusEl = document.getElementById('paletteStatus');
  if (!statusEl) return;
  const activeCat = categories.find(c => c.id === currentTabId);
  const scopeLabel = isCmd ? t('commandsGroup') : (activeCat ? loc(activeCat.label) : '');
  const text = query
    ? (resultCount ? `${resultCount} ${t('resultsCountLabel')}` : '')
    : scopeLabel;
  if (query && paletteGhostTail) {
    const arrow = document.documentElement.dir === 'rtl' ? '←' : '→';
    statusEl.innerHTML = `${escapeHtml(text)} <span class="palette-ghost-hint">${arrow}</span>`;
  } else {
    statusEl.textContent = text;
  }
  clearTimeout(paletteStatusAnnounceTimer);
  if (query) paletteStatusAnnounceTimer = setTimeout(() => announcePalette(text), 600);
};

const setPaletteActive = (i, { scroll = true } = {}) => {
  paletteActiveIndex = i;
  paletteZone = 'list';
  paletteActionIndex = 0;
  document.querySelectorAll('#paletteResults .palette-item').forEach((li) => {
    const on = Number(li.dataset.index) === i;
    li.classList.toggle('is-active', on);
    li.setAttribute('aria-selected', String(on));
  });
  const activeEntry = paletteItems[i];
  if (activeEntry && scroll) {
    document.getElementById('palette-item-' + sanitizeDomId(paletteEntryKey(activeEntry)))?.scrollIntoView({ block: 'nearest' });
  }
  updateActiveDescendant();
  updateLiveAccent();
  renderPaletteDetail();
  syncPaletteCursor();
  scheduleWarmActiveEntry();
};

const renderPaletteDetail = () => {
  const detail = document.getElementById('paletteDetail');
  const entry = paletteItems[paletteActiveIndex];
  const key = entry ? `${entry.app.id}::${lang}` : `::${lang}`;
  if (key === lastDetailKey) return;
  lastDetailKey = key;

  if (!entry) {
    detail.removeAttribute('style');
    detail.innerHTML = `
      <div class="palette-detail-empty">
        ${icon('fa-magnifying-glass')}
        <span>${escapeHtml(t('noResultsMatch'))}</span>
      </div>`;
    return;
  }

  const { app, cat } = entry;
  detail.setAttribute('style', gradVars(appGradient(app)));

  const actionsHtml = `
    <div class="palette-actions" role="group" aria-label="${escapeHtml(t('actionsLabel'))}">
      ${getActionsForEntry(entry).map((a, i) => `
        <button type="button" class="palette-action${i === 0 ? ' is-primary' : ''}" id="palette-action-${a.id}" data-action="${a.id}">
          <span class="palette-action-icon">${icon(a.icon)}</span>
          <span class="palette-action-label">${escapeHtml(a.label)}</span>
          ${a.kbd ? `<span class="palette-keys">${keycapsHtml(a.kbd)}</span>` : ''}
        </button>
      `).join('')}
    </div>`;
  const slabHtml = `
    <div class="palette-detail-slab">
      <div class="palette-detail-slab-noise"></div>
      ${icon(app.icon, 'palette-detail-watermark')}
    </div>`;
  const fact = (label, value, cls = '') => `<div class="palette-fact"><dt>${escapeHtml(label)}</dt><dd${cls ? ` class="${cls}"` : ''}>${value}</dd></div>`;

  if (app.command) {
    detail.innerHTML = `
      ${slabHtml}
      <div class="palette-detail-header">
        <div class="app-icon-wrapper">${icon(app.icon, 'app-icon')}</div>
        <div class="palette-detail-title-wrap">
          <span class="palette-detail-eyebrow">${escapeHtml(t('commandKind'))}</span>
          <h3 class="palette-detail-title">${escapeHtml(loc(app.title))}</h3>
        </div>
      </div>
      <dl class="palette-facts">${fact(t('factRun'), `<span class="palette-keys">${keycapsHtml('Enter')}</span>`)}${app.kbd ? fact(t('factShortcut'), `<span class="palette-keys">${keycapsHtml(app.kbd)}</span>`) : ''}</dl>
      ${actionsHtml}
    `;
    detail.querySelectorAll('.palette-action').forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        if (paletteZone !== 'actions') sfx.tick(4);
        paletteActionIndex = 0;
        paletteZone = 'actions';
        updateActionHighlight();
      });
      btn.addEventListener('click', () => executeAction('run'));
    });
    updateActionHighlight();
    return;
  }

  let badgesHtml = '';
  if (isFresh(app)) badgesHtml += `<span class="palette-detail-badge badge-new"><span class="badge-dot"></span>${escapeHtml(t('badgeNew'))}</span>`;
  if (app.closed) badgesHtml += `<span class="palette-detail-badge badge-closed"><span class="badge-dot"></span>${escapeHtml(t('badgeClosed'))}</span>`;
  if (app.variantBadge) badgesHtml += `<span class="palette-detail-badge badge-variant">${icon('fa-clone')}${escapeHtml(app.variantBadge)}</span>`;

  let host = '';
  try { host = new URL(app.url).hostname; } catch (e) { if (LX_DEBUG) console.warn(e); }

  const reasonHtml = app.closed ? `<p class="palette-detail-reason">${escapeHtml(app.closedReason ? loc(app.closedReason) : t('closedReasonDefault'))}</p>` : '';

  const opened = Number(getFreqMap()[app.id]) || 0;
  const facts = [];
  if (host) facts.push(fact(t('factLink'), `<span dir="ltr">${escapeHtml(host)}</span>`, 'is-mono'));
  facts.push(opened
    ? fact(t('factActivity'), escapeHtml(fmt('statOpened', { n: opened })))
    : fact(t('factActivity'), escapeHtml(t('statNever')), 'is-quiet'));

  detail.innerHTML = `
    ${slabHtml}
    <div class="palette-detail-header">
      ${wrapOpen(app, null)}
        ${markHtml(app, null, app.icon, 'app-icon')}
      </div>
      <div class="palette-detail-title-wrap">
        <span class="palette-detail-eyebrow">${escapeHtml(loc(cat.label))}</span>
        <h3 class="palette-detail-title">${escapeHtml(loc(app.title))}</h3>
        ${badgesHtml ? `<div class="palette-detail-meta">${badgesHtml}</div>` : ''}
      </div>
    </div>
    ${reasonHtml}
    <dl class="palette-facts">${facts.join('')}</dl>
    ${actionsHtml}
  `;

  detail.querySelectorAll('.palette-action').forEach((btn) => {
    const actionId = btn.dataset.action;
    btn.addEventListener('mouseenter', () => {
      const idx = getActionsForEntry(entry).findIndex(a => a.id === actionId);
      if (paletteZone !== 'actions' || idx !== paletteActionIndex) sfx.tick(idx + 4);
      paletteActionIndex = idx;
      paletteZone = 'actions';
      updateActionHighlight();
    });
    btn.addEventListener('click', () => executeAction(actionId));
  });

  updateActionHighlight();
};

const updateActionHighlight = () => {
  document.querySelectorAll('.palette-action').forEach((btn, i) => {
    const active = paletteZone === 'actions' && i === paletteActionIndex;
    btn.classList.toggle('is-active', active);
  });
  updateActiveDescendant();
  document.querySelector('#paletteResults > .palette-cursor')?.classList.toggle('is-dimmed', paletteZone === 'actions');
};

const updateActiveDescendant = () => {
  const input = document.getElementById('paletteInput');
  if (!input) return;
  if (paletteZone === 'actions') {
    const actions = getActionsForEntry(paletteItems[paletteActiveIndex]);
    const a = actions[paletteActionIndex];
    input.setAttribute('aria-activedescendant', a ? `palette-action-${a.id}` : '');
  } else {
    const activeEntry = paletteItems[paletteActiveIndex];
    input.setAttribute('aria-activedescendant', activeEntry ? `palette-item-${sanitizeDomId(paletteEntryKey(activeEntry))}` : '');
  }
};

const updateLiveAccent = () => {
  const entry = paletteItems[paletteActiveIndex];
  const palette = document.getElementById('lx-palette');
  if (!palette) return;
  palette.style.setProperty('--c1', tone(entry ? appGradient(entry.app)[0] : '#7c9bff'));
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
};

const QR_QUIET = 4;
const QR_PAPER = '#fbfaf7';
const QR_NIGHT = [10, 12, 18];
const QR_LOGO_MAX_VERSION = 8;

const qrBuild = (url) => {
  const high = qrMatrix(url, 'H');
  if (high && high.version <= QR_LOGO_MAX_VERSION) return { m: high, logo: true };
  const m = qrMatrix(url, 'Q') || qrMatrix(url, 'M');
  return m ? { m, logo: false } : null;
};

const qrLogoBox = (m) => {
  const side = (Math.round(m.n * 0.27) | 1);
  const from = Math.floor((m.n - side) / 2);
  return { from, to: from + side, side };
};

const qrInk = (hex) => ({ ink: hexBlend(hex, QR_NIGHT, 0.82), eye: hexBlend(hex, QR_NIGHT, 0.6) });

const qrCell = (x, y, tl, tr, br, bl) => {
  const R = 0.5;
  const a = tl ? R : 0;
  const b = tr ? R : 0;
  const c = br ? R : 0;
  const d = bl ? R : 0;
  return `M${x + a} ${y}H${x + 1 - b}${b ? `a${R} ${R} 0 0 1 ${R} ${R}` : ''}V${y + 1 - c}${c ? `a${R} ${R} 0 0 1 -${R} ${R}` : ''}H${x + d}${d ? `a${R} ${R} 0 0 1 -${R} -${R}` : ''}V${y + a}${a ? `a${R} ${R} 0 0 1 ${R} -${R}` : ''}z`;
};

const qrDots = (m, hidden) => {
  const n = m.n;
  const on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && m.dark(r, c) && !hidden(r, c);
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!on(r, c)) continue;
      const up = on(r - 1, c);
      const dn = on(r + 1, c);
      const lf = on(r, c - 1);
      const rt = on(r, c + 1);
      d += qrCell(c + QR_QUIET, r + QR_QUIET, !up && !lf, !up && !rt, !dn && !rt, !dn && !lf);
    }
  }
  return d;
};

const qrFinder = (x, y, ink, eye) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="${ink}" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1" fill="${eye}"/>`;

const qrSvgMarkup = (m, label, hex, opts = {}) => {
  const n = m.n;
  const size = n + QR_QUIET * 2;
  const { ink, eye } = qrInk(hex);
  const box = opts.logo ? qrLogoBox(m) : null;
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const hidden = (r, c) => inFinder(r, c) || (box && r >= box.from && r < box.to && c >= box.from && c < box.to);
  const dim = opts.px ? ` width="${opts.px}" height="${opts.px}"` : '';
  const bg = opts.paper ? `<rect width="${size}" height="${size}" fill="${QR_PAPER}"/>` : '';
  const q = QR_QUIET;
  return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${dim} role="img" aria-label="${escapeHtml(label)}" shape-rendering="geometricPrecision">${opts.title ? `<title>${escapeHtml(opts.title)}</title><desc>${escapeHtml(opts.desc || '')}</desc>` : ''}${bg}<path d="${qrDots(m, hidden)}" fill="${ink}"/>${qrFinder(q, q, ink, eye)}${qrFinder(q + n - 7, q, ink, eye)}${qrFinder(q, q + n - 7, ink, eye)}</svg>`;
};

const qrFileBase = (s) => (String(s || 'link').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-').replace(/^-+|-+$/g, '') || 'link') + '-qr';

const downloadBlob = (blob, name) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const qrPngBlob = (svg, px = 1024, caption = null) => new Promise((resolve) => {
  const img = new Image();
  const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    URL.revokeObjectURL(href);
    const pad = caption ? Math.round(px * 0.07) : 0;
    const foot = caption ? Math.round(px * 0.17) : 0;
    const cv = document.createElement('canvas');
    cv.width = px + pad * 2;
    cv.height = px + pad * 2 + foot;
    const cx = cv.getContext('2d');
    if (caption) {
      cx.fillStyle = QR_PAPER;
      cx.beginPath();
      cx.roundRect(0, 0, cv.width, cv.height, Math.round(px * 0.06));
      cx.fill();
    }
    cx.drawImage(img, pad, pad, px, px);
    if (caption) {
      cx.textAlign = 'center';
      cx.textBaseline = 'alphabetic';
      cx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
      const fit = (text, weight, size, color, y) => {
        let f = size;
        cx.font = `${weight} ${f}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        while (cx.measureText(text).width > cv.width - pad * 2 && f > 18) { f -= 2; cx.font = `${weight} ${f}px system-ui, -apple-system, "Segoe UI", sans-serif`; }
        cx.fillStyle = color;
        cx.fillText(text, cv.width / 2, y);
      };
      fit(caption.title, 600, Math.round(px * 0.045), '#14161c', px + pad * 2 + Math.round(foot * 0.42));
      fit(caption.host, 400, Math.round(px * 0.032), '#6b6f7a', px + pad * 2 + Math.round(foot * 0.78));
    }
    cv.toBlob((b) => resolve(b), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(href); resolve(null); };
  img.src = href;
});

const qrExportSvg = (url, hex, px, title) => {
  const m = qrMatrix(url, 'Q') || qrMatrix(url, 'M');
  return m ? qrSvgMarkup(m, title || url, hex, { paper: true, px, desc: url, title }) : null;
};

let qrState = null;
let qrOpenedAt = 0;
let qrDownOnBackdrop = false;
let qrDrag = null;
const qrCache = new Map();

const qrUrlFor = (s) => (s.app && s.app.variants && s.app.variants[s.variantIndex] ? s.app.variants[s.variantIndex].url : s.url);

const qrBuildCached = (url) => {
  if (qrCache.has(url)) {
    const hit = qrCache.get(url);
    qrCache.delete(url);
    qrCache.set(url, hit);
    return hit;
  }
  const built = qrBuild(url);
  qrCache.set(url, built);
  if (qrCache.size > 32) qrCache.delete(qrCache.keys().next().value);
  return built;
};

const qrView = (s) => {
  const variant = s.app && s.app.variants ? s.app.variants[s.variantIndex] : null;
  const url = qrUrlFor(s);
  const title = s.app ? loc(s.app.title) : s.title;
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
  const hex = tone(s.app ? appGradient(s.app, variant)[0] : (categories.find(c => c.id === currentTabId)?.accent || '#7c9bff'));
  return { variant, url, title, host, hex, full: variant ? `${title} — ${loc(variant.label)}` : title };
};

const qrMarkHtml = (s, variant) => (s.app
  ? `${wrapOpen(s.app, variant)}${markHtml(s.app, variant, variant ? variant.icon : s.app.icon, 'app-icon')}</div>`
  : `<div class="app-icon-wrapper">${icon('fa-qrcode', 'app-icon')}</div>`);

const qrLogoHtml = (s, variant, built) => {
  const box = qrLogoBox(built.m);
  const frac = box.side / (built.m.n + QR_QUIET * 2);
  const mark = s.app ? qrMarkHtml(s, variant) : `<div class="app-icon-wrapper">${icon('fa-link', 'app-icon')}</div>`;
  return `<span class="qr-logo" style="--qr-logo:${frac.toFixed(4)}" aria-hidden="true">${mark}</span>`;
};

const qrPlaceThumb = (animate) => {
  const track = document.getElementById('qrVariants');
  if (!track || track.hidden) return;
  const thumb = track.querySelector('.qr-thumb');
  const active = track.querySelector('.qr-variant.is-active');
  if (!thumb || !active) return;
  const rtl = document.documentElement.dir === 'rtl';
  const x = rtl ? -(track.clientWidth - active.offsetLeft - active.offsetWidth) : active.offsetLeft;
  thumb.style.transition = animate ? '' : 'none';
  thumb.style.inlineSize = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${x}px)`;
};

const renderQrShell = () => {
  const dialog = document.getElementById('lx-qr');
  const s = qrState;
  const v = qrView(s);
  dialog.setAttribute('aria-label', `${t('actionQr')} — ${v.title}`);
  const track = document.getElementById('qrVariants');
  if (s.app && s.app.variants && s.app.variants.length > 1) {
    track.hidden = false;
    track.setAttribute('aria-label', `${t('chooseVersionOf')} ${v.title}`);
    track.innerHTML = `<span class="qr-thumb" aria-hidden="true"></span>${s.app.variants.map((x, i) => `<button type="button" role="radio" class="qr-variant${i === s.variantIndex ? ' is-active' : ''}" aria-checked="${i === s.variantIndex}" data-qr-variant="${i}">${escapeHtml(loc(x.label))}</button>`).join('')}`;
  } else {
    track.hidden = true;
    track.innerHTML = '';
  }
  const note = document.getElementById('qrNote');
  const closed = s.app && s.app.closed;
  note.hidden = !closed;
  note.textContent = closed ? (s.app.closedReason ? loc(s.app.closedReason) : t('closedReasonDefault')) : '';
  dialog.querySelector('[data-qr="share"]').hidden = typeof navigator.share !== 'function';
  dialog.querySelector('[data-qr="image"]').hidden = !(navigator.clipboard && typeof window.ClipboardItem === 'function');
  const keys = { copy: 'C', png: 'P', svg: 'S', image: 'I' };
  dialog.querySelectorAll('.qr-tools [data-qr]').forEach((b) => {
    const label = b.getAttribute('aria-label') || '';
    b.title = keys[b.dataset.qr] ? `${label} · ${keys[b.dataset.qr]}` : label;
  });
};

const renderQrCode = (swap) => {
  const dialog = document.getElementById('lx-qr');
  const s = qrState;
  const v = qrView(s);
  s.hex = v.hex;
  s.view = v;
  dialog.style.setProperty('--c1', v.hex);
  document.getElementById('qrTitle').textContent = v.full;
  document.getElementById('qrHost').textContent = v.host;
  document.getElementById('qrIcon').innerHTML = qrMarkHtml(s, v.variant);
  const urlEl = document.getElementById('qrUrl');
  urlEl.textContent = v.url;
  urlEl.title = v.url;
  const built = qrBuildCached(v.url);
  s.ok = !!built;
  const stage = document.getElementById('qrStage');
  stage.querySelectorAll('.qr-layer.is-leaving').forEach((n) => n.remove());
  const prev = stage.querySelector('.qr-layer');
  const layer = document.createElement('div');
  layer.className = 'qr-layer';
  layer.innerHTML = built
    ? `${qrSvgMarkup(built.m, `${t('actionQr')}: ${v.url}`, v.hex, { logo: built.logo })}${built.logo ? qrLogoHtml(s, v.variant, built) : ''}`
    : `<div class="qr-fail">${icon('fa-triangle-exclamation')}<span>${escapeHtml(t('qrTooLong'))}</span></div>`;
  stage.classList.toggle('is-swap', swap);
  stage.classList.toggle('is-fail', !built);
  if (prev) {
    if (swap && !MQ.reducedMotion) {
      prev.classList.add('is-leaving');
      prev.addEventListener('animationend', (e) => { if (e.target === prev) prev.remove(); });
    } else prev.remove();
  }
  stage.appendChild(layer);
  dialog.querySelectorAll('[data-qr="png"], [data-qr="svg"], [data-qr="image"]').forEach((b) => { b.disabled = !built; });
  qrPlaceThumb(swap);
  if (swap && v.variant) document.getElementById('qrLive').textContent = `${loc(v.variant.label)} — ${t('qrReady')}`;
};

const qrSetOrigin = (dialog, el) => {
  let fx = 0;
  let fy = 0;
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) {
      fx = Math.max(-40, Math.min(40, (r.left + r.width / 2 - innerWidth / 2) * 0.08));
      fy = Math.max(-40, Math.min(40, (r.top + r.height / 2 - innerHeight / 2) * 0.08));
    }
  }
  dialog.style.setProperty('--qr-fx', `${fx.toFixed(1)}px`);
  dialog.style.setProperty('--qr-fy', `${fy.toFixed(1)}px`);
};

const openQr = (state) => {
  const dialog = document.getElementById('lx-qr');
  if (!dialog || !state) return;
  closeContextMenu();
  const pal = document.getElementById('lx-palette');
  if (pal && pal.open) {
    heroReturnFocus = false;
    paletteSkipCloseChime = true;
    closePaletteImmediate();
  }
  qrState = { ...state, returnTo: state.returnTo || document.activeElement };
  renderQrShell();
  renderQrCode(false);
  qrSetOrigin(dialog, qrState.returnTo);
  dialog.style.translate = '';
  qrOpenedAt = performance.now();
  if (!dialog.open) {
    dialog.showModal();
    sfx.veil(true);
  }
  document.body.classList.add('qr-open');
  qrPlaceThumb(false);
  dialog.querySelector('[data-qr="copy"]')?.focus({ preventScroll: true });
};

const closeQr = () => {
  const dialog = document.getElementById('lx-qr');
  if (!dialog || !dialog.open) return;
  const back = qrState && qrState.returnTo;
  sfx.veil(false);
  dialog.style.translate = '';
  dialog.close();
  document.body.classList.remove('qr-open');
  qrState = null;
  if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
};

const openQrForApp = (app, variantIndex, returnTo) => {
  if (!app) return;
  const vi = app.variants ? (Number.isInteger(variantIndex) && app.variants[variantIndex] ? variantIndex : getSelectedVariantIndex(app)) : -1;
  openQr({ app, variantIndex: vi, url: app.url, returnTo });
};

const openQrForSite = () => openQr({ app: null, variantIndex: -1, title: 'LinkExpress', url: `${location.origin}${location.pathname}${currentTabId ? '#' + currentTabId : ''}` });

const openQrFromPalette = (entry) => {
  const parentId = entry.app.parentId || entry.app.id;
  const realApp = categories.flatMap(c => c.apps).find(a => a.id === parentId);
  const vi = entry.app.parentId ? entry.app.variantIndex : undefined;
  const back = document.querySelector(`#appGrid .app-card[data-app-id="${CSS.escape(parentId)}"] .card-link-overlay`);
  heroReturnFocus = false;
  paletteSkipCloseChime = true;
  closePaletteImmediate();
  requestAnimationFrame(() => {
    if (realApp) openQrForApp(realApp, vi, back);
    else openQr({ app: null, variantIndex: -1, title: loc(entry.app.title), url: entry.app.url, returnTo: back });
  });
};

const openQrFromUrl = () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('qr');
  if (!id) return;
  let frames = 0;
  const attempt = () => {
    const app = findAppById(id);
    if (app) {
      const vid = params.get('v');
      const vi = app.variants && vid ? app.variants.findIndex((x) => x.id === vid) : -1;
      openQrForApp(app, vi >= 0 ? vi : undefined);
      return;
    }
    if (++frames < 240) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
};

const qrSelectVariant = (i) => {
  const dialog = document.getElementById('lx-qr');
  qrState.variantIndex = i;
  dialog.querySelectorAll('[data-qr-variant]').forEach((b) => {
    const on = Number(b.dataset.qrVariant) === i;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  renderQrCode(true);
};

const initQrDialog = () => {
  const dialog = document.getElementById('lx-qr');
  if (!dialog) return;
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  document.getElementById('qrClose')?.addEventListener('click', closeQr);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeQr(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('qr-open');
    qrState = null;
  });
  dialog.addEventListener('pointerdown', (e) => { qrDownOnBackdrop = e.target === dialog && outside(e); });
  const grab = document.getElementById('qrGrab');
  const phone = window.matchMedia('(max-width: 640px)');
  if (grab) {
    grab.addEventListener('pointerdown', (e) => {
      if (!phone.matches) return;
      grab.setPointerCapture(e.pointerId);
      qrDrag = { y: e.clientY, t: e.timeStamp, dy: 0 };
      dialog.classList.add('is-dragging');
    });
    grab.addEventListener('pointermove', (e) => {
      if (!qrDrag) return;
      qrDrag.dy = Math.max(0, e.clientY - qrDrag.y);
      dialog.style.translate = `0 ${qrDrag.dy}px`;
    });
    const endDrag = (e) => {
      if (!qrDrag) return;
      const d = qrDrag;
      qrDrag = null;
      dialog.classList.remove('is-dragging');
      const speed = d.dy / Math.max(1, e.timeStamp - d.t);
      if (d.dy > 80 || speed > 0.5) closeQr();
      else dialog.style.translate = '';
    };
    grab.addEventListener('pointerup', endDrag);
    grab.addEventListener('pointercancel', endDrag);
  }
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      if (performance.now() - qrOpenedAt < 250 || !qrDownOnBackdrop) return;
      if (outside(e)) closeQr();
      return;
    }
    const vb = e.target.closest('[data-qr-variant]');
    if (vb && qrState) {
      const i = Number(vb.dataset.qrVariant);
      if (i === qrState.variantIndex) return;
      sfx.click();
      qrSelectVariant(i);
      return;
    }
    const btn = e.target.closest('[data-qr]');
    if (!btn || !qrState || btn.disabled) return;
    const url = qrUrlFor(qrState);
    const kind = btn.dataset.qr === 'copy-url' ? 'copy' : btn.dataset.qr;
    const fb = kind === 'copy' ? dialog.querySelector('[data-qr="copy"]') : btn;
    const label = fb.querySelector('.qr-action-label');
    const flash = (ok, text) => {
      if (!label) return;
      const prev = label.dataset.rest || label.textContent;
      label.dataset.rest = prev;
      const svg = fb.querySelector('svg');
      const prevIcon = (svg.getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('fa-'));
      setIcon(svg, ok ? 'fa-check' : 'fa-triangle-exclamation');
      label.textContent = text;
      label.classList.remove('is-flash');
      void label.offsetWidth;
      label.classList.add('is-flash');
      clearTimeout(fb._qrFlash);
      fb._qrFlash = setTimeout(() => {
        if (!fb.isConnected) return;
        setIcon(svg, prevIcon === 'fa-check' || prevIcon === 'fa-triangle-exclamation' ? fb.dataset.icon : prevIcon);
        label.textContent = prev;
        label.classList.remove('is-flash');
      }, 1400);
    };
    if (!fb.dataset.icon) fb.dataset.icon = (fb.querySelector('svg').getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('fa-'));
    const name = qrFileBase(qrState.app ? qrState.app.id : 'linkexpress');
    const v = qrState.view;
    const caption = e.altKey ? null : { title: v.full, host: v.host };
    if (kind === 'copy') {
      copyToClipboard(url).then((ok) => { sfx.click(); flash(ok, ok ? t('linkCopied') : t('copyFailed')); });
    } else if (kind === 'png' || kind === 'image') {
      const svg = qrExportSvg(url, qrState.hex, 1024, v.full);
      if (!svg) return;
      const png = qrPngBlob(svg, 1024, caption).then((b) => (b ? b : Promise.reject(new Error('png'))));
      if (kind === 'png') png.then((b) => { downloadBlob(b, `${name}.png`); flash(true, t('qrSaved')); }, () => flash(false, t('copyFailed')));
      else navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => { sfx.click(); flash(true, t('qrImageCopied')); }, () => flash(false, t('copyFailed')));
    } else if (kind === 'svg') {
      const svg = qrExportSvg(url, qrState.hex, undefined, v.full);
      if (!svg) return;
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
      flash(true, t('qrSaved'));
    } else if (kind === 'share') {
      navigator.share({ title: v.full, url }).catch(() => {});
    }
  });
  dialog.addEventListener('keydown', (e) => {
    const vb = e.target.closest && e.target.closest('[data-qr-variant]');
    if (vb && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const all = [...dialog.querySelectorAll('[data-qr-variant]')];
      const fwd = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
      const next = all[(all.indexOf(vb) + (fwd ? 1 : all.length - 1)) % all.length];
      e.preventDefault();
      next.click();
      next.focus({ preventScroll: true });
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || !qrState) return;
    const kind = { c: 'copy', s: 'svg', p: 'png', i: 'image' }[String(e.key).toLowerCase()];
    if (!kind) return;
    const b = dialog.querySelector(`[data-qr="${kind}"]`);
    if (b && !b.hidden && !b.disabled) {
      e.preventDefault();
      b.click();
    }
  });
};

let actionFeedbackTimer;

const announcePalette = (msg) => {
  const live = document.getElementById('paletteLive');
  if (live) live.textContent = msg;
};

const showActionFeedback = (actionId, ok, okLabel, failLabel) => {
  const btn = document.querySelector(`.palette-action[data-action="${actionId}"]`);
  if (!btn) return;
  clearTimeout(actionFeedbackTimer);
  const iconEl = btn.querySelector('svg');
  const label = btn.querySelector('.palette-action-label');
  const prevIconName = (iconEl.getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('fa-')) || DEFAULT_ICON;
  const prevLabelText = label.textContent;
  const msg = ok ? okLabel : failLabel;
  setIcon(iconEl, ok ? 'fa-check' : 'fa-triangle-exclamation');
  label.textContent = msg;
  announcePalette(msg);
  actionFeedbackTimer = setTimeout(() => {
    setIcon(iconEl, prevIconName);
    label.textContent = prevLabelText;
  }, 1400);
};

const revealInGrid = async (entry) => {
  if (entry.cat.id === '_extra') return;
  const targetId = entry.app.parentId || entry.app.id;
  const targetCatId = entry.cat.id;
  closePaletteImmediate();
  if (currentTabId !== targetCatId) await activateTab(targetCatId);
  requestAnimationFrame(() => {
    const card = document.querySelector(`#appGrid .app-card[data-app-id="${CSS.escape(targetId)}"]`);
    if (!card) return;
    const reducedMotion = MQ.reducedMotion;
    card.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    card.classList.add('is-revealed');
    card.addEventListener('animationend', () => card.classList.remove('is-revealed'), { once: true });
    card.querySelector('.card-link-overlay')?.focus({ preventScroll: true });
  });
};

const executeAction = async (actionId) => {
  const entry = paletteItems[paletteActiveIndex];
  if (!entry) return;
  if (entry.app.command) {
    if (actionId === 'copy-link' || actionId === 'copy-title' || actionId === 'qr') return;
    paletteSkipCloseChime = true;
    runCommand(entry);
    return;
  }
  if (entry.app.parentId && (actionId === 'new-tab' || actionId === 'same-tab')) {
    try { localStorage.setItem('lx-variant-' + entry.app.parentId, String(entry.app.variantIndex)); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (actionId === 'new-tab' || actionId === 'same-tab') {
    pushRecent(entry.app.id);
    bumpFreq(entry.app.id);
    try { localStorage.setItem('lx-last-open', entry.app.id); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (actionId === 'new-tab') {
    sfx.click();
    openInNewTab(entry.app.url);
    paletteSkipCloseChime = true;
    document.querySelector('.palette-body')?.classList.add('is-collapsing');
    requestClosePalette();
  } else if (actionId === 'same-tab') {
    sfx.click();
    openInSameTab(entry.app.url);
  } else if (actionId === 'copy-link') {
    const ok = await copyToClipboard(entry.app.url);
    sfx.click();
    showActionFeedback('copy-link', ok, t('linkCopied'), t('copyFailed'));
  } else if (actionId === 'copy-title') {
    const ok = await copyToClipboard(loc(entry.app.parentTitle || entry.app.title));
    sfx.click();
    showActionFeedback('copy-title', ok, t('nameCopied'), t('copyFailed'));
  } else if (actionId === 'qr') {
    sfx.click();
    openQrFromPalette(entry);
  } else if (actionId === 'reveal') {
    sfx.click();
    await revealInGrid(entry);
  }
};

const openPaletteItem = (i) => {
  paletteActiveIndex = i;
  executeAction(openModeAction());
};

const MORPH_OPEN_MS = MOTION.paletteOpen.inMs;
const MORPH_CLOSE_MS = MOTION.paletteClose.outMs;
let paletteOpenFinish = null;

const awaitAnimationSettled = (anim, maxMs) => new Promise((resolve) => {
  let done = false;
  const finishNow = () => {
    if (done) return;
    done = true;
    try { anim.finish(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    resolve();
  };
  const t = setTimeout(finishNow, maxMs);
  anim.finished.catch(() => {}).finally(() => {
    if (done) return;
    done = true;
    clearTimeout(t);
    resolve();
  });
});

const openPalette = (seed = '') => {
  const dialog = document.getElementById('lx-palette');
  if (dialog.open || paletteBusy) return;
  closeContextMenu();
  paletteBusy = true;
  document.querySelector('.palette-body')?.classList.remove('is-collapsing');

  if (activeViewTransition) {
    try { activeViewTransition.skipTransition(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    activeViewTransition = null;
  }

  const hero = document.getElementById('lxBarSearch');
  const input = document.getElementById('paletteInput');
  const reducedMotion = MQ.reducedMotion;
  const skipMorph = !hero || reducedMotion || typeof dialog.animate !== 'function' ||
    window.innerWidth < 1024 || !MQ.hoverFine;

  paletteCmdMode = seed.startsWith('>');
  input.value = paletteCmdMode ? seed.slice(1) : seed;
  seed = input.value;
  paletteTryPicks = null;
  lastDetailKey = null;
  paletteScope = 'all';
  paletteEntranceArmed = true;

  if (hero && !heroRestBox) heroRestBox = hero.getBoundingClientRect();

  const results = document.getElementById('paletteResults');
  if (results) results.style.setProperty('--stagger-base', skipMorph ? '0ms' : '110ms');
  renderPaletteResults(seed);

  document.querySelector('.container').classList.add('is-dollied');
  document.querySelector('.controls-pill').classList.add('is-dollied');
  document.querySelector('.dolly-scrim').classList.add('is-dollied');
  hero?.setAttribute('aria-expanded', 'true');

  if (skipMorph) {
    dialog.showModal();
    syncPaletteCursor(true);
    document.body.classList.add('palette-open');
    sfx.veil(true);
    input.focus({ preventScroll: true });
    paletteBusy = false;
    return;
  }

  const heroBox = heroRestBox;

  dialog.classList.remove('did-morph');
  dialog.classList.add('is-morphing');
  dialog.showModal();
  syncPaletteCursor(true);
  sfx.veil(true);

  let openingFrame = 0;
  let openingDone = false;
  const openingAnims = [];
  const chrome = [dialog.querySelector('.palette-close')].filter(Boolean);
  const finishOpening = () => {
    if (openingDone) return;
    openingDone = true;
    cancelAnimationFrame(openingFrame);
    dialog.style.willChange = '';
    dialog.classList.remove('is-morphing');
    if (dialog.open) dialog.classList.add('did-morph');
    document.body.classList.toggle('palette-open', dialog.open);
    results?.style.removeProperty('--stagger-base');
    openingAnims.forEach(a => { try { a.cancel(); } catch (e) { if (LX_DEBUG) console.warn(e); } });
    chrome.forEach(el => { el.style.opacity = ''; });
    paletteOpenFinish = null;
    paletteBusy = false;
  };
  paletteOpenFinish = finishOpening;
  input.focus({ preventScroll: true });
  openingFrame = requestAnimationFrame(() => {
    if (openingDone || !dialog.open) return;
    const row = dialog.querySelector('.palette-input-row');
    const rowBox = row.getBoundingClientRect();
    const dlgBox = dialog.getBoundingClientRect();

    document.body.classList.add('palette-open');

    const dy = (heroBox.top + heroBox.height / 2) - (rowBox.top + rowBox.height / 2);
    const bottomGap = Math.max(0, dlgBox.height - rowBox.height);

    chrome.forEach(el => { el.style.opacity = '0'; });

    dialog.style.willChange = 'clip-path, transform';
    const panel = dialog.animate([
      { clipPath: `inset(0px 0px ${bottomGap}px 0px round 999px)`, transform: `translateY(${dy}px)` },
      { clipPath: 'inset(0px 0px 0px 0px round 20px)', transform: 'translateY(0)' }
    ], { duration: MORPH_OPEN_MS, easing: EASE_LUX, fill: 'both' });

    const bodyAnim = dialog.querySelector('.palette-body').animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: Math.round(170 * MORPH_OPEN_MS / 420), delay: Math.round(100 * MORPH_OPEN_MS / 420), easing: EASE_LUX, fill: 'both' }
    );
    const chromeAnim = chrome.map(el => el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: Math.round(170 * MORPH_OPEN_MS / 420), delay: Math.round(100 * MORPH_OPEN_MS / 420), easing: EASE_LUX, fill: 'both' }
    ));

    openingAnims.push(panel, bodyAnim, ...chromeAnim);
    awaitAnimationSettled(panel, 600).then(finishOpening);
  });
};

const closePaletteImmediate = () => {
  paletteOpenFinish?.();
  const dialog = document.getElementById('lx-palette');
  if (!dialog.open) return;
  const hero = document.getElementById('lxBarSearch');
  hero?.setAttribute('aria-expanded', 'false');
  if (!paletteSkipCloseChime) sfx.veil(false);
  paletteSkipCloseChime = true;
  document.getElementById('paletteGhost')?.replaceChildren();
  dialog.classList.remove('is-morphing', 'did-morph');
  dialog.style.willChange = '';
  dialog.close();
  document.body.classList.remove('palette-open');
  if (heroReturnFocus) {
    heroReturnFocus = false;
    hero?.focus({ preventScroll: true });
  }
  paletteBusy = false;
};

const requestClosePalette = () => {
  if (paletteOpenFinish) {
    closePaletteImmediate();
    return;
  }
  const dialog = document.getElementById('lx-palette');
  if (!dialog.open || paletteBusy) return;
  paletteBusy = true;

  const hero = document.getElementById('lxBarSearch');
  hero?.setAttribute('aria-expanded', 'false');

  const skipChime = paletteSkipCloseChime;
  if (!skipChime) sfx.veil(false);
  paletteSkipCloseChime = true;

  const g = document.getElementById('paletteGhost'); if (g) g.innerHTML = '';

  const reducedMotion = MQ.reducedMotion;
  const canMorph = !!hero && dialog.classList.contains('did-morph') && !reducedMotion && typeof dialog.animate === 'function';

  const finish = () => {
    dialog.close();
    dialog.style.willChange = '';
    dialog.classList.remove('is-morphing', 'did-morph');
    document.body.classList.remove('palette-open');
    if (heroReturnFocus) {
      heroReturnFocus = false;
      hero?.focus({ preventScroll: true });
    }
    paletteBusy = false;
  };

  if (!canMorph) {
    finish();
    return;
  }

  const row = dialog.querySelector('.palette-input-row').getBoundingClientRect();
  const heroBox = heroRestBox || hero.getBoundingClientRect();
  const dlgBox = dialog.getBoundingClientRect();
  const dy = (heroBox.top + heroBox.height / 2) - (row.top + row.height / 2);
  const bottomGap = Math.max(0, dlgBox.height - row.height);

  dialog.classList.add('is-morphing');
  dialog.style.willChange = 'clip-path, transform';

  const hideHeroTimer = setTimeout(() => { document.body.classList.remove('palette-open'); }, Math.max(0, MORPH_CLOSE_MS - 80));

  const panel = dialog.animate([
    { clipPath: 'inset(0px 0px 0px 0px round 20px)', transform: 'translateY(0)' },
    { clipPath: `inset(0px 0px ${bottomGap}px 0px round 999px)`, transform: `translateY(${dy}px)` }
  ], { duration: MORPH_CLOSE_MS, easing: EASE_ACCEL, fill: 'both' });

  const bodyAnim = dialog.querySelector('.palette-body').animate(
    [{ opacity: 1 }, { opacity: 0 }],
    { duration: Math.round(MORPH_CLOSE_MS * 0.6), easing: EASE_LUX, fill: 'both' }
  );

  awaitAnimationSettled(panel, 600).then(() => {
    clearTimeout(hideHeroTimer);
    try { panel.cancel(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    try { bodyAnim.cancel(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    finish();
  });
};

let idleTimer;
const IDLE_MS = 25000;

let cinemaAnim = null;
const CINEMA_PERIOD_S = 20 * Math.PI * 10;
const cinemaFrames = (() => {
  const frames = [];
  const steps = 480;
  for (let i = 0; i <= steps; i++) {
    const tt = (i / steps) * CINEMA_PERIOD_S;
    const x = 50 + Math.sin(tt * 0.08) * 22;
    const y = 15 + Math.cos(tt * 0.05) * 8;
    frames.push({ transform: `translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, 0)` });
  }
  return frames;
})();

const stopIdle = () => {
  if (!document.body.classList.contains('is-cinema')) return;
  document.body.classList.remove('is-cinema');
  if (cinemaAnim) {
    try { cinemaAnim.commitStyles(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    cinemaAnim.cancel();
    cinemaAnim = null;
  }
};

const startIdle = () => {
  const spot = document.getElementById('spotlight');
  if (!spot || document.hidden) return;
  spot.classList.remove('is-active', 'is-idle');
  document.body.classList.add('is-cinema');
  if (MQ.reducedMotion || typeof spot.animate !== 'function') return;
  cinemaAnim?.cancel();
  cinemaAnim = spot.animate(cinemaFrames, { duration: CINEMA_PERIOD_S * 1000, iterations: Infinity, easing: 'linear' });
};

let armIdleAt = 0;
const armIdle = () => {
  const now = performance.now();
  if (now - armIdleAt < 150) return;
  armIdleAt = now;
  clearTimeout(idleTimer);
  stopIdle();
  idleTimer = setTimeout(startIdle, IDLE_MS);
};

let zenGen = 0;
let zenVT = null;
let zenFallbackAnims = [];
let zenFocusReturn = false;
let zenFontsPending = null;

const isZen = () => document.body.classList.contains('is-zen');

const syncZenMetrics = () => {
  const header = document.querySelector('.site-header');
  if (!header) return;
  const h = isZen() ? (header.firstElementChild?.offsetHeight || 0) : header.scrollHeight;
  if (h) document.documentElement.style.setProperty('--site-header-height', `${Math.ceil(h)}px`);
};

const announceZen = (enabled) => {
  const tabLive = document.getElementById('tabLive');
  if (tabLive) tabLive.textContent = t(enabled ? 'zenEntered' : 'zenExited');
};

const zenNeutralizeSprings = () => {
  document.querySelectorAll('.app-card').forEach((c) => {
    const s = c._springs;
    if (!s) return;
    s.tx.to = 0; s.ty.to = 0; s.tz.to = 0; s.sc.to = 1; s.hov.to = 0; s.reveal.to = 0;
    s.tx.snap(); s.ty.snap(); s.tz.snap(); s.sc.snap(); s.hov.snap(); s.reveal.snap();
  });
};

const zenCancelFallback = () => {
  zenFallbackAnims.forEach((a) => { try { a.cancel(); } catch (e) { if (LX_DEBUG) console.warn(e); } });
  zenFallbackAnims = [];
  document.querySelectorAll('#appGrid .app-card').forEach((card) => {
    const shadow = card.querySelector('.card-shadow');
    const clip = card.querySelector('.card-clip');
    if (shadow) { shadow.style.transform = ''; shadow.style.opacity = ''; }
    if (clip) { clip.style.transform = ''; clip.style.opacity = ''; }
    if (card.classList.contains('app-card--icon')) { card.style.transform = ''; card.style.opacity = ''; }
  });
};

const zenInterrupt = () => {
  if (zenVT) { try { zenVT.skipTransition(); } catch (e) { if (LX_DEBUG) console.warn(e); } zenVT = null; }
  zenCancelFallback();
};

const zenFinish = (gen, zenBtn) => {
  if (gen !== zenGen) return;
  document.documentElement.classList.remove('is-zen-transitioning');
  const appGrid = document.getElementById('appGrid');
  if (appGrid) nameTiles(appGrid, false);
  if (appGrid && appGrid.dataset.layout === 'icons') fitIconLabels(appGrid);
  pointerFieldDirty = true;
  Motion.wake();
  syncHeroRestBox();
  measureRail();
  announceZen(isZen());
  const active = document.activeElement;
  if (zenFocusReturn && zenBtn && document.body.contains(zenBtn) && zenBtn.offsetParent !== null &&
      (active === zenBtn || active === document.body || active === null)) {
    zenBtn.focus();
  }
  zenFocusReturn = false;
  if (zenFontsPending) {
    const cb = zenFontsPending;
    zenFontsPending = null;
    requestAnimationFrame(cb);
  }
};

const syncZenLayout = () => {
  const grid = document.getElementById('appGrid');
  if (!grid) return;
  if (grid.dataset.layout === 'icons') repackIcons(grid);
};

const runZenFlip = (enabled, cards, gen) => {
  zenNeutralizeSprings();
  const rects = cards.map((c) => c.getBoundingClientRect());
  document.body.classList.toggle('is-zen', enabled);
  syncZenLayout();
  updateZenButtonLabel();

  return new Promise((resolve) => requestAnimationFrame(resolve)).then(() => {
    if (gen !== zenGen) return;
    const anims = cards.flatMap((card, i) => {
      const old = rects[i];
      const next = card.getBoundingClientRect();
      const dx = old.left - next.left;
      const dy = old.top - next.top;
      const sxRaw = next.width ? old.width / next.width : 1;
      const syRaw = next.height ? old.height / next.height : 1;
      const scale = Math.min(sxRaw, syRaw);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.002) return [];
      const layers = card.classList.contains('app-card--icon') ? [card] : [card.querySelector('.card-shadow'), card.querySelector('.card-clip')].filter(Boolean);
      return layers.map((layer) => {
        const anim = layer.animate([
          { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0.92 },
          { transformOrigin: '0 0', transform: 'none', opacity: 1 }
        ], { duration: 440, easing: EASE_LUX, fill: 'both' });
        zenFallbackAnims.push(anim);
        return anim;
      });
    });
    return Promise.allSettled(anims.map((a) => a.finished));
  }).finally(() => {
    if (gen === zenGen) zenCancelFallback();
  });
};

const setZenMode = (enabled) => {
  const paletteDialog = document.getElementById('lx-palette');
  if (paletteDialog && paletteDialog.open) return;
  if (document.getElementById('lx-qr')?.open) return;
  if (isZen() === enabled && !document.documentElement.classList.contains('is-zen-transitioning')) return;

  const zenBtn = document.getElementById('zenToggle');
  zenFocusReturn = document.activeElement === zenBtn;

  zenGen += 1;
  const gen = zenGen;
  try { localStorage.setItem('lx-zen', enabled ? '1' : '0'); } catch (e) { if (LX_DEBUG) console.warn(e); }

  zenInterrupt();
  closeContextMenu();
  stopIdle();
  syncZenMetrics();

  if (MQ.reducedMotion) {
    document.documentElement.classList.remove('is-zen-transitioning');
    document.body.classList.toggle('is-zen', enabled);
    syncZenLayout();
    updateZenButtonLabel();
    zenFinish(gen, zenBtn);
    return;
  }

  const appGrid = document.getElementById('appGrid');
  const cards = appGrid ? [...appGrid.querySelectorAll('.app-card')] : [];

  document.documentElement.classList.add('is-zen-transitioning');
  if (appGrid) nameTiles(appGrid, true);

  if (document.startViewTransition) {
    let vt;
    try {
      vt = withViewTransition(() => {
        document.body.classList.toggle('is-zen', enabled);
        syncZenLayout();
        updateZenButtonLabel();
      });
    } catch (e) {
      vt = null;
    }
    if (!vt) {
      document.body.classList.toggle('is-zen', enabled);
      syncZenLayout();
      updateZenButtonLabel();
      zenFinish(gen, zenBtn);
      return;
    }
    zenVT = vt;
    Promise.allSettled([vt.ready, vt.updateCallbackDone, vt.finished]).finally(() => {
      if (zenVT === vt) zenVT = null;
      if (activeViewTransition === vt) activeViewTransition = null;
      zenFinish(gen, zenBtn);
    });
    return;
  }

  runZenFlip(enabled, cards, gen).finally(() => {
    zenFinish(gen, zenBtn);
  });
};

const toggleZenMode = () => { setZenMode(!isZen()); };

const zenForceSettle = () => {
  if (!document.documentElement.classList.contains('is-zen-transitioning')) return;
  zenGen += 1;
  const gen = zenGen;
  zenInterrupt();
  document.documentElement.classList.remove('is-zen-transitioning');
  const appGrid = document.getElementById('appGrid');
  if (appGrid) nameTiles(appGrid, false);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    if (gen !== zenGen) return;
    pointerFieldDirty = true;
    Motion.wake();
    syncHeroRestBox();
    measureRail();
    syncZenMetrics();
  }));
};

window.addEventListener('resize', zenForceSettle, { passive: true });

const togglePalette = () => {
  if (paletteBusy) return;
  const dialog = document.getElementById('lx-palette');
  if (dialog.open) requestClosePalette(); else openPalette();
};

const initBarGlow = () => {
  const bar = document.getElementById('lxBar');
  if (!bar) return;
  if (!MQ.hoverFine) return;

  let rect = null;
  let lit = false;
  const invalidate = () => { rect = null; };
  window.addEventListener('resize', invalidate, { passive: true });
  window.addEventListener('scroll', invalidate, { passive: true, capture: true });
  bar.addEventListener('transitionend', invalidate);
  bar.addEventListener('pointerenter', () => { rect = bar.getBoundingClientRect(); }, { passive: true });
  bar.addEventListener('pointermove', (e) => {
    if (!rect) rect = bar.getBoundingClientRect();
    bar.style.setProperty('--rx', `${e.clientX - rect.left}px`);
    bar.style.setProperty('--ry', `${e.clientY - rect.top}px`);
    if (!lit) { lit = true; bar.style.setProperty('--reveal-o', '0.9'); }
  }, { passive: true });
  bar.addEventListener('pointerleave', () => {
    lit = false;
    bar.style.setProperty('--reveal-o', '0');
  }, { passive: true });
};

const initDebugOverlay = () => {
  if (!LX_DEBUG) return;

  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;bottom:8px;inset-inline-start:8px;z-index:99999;' +
    'background:rgba(0,0,0,.82);color:#5eff8f;font:11px/1.6 ui-monospace,monospace;' +
    'padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre;';
  document.body.appendChild(box);

  let frames = 0, fps = 0, lastFpsAt = performance.now();
  let longTaskCount = 0;

  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver((list) => { longTaskCount += list.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) { if (LX_DEBUG) console.warn(e); }
  }

  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - lastFpsAt >= 500) {
      fps = Math.round((frames * 1000) / (now - lastFpsAt));
      frames = 0;
      lastFpsAt = now;
    }
    const liveCards = document.querySelectorAll('.app-card').length;
    const refCards = window.__lxDebugPointerFieldCount ?? 0;
    box.textContent =
      `FPS: ${fps}\n` +
      `Motion: ${Motion.awake ? 'awake' : 'asleep'} (${Motion.subCount} subs)\n` +
      `Cards: ${liveCards} live / ${refCards} tracked\n` +
      `Long tasks: ${longTaskCount}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const setupInteractions = () => {
  lang = resolveInitialLang();
  applyI18n({ rebuild: false });

  applyTheme();
  applyStoredSoundPref();
  if (sfx.enabled) {
    const resumeOnGesture = () => { sfx.resume(); };
    ['pointerdown', 'keydown'].forEach(evt => document.addEventListener(evt, resumeOnGesture, { once: true, capture: true }));
  }
  buildTabRail();

  document.body.classList.add('is-booted');
  const initialTab = getInitialTab();
  activateTab(initialTab, { pushHash: false, playSound: false, instant: true });
  initPointerField();
  initMagneticControls();
  initBarGlow();
  initTabGhost();
  initDebugOverlay();
  syncHeroRestBox();
  syncZenMetrics();

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const applyFontsReady = () => {
        requestAnimationFrame(() => {
          measureRail();
          syncHeroRestBox();
          syncZenMetrics();
          document.documentElement.classList.add('fonts-ready');
        });
      };
      if (document.documentElement.classList.contains('is-zen-transitioning')) {
        zenFontsPending = applyFontsReady;
      } else {
        requestAnimationFrame(applyFontsReady);
      }
    });
  } else {
    document.documentElement.classList.add('fonts-ready');
  }

  const canvas = document.getElementById('gradient-canvas');
  window.bgAnim = new OrbField(canvas);

  let debTimer;
  window.addEventListener('resize', () => {
    clearTimeout(debTimer);
    debTimer = setTimeout(() => {
      window.bgAnim.resize();
      measureRail();
      syncHeroRestBox();
      syncZenMetrics();
      const g = document.getElementById('appGrid');
      if (g && g.classList.contains('is-auto-flow')) {
        g.classList.toggle('has-overflow', g.scrollHeight - g.clientHeight > 4);
      }
    }, 180);
  });

  window.addEventListener('pageshow', () => {
    updateZenButtonLabel();
    let id = null;
    try { id = localStorage.getItem('lx-last-open'); } catch (err) { if (LX_DEBUG) console.warn(err); }
    if (!id) return;
    const card = document.querySelector(`.app-card[data-app-id="${CSS.escape(id.split('::')[0])}"]`);
    if (!card) return;
    card.classList.add('is-returned');
    card.addEventListener('animationend', () => card.classList.remove('is-returned'), { once: true });
  });

  ['pointermove', 'keydown', 'wheel', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, armIdle, { passive: true })
  );
  armIdle();

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    if (getStoredTheme()) return;
    applyTheme();
  });

  document.getElementById('themeToggle').addEventListener('click', (e) => {
    const isLight = document.documentElement.dataset.theme !== 'light';
    const reducedMotion = MQ.reducedMotion;

    if (!document.startViewTransition || reducedMotion) {
      applyTheme(isLight ? 'light' : 'dark');
      sfx.chime(isLight);
      return;
    }

    const btn = e.currentTarget;
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const endRadius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y)
    );

    const rootEl = document.documentElement;
    const vt = withViewTransition(() => { rootEl.classList.add('lx-theme-swapping'); applyTheme(isLight ? 'light' : 'dark'); });
    if (!vt) {
      requestAnimationFrame(() => rootEl.classList.remove('lx-theme-swapping'));
      sfx.chime(isLight);
      return;
    }

    vt.ready.then(() => {
      rootEl.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`] },
        { duration: MOTION.theme.inMs, easing: EASE_LUX, pseudoElement: '::view-transition-new(root)' }
      );
    }).catch(() => {});
    vt.finished.catch(() => {}).finally(() => { rootEl.classList.remove('lx-theme-swapping'); if (activeViewTransition === vt) activeViewTransition = null; });

    sfx.chime(isLight);
  });

  const soundBtn = document.getElementById('soundToggle');
  soundBtn.addEventListener('click', async () => {
    await sfx.resume();
    sfx.enabled = !sfx.enabled;
    try { localStorage.setItem('lx-sound', sfx.enabled ? '1' : '0'); } catch (e) { if (LX_DEBUG) console.warn(e); }
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled));
    updateSoundButtonLabel();
    setIcon(soundBtn.querySelector('svg'), sfx.enabled ? 'fa-volume-up' : 'fa-volume-mute');
    if (sfx.enabled) sfx.arpUp();
  });

  const langBtn = document.getElementById('langToggle');
  langBtn.addEventListener('click', () => {
    lang = lang === 'ar' ? 'en' : 'ar';
    try { localStorage.setItem('lx-lang', lang); } catch (e) { if (LX_DEBUG) console.warn(e); }
    sfx.click();
    withCrossfade(() => applyI18n());
  });

  const zenBtn = document.getElementById('zenToggle');
  zenBtn.addEventListener('click', () => {
    sfx.click();
    toggleZenMode();
  });

  window.addEventListener('popstate', handleHashNav);
  window.addEventListener('hashchange', handleHashNav);

  document.getElementById('tabRail').addEventListener('keydown', (e) => {
    const tabs = Array.from(document.querySelectorAll('.tab-btn'));
    const i = tabs.findIndex(t => t.dataset.id === currentTabId);
    if (i === -1) return;
    const rtl = document.documentElement.dir === 'rtl';
    const forwardKey = rtl ? 'ArrowLeft' : 'ArrowRight';
    const backwardKey = rtl ? 'ArrowRight' : 'ArrowLeft';
    let next = null;
    if (e.key === forwardKey) next = tabs[(i + 1) % tabs.length];
    else if (e.key === backwardKey) next = tabs[(i - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (next) {
      e.preventDefault();
      activateTab(next.dataset.id);
      next.focus();
    }
  });

  let touchStartX = 0, touchStartY = 0;
  const appGrid = document.getElementById('appGrid');
  appGrid.addEventListener('scroll', () => {
    if (!appGrid.classList.contains('is-auto-flow')) return;
    const atBottom = appGrid.scrollHeight - appGrid.scrollTop - appGrid.clientHeight < 4;
    appGrid.classList.toggle('at-bottom', atBottom);
  }, { passive: true });
  appGrid.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  appGrid.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const i = catIndex(currentTabId);
    const next = dx < 0 ? categories[i + 1] : categories[i - 1];
    if (next) activateTab(next.id);
  }, { passive: true });

  const paletteDialog = document.getElementById('lx-palette');
  const paletteInput = document.getElementById('paletteInput');
  const paletteResultsList = document.getElementById('paletteResults');

  paletteResultsList.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    const li = e.target.closest('.palette-item');
    if (!li || !paletteResultsList.contains(li)) return;
    const idx = Number(li.dataset.index);
    if (idx === paletteActiveIndex && paletteZone === 'list') return;
    if (idx !== paletteActiveIndex) sfx.tick(idx);
    setPaletteActive(idx, { scroll: false });
  }, { passive: true });
  paletteResultsList.addEventListener('click', (e) => {
    const li = e.target.closest('.palette-item');
    if (!li || !paletteResultsList.contains(li)) return;
    if (e.target.closest('.palette-qr')) {
      e.preventDefault();
      setPaletteActive(Number(li.dataset.index), { scroll: false });
      executeAction('qr');
      return;
    }
    openPaletteItem(Number(li.dataset.index));
  });

  let inputDebounce;
  const scheduleSearch = (raw) => {
    clearTimeout(inputDebounce);
    inputDebounce = setTimeout(() => renderPaletteResults(raw), 55);
  };

  paletteInput.addEventListener('input', (e) => {
    if (e.isComposing) return;
    if (!paletteCmdMode && paletteInput.value.startsWith('>')) {
      paletteCmdMode = true;
      paletteInput.value = paletteInput.value.slice(1).trimStart();
      clearTimeout(inputDebounce);
      sfx.tick(4);
      renderPaletteResults(paletteInput.value);
      return;
    }
    const raw = paletteInput.value;
    if (!raw) {
      clearTimeout(inputDebounce);
      renderPaletteResults('');
      return;
    }
    scheduleSearch(raw);
  });

  paletteInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Backspace' && paletteCmdMode && !paletteInput.value) {
      e.preventDefault();
      paletteCmdMode = false;
      clearTimeout(inputDebounce);
      sfx.tick(0);
      renderPaletteResults('');
      return;
    }
    const forwardKey = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    if (
      e.key === forwardKey && paletteZone === 'list' && paletteGhostTail &&
      paletteInput.selectionStart === paletteInput.value.length &&
      paletteInput.selectionEnd === paletteInput.value.length
    ) {
      e.preventDefault();
      const completed = paletteInput.value + paletteGhostTail;
      paletteInput.value = completed;
      clearTimeout(inputDebounce);
      renderPaletteResults(completed);
      return;
    }

    if (e.key === 'Tab' && e.shiftKey && !paletteCmdMode) {
      e.preventDefault();
      cyclePaletteScope(1);
      return;
    }

    if (e.key === 'Tab') {
      if (paletteActiveIndex === -1) return;
      e.preventDefault();
      paletteZone = paletteZone === 'list' ? 'actions' : 'list';
      if (paletteZone === 'actions') paletteActionIndex = 0;
      updateActionHighlight();
      sfx.tick(paletteZone === 'actions' ? paletteActionIndex + 4 : paletteActiveIndex);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (paletteZone === 'actions') {
        const n = getActionsForEntry(paletteItems[paletteActiveIndex]).length;
        paletteActionIndex = (paletteActionIndex + 1) % n;
        updateActionHighlight();
        sfx.tick(paletteActionIndex + 4);
      } else if (paletteItems.length) {
        setPaletteActive((paletteActiveIndex + 1) % paletteItems.length);
        sfx.tick(paletteActiveIndex);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (paletteZone === 'actions') {
        const n = getActionsForEntry(paletteItems[paletteActiveIndex]).length;
        paletteActionIndex = (paletteActionIndex - 1 + n) % n;
        updateActionHighlight();
        sfx.tick(paletteActionIndex + 4);
      } else if (paletteItems.length) {
        setPaletteActive((paletteActiveIndex - 1 + paletteItems.length) % paletteItems.length);
        sfx.tick(paletteActiveIndex);
      }
      return;
    }

    if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === 'KeyQ' || (e.key || '').toLowerCase() === 'q')) {
      e.preventDefault();
      e.stopPropagation();
      const entry = paletteItems[paletteActiveIndex];
      if (entry && !entry.app.command) executeAction('qr');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (paletteActiveIndex === -1) return;
      if (e.shiftKey) { executeAction(openModeAction(otherOpenMode())); return; }
      if (e.ctrlKey || e.metaKey) { executeAction('copy-link'); return; }
      if (paletteZone === 'actions') { executeAction(getActionsForEntry(paletteItems[paletteActiveIndex])[paletteActionIndex].id); return; }
      executeAction(openModeAction());
      return;
    }
  });

  initQrDialog();
  openQrFromUrl();
  paletteDialog.addEventListener('close', () => {
    document.querySelector('.container').classList.remove('is-dollied');
    document.querySelector('.controls-pill').classList.remove('is-dollied');
    document.querySelector('.dolly-scrim').classList.remove('is-dollied');
    document.body.classList.remove('palette-open');
    if (paletteSkipCloseChime) paletteSkipCloseChime = false;
    else sfx.veil(false);
  });

  paletteDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClosePalette();
  });

  document.getElementById('paletteClose')?.addEventListener('click', requestClosePalette);

  paletteDialog.addEventListener('click', (e) => {
    if (!paletteDialog.open) return;
    const r = paletteDialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) requestClosePalette();
  });

  const searchBtn = document.getElementById('lxBarSearch');
  if (searchBtn) {
    const syncBarFocusState = () => {
      const bar = document.getElementById('lxBar');
      if (bar) bar.classList.toggle('is-focused', document.activeElement === searchBtn);
    };
    searchBtn.addEventListener('focus', syncBarFocusState);
    searchBtn.addEventListener('blur', syncBarFocusState);
    searchBtn.addEventListener('click', () => {
      heroReturnFocus = true;
      openPalette('');
    });
  }

  const isTypeAhead = (e) =>
    !e.metaKey && !e.ctrlKey && !e.altKey &&
    [...(e.key || '')].length === 1 && /\S/.test(e.key) &&
    !/[0-9\u0660-\u0669\u06f0-\u06f9]/.test(e.key);

  const isPhysical = (e, code, ...chars) =>
    e.code === code || chars.includes((e.key || '').toLowerCase());

  const eventDigit = (e) => {
    if (e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return 0;
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(e.code || '');
    if (m) return Number(m[1]);
    const cp = (e.key || '').length === 1 ? e.key.codePointAt(0) : 0;
    if (cp >= 0x31 && cp <= 0x39) return cp - 0x30;
    if (cp >= 0x661 && cp <= 0x669) return cp - 0x660;
    if (cp >= 0x6f1 && cp <= 0x6f9) return cp - 0x6f0;
    return 0;
  };

  document.addEventListener('keydown', (e) => {
    const qrDialog = document.getElementById('lx-qr');
    if (qrDialog && qrDialog.open) {
      if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyQ', 'q')) { e.preventDefault(); closeQr(); }
      return;
    }
    if ((e.metaKey || e.ctrlKey) && isPhysical(e, 'KeyK', 'k', 'ن')) {
      e.preventDefault();
      if (paletteDialog.open) { requestClosePalette(); return; }
      if (document.activeElement === searchBtn) heroReturnFocus = true;
      openPalette('');
      return;
    }
    if (e.key === 'Escape' && paletteDialog.open) {
      e.preventDefault();
      requestClosePalette();
      return;
    }
    if (paletteDialog.open) return;
    if (e.key === 'Escape' && isZen()) {
      e.preventDefault();
      toggleZenMode();
      return;
    }
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return;
    if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyZ', 'z')) {
      e.preventDefault();
      toggleZenMode();
      return;
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyP', 'p')) {
      e.preventDefault();
      setPaletteMode(cycle(PALETTES, paletteMode()));
      return;
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyR', 'r')) {
      e.preventDefault();
      setCornersMode(cycle(CORNERS, cornersMode()));
      return;
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyV', 'v')) {
      e.preventDefault();
      setViewMode(cycle(VIEWS, viewMode()));
      return;
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyO', 'o')) {
      e.preventDefault();
      setOpenMode(otherOpenMode(), { silent: false });
      return;
    }
    if (e.altKey && !e.metaKey && !e.ctrlKey && isPhysical(e, 'KeyQ', 'q')) {
      e.preventDefault();
      const focused = document.activeElement && document.activeElement.closest ? document.activeElement.closest('#appGrid .app-card') : null;
      const target = focused ? categories.flatMap(c => c.apps).find(a => a.id === focused.dataset.appId) : null;
      if (target) openQrForApp(target, focused.dataset.variantIndex !== undefined ? Number(focused.dataset.variantIndex) : undefined, focused.querySelector('.card-link-overlay'));
      else openQrForSite();
      return;
    }
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault();
      heroReturnFocus = true;
      openPalette('');
      return;
    }
    if (isTypeAhead(e)) {
      e.preventDefault();
      heroReturnFocus = true;
      openPalette(e.key);
      return;
    }
    const digit = eventDigit(e);
    if (digit) {
      const overlay = document.querySelector(`#appGrid .card-link-overlay[aria-keyshortcuts="${digit}"]`);
      const card = overlay ? overlay.closest('.app-card') : null;
      if (card) {
        try { localStorage.setItem('lx-last-open', card.dataset.appId); } catch (err) { if (LX_DEBUG) console.warn(err); }
        card.classList.add('is-keylaunched');
        setTimeout(() => card.classList.remove('is-keylaunched'), 260);
        card.querySelector('.card-link-overlay')?.click();
      }
    }
  });

  appGrid.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = e.target.closest && e.target.closest('.app-card');
    if (!from || e.target.closest('.variant-chips')) return;
    const cards = [...appGrid.querySelectorAll('.app-card')];
    if (!cards.length) return;
    if (viewMode() === 'list' && e.key.startsWith('Arrow')) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const neighbour = cards[cards.indexOf(from) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (neighbour) {
          e.preventDefault();
          neighbour.querySelector('.card-link-overlay')?.focus({ preventScroll: false });
        }
      }
      return;
    }
    let target = null;
    if (e.key === 'Home') target = cards[0];
    else if (e.key === 'End') target = cards[cards.length - 1];
    else {
      const rtl = document.documentElement.dir === 'rtl';
      const center = (c) => {
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const o = center(from);
      let vx = 0, vy = 0;
      if (e.key === 'ArrowLeft') vx = -1;
      if (e.key === 'ArrowRight') vx = 1;
      if (e.key === 'ArrowUp') vy = -1;
      if (e.key === 'ArrowDown') vy = 1;
      let best = Infinity;
      cards.forEach((c) => {
        if (c === from) return;
        const p = center(c);
        const dx = p.x - o.x, dy = p.y - o.y;
        const along = dx * vx + dy * vy;
        if (along <= 4) return;
        const across = Math.abs(dx * vy) + Math.abs(dy * vx);
        const score = along + across * 2.2;
        if (score < best) { best = score; target = c; }
      });
      if (!target && vx !== 0) {
        const idx = cards.indexOf(from);
        const step = (vx > 0) !== rtl ? 1 : -1;
        target = cards[idx + step] || null;
      }
    }
    if (!target) return;
    e.preventDefault();
    target.querySelector('.card-link-overlay')?.focus({ preventScroll: false });
  });

  const hintKbdByKey = new Map();
  document.querySelectorAll('.palette-hints kbd').forEach((k) => {
    const label = k.textContent.trim();
    if (label === '↑↓') { hintKbdByKey.set('ArrowUp', k); hintKbdByKey.set('ArrowDown', k); }
    else if (label === '⇥') hintKbdByKey.set('Tab', k);
    else if (label === '↵') hintKbdByKey.set('Enter', k);
    else if (label === 'Esc') hintKbdByKey.set('Escape', k);
    else hintKbdByKey.set(label, k);
  });
  document.addEventListener('keydown', (e) => {
    if (!paletteDialog.open) return;
    const kbd = hintKbdByKey.get(e.key);
    if (!kbd) return;
    kbd.classList.add('is-pressed');
    clearTimeout(kbd._pressTimer);
    kbd._pressTimer = setTimeout(() => kbd.classList.remove('is-pressed'), 140);
  });
};

const CATALOG_CACHE_KEY = 'lx-catalog-cache';
const USER_LINKS_KEY = 'lx-user-links';
const USER_CAT_ID = 'mine';
const LIMITS = Object.freeze({
  fileBytes: 64 * 1024, catalogBytes: 256 * 1024,
  userLinks: 24, cats: 12, appsPerCat: 24, variants: 4, text: 60, url: 2048
});
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const DEFAULT_GRADIENT = ['#7c9bff', '#b4c6ff', '#1c2f8f'];
const IMPORT_ERRORS = ['importTooLarge', 'importTooMany', 'importEmpty', 'importInvalid', 'storageFailed'];
const fail = (key) => { throw new Error(key); };
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const fmt = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));

let toastTimer = null;
const showToast = (msg, isError = false) => {
  const el = document.getElementById('lxToast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = msg;
  el.classList.toggle('is-error', isError);
  void el.offsetWidth;
  el.classList.add('is-visible');
  toastTimer = setTimeout(() => {
    el.classList.remove('is-visible');
    toastTimer = setTimeout(() => { el.textContent = ''; }, 400);
  }, isError ? 4200 : 2600);
};

const safeUrl = (v, allowHttp) => {
  if (typeof v !== 'string' || v.length > LIMITS.url) return null;
  try {
    const u = new URL(v.trim());
    const ok = u.protocol === 'https:' || (allowHttp && u.protocol === 'http:');
    return ok && u.hostname && !u.username && !u.password ? u.href : null;
  } catch (e) { return null; }
};
const cleanText = (v, max = LIMITS.text) =>
  typeof v === 'string' ? v.replace(CTRL_RE, '').replace(/\s+/g, ' ').trim().slice(0, max) : '';
const cleanLoc = (v) => {
  const ar = cleanText(typeof v === 'string' ? v : isObj(v) ? v.ar : '');
  const en = cleanText(typeof v === 'string' ? v : isObj(v) ? v.en : '');
  return ar || en ? { ar: ar || en, en: en || ar } : null;
};
const cleanIcon = (v) => (typeof v === 'string' && ICON_RE.test(v) ? v : DEFAULT_ICON);
const cleanHex = (v, fb) => (typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : fb);
const cleanGradient = (g, color) => {
  const c = cleanHex(color, null);
  if (c) return [c, hexBlend(c, [255, 255, 255], 0.45), hexBlend(c, [0, 0, 0], 0.55)];
  return DEFAULT_GRADIENT.map((d, i) => cleanHex(Array.isArray(g) ? g[i] : null, d));
};

const cleanApp = (a, { allowHttp, allowVariants }) => {
  if (!isObj(a)) return null;
  const title = cleanLoc(a.title);
  if (!title) return null;
  const app = {
    id: typeof a.id === 'string' && ID_RE.test(a.id) ? a.id : '',
    title, icon: cleanIcon(a.icon), gradient: cleanGradient(a.gradient, a.color)
  };
  if (allowVariants && Array.isArray(a.variants) && a.variants.length) {
    const seen = new Set();
    const variants = a.variants.slice(0, LIMITS.variants).map((v) => {
      if (!isObj(v) || typeof v.id !== 'string' || !ID_RE.test(v.id) || seen.has(v.id)) return null;
      const url = safeUrl(v.url, allowHttp), label = cleanLoc(v.label);
      if (!url || !label) return null;
      seen.add(v.id);
      const variant = { id: v.id, label, url, icon: cleanIcon(v.icon) };
      return variant;
    }).filter(Boolean);
    if (!variants.length) return null;
    app.variants = variants;
    app.defaultVariant = Number.isInteger(a.defaultVariant) && variants[a.defaultVariant] ? a.defaultVariant : 0;
  } else {
    const url = safeUrl(a.url, allowHttp);
    if (!url) return null;
    app.url = url;
  }
  if (a.closed === true) {
    app.closed = true;
    const reason = cleanLoc(a.closedReason);
    if (reason) app.closedReason = reason;
  }
  if (a.isNew === true) app.isNew = true;
  if (typeof a.since === 'string' && DATE_RE.test(a.since) && !Number.isNaN(Date.parse(a.since))) app.since = a.since;
  const badge = cleanText(a.variantBadge, 24);
  if (badge) app.variantBadge = badge;
  return app;
};

const cleanCatalog = (raw) => {
  if (!isObj(raw) || !Array.isArray(raw.categories)) return null;
  const catIds = new Set(), appIds = new Set(), out = [];
  raw.categories.slice(0, LIMITS.cats).forEach((c, ci) => {
    if (!isObj(c) || typeof c.id !== 'string' || !ID_RE.test(c.id) || c.id === USER_CAT_ID || catIds.has(c.id)) return;
    const label = cleanLoc(c.label);
    if (!label) return;
    const apps = [];
    (Array.isArray(c.apps) ? c.apps.slice(0, LIMITS.appsPerCat) : []).forEach((a) => {
      const app = cleanApp(a, { allowHttp: false, allowVariants: true });
      if (app && app.id && !app.id.startsWith('u-') && !appIds.has(app.id)) { appIds.add(app.id); apps.push(app); }
    });
    catIds.add(c.id);
    out.push({
      id: c.id, label, icon: cleanIcon(c.icon), accent: cleanHex(c.accent, DEFAULT_GRADIENT[0]),
      key: Number.isInteger(c.key) ? clamp(c.key, 0, 64) : ci, apps
    });
  });
  return out.length ? out : null;
};

const hashId = (s) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
};

const cleanUserLinks = (raw) => {
  const list = Array.isArray(raw) ? raw : isObj(raw) && Array.isArray(raw.links) ? raw.links : fail('importInvalid');
  const seenUrls = new Set(), seenIds = new Set(), links = [];
  list.forEach((item) => {
    const app = cleanApp(item, { allowHttp: false, allowVariants: false });
    if (!app || seenUrls.has(app.url)) return;
    let id = 'u-' + hashId(app.url);
    for (let n = 2; seenIds.has(id); n++) id = 'u-' + hashId(app.url + '#' + n);
    seenUrls.add(app.url);
    seenIds.add(id);
    app.id = id;
    links.push(app);
  });
  if (links.length > LIMITS.userLinks) fail('importTooMany');
  return { links, skipped: list.length - links.length };
};

const readUserLinks = () => {
  try { return cleanUserLinks(JSON.parse(localStorage.getItem(USER_LINKS_KEY) || '[]')).links; }
  catch (e) { return []; }
};

let baseCatalog = [];

const userCategory = (apps) => ({
  id: USER_CAT_ID, label: STRINGS.userCategory, icon: 'fa-id-card', accent: '#e0a458', key: 6, apps
});

const composeCategories = () => {
  const mine = readUserLinks();
  categories.splice(0, categories.length, ...baseCatalog, ...(mine.length ? [userCategory(mine)] : []));
};

const readCachedCatalog = () => {
  try { return cleanCatalog(JSON.parse(localStorage.getItem(CATALOG_CACHE_KEY) || 'null')); }
  catch (e) { if (LX_DEBUG) console.warn(e); return null; }
};

const parseCatalogResponse = async (res) => {
  if (!res) return { status: 'offline' };
  if (new URL(res.url || location.href).origin !== location.origin) return { status: 'error' };
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) return { status: 'error' };
  const declared = Number(res.headers.get('content-length'));
  if (declared && declared > LIMITS.catalogBytes) return { status: 'error' };
  const text = await res.text();
  if (text.length > LIMITS.catalogBytes) return { status: 'error' };
  let raw;
  try { raw = JSON.parse(text.replace(/^\ufeff/, '')); } catch (e) { if (LX_DEBUG) console.warn('lx: links.json is not valid JSON', e); return { status: 'error' }; }
  const next = cleanCatalog(raw);
  if (LX_DEBUG && next && Array.isArray(raw.categories)) {
    const count = (list) => list.reduce((n, c) => n + (Array.isArray(c.apps) ? c.apps.length : 0), 0);
    if (count(next) !== count(raw.categories)) console.warn('lx: some links.json entries were rejected');
  }
  return next ? { status: 'ok', catalog: next } : { status: 'error' };
};

let catalogParse = null;
const fetchedCatalog = () => (catalogParse ||= catalogRequest.then(parseCatalogResponse).catch(() => ({ status: 'error' })));

const readInlineCatalog = () => {
  try {
    const el = document.getElementById('lx-data');
    return el ? cleanCatalog(JSON.parse(el.textContent)) : null;
  } catch (e) { if (LX_DEBUG) console.warn('lx: inline catalog invalid', e); return null; }
};

let inlineCatalog = null;

const loadCatalog = async () => {
  inlineCatalog = readInlineCatalog();
  const cached = readCachedCatalog();
  const local = cached || inlineCatalog;
  if (local) {
    baseCatalog = local;
    composeCategories();
    return { instant: true };
  }
  const result = await fetchedCatalog();
  if (result.status === 'ok') {
    baseCatalog = result.catalog;
    try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(result.catalog)); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  composeCategories();
  return { instant: false };
};

const rebuildCatalogUI = (preferId) => {
  closeContextMenu();
  if (!categories.length) { buildTabRail(); renderEmptyCatalog(); return; }
  const has = (id) => !!id && categories.some(c => c.id === id);
  const target = has(preferId) ? preferId : has(currentTabId) ? currentTabId : categories[0].id;
  const hashWasTab = location.hash.replace('#', '') === currentTabId;
  const changed = target !== currentTabId;
  const quiet = firstCardBatchDone && !changed;
  const focusedTab = document.activeElement?.closest?.('.tab-btn')?.dataset.id || null;
  if (!has(currentTabId)) currentTabId = null;
  buildTabRail();
  updateBarLabel();
  activateTab(target, { playSound: false, instant: true, pushHash: changed && (hashWasTab || target === preferId) });
  if (quiet) {
    document.querySelectorAll('#appGrid .app-card, #appGrid .icon-plate').forEach((c) => { c.classList.add('no-enter'); c.style.willChange = ''; });
  }
  if (focusedTab) document.getElementById(`tab-${has(focusedTab) ? focusedTab : target}`)?.focus({ preventScroll: true });
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open) {
    lastDetailKey = null;
    paletteScopesKey = '';
    if (paletteScope !== 'all' && paletteScope !== '_cmd' && !categories.some(c => c.id === paletteScope)) paletteScope = 'all';
    renderPaletteResults(document.getElementById('paletteInput').value);
  }
};

const sameCatalog = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const warmedGlyphs = new Set();
const warmGlyphs = () => {
  if (!isV1Manifest(iconManifest)) return;
  const queue = [];
  const add = (u) => { if (u && !warmedGlyphs.has(u) && !queue.includes(u)) queue.push(u); };
  if (iconManifest) Object.values(iconManifest.icons).forEach((e) => { if (e && e.status !== 'default') add(typeof e.glyph === 'string' && GLYPH_RE.test(e.glyph) ? e.glyph : null); });
  if (!queue.length) return;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  const step = () => {
    queue.splice(0, 4).forEach((u) => { warmedGlyphs.add(u); fetch(u).catch(() => {}); });
    if (queue.length) idle(step);
  };
  idle(step);
};

const refreshMarks = () => {
  document.querySelectorAll('#appGrid .app-card[data-app-id]').forEach((card) => {
    const app = findAppById(card.dataset.appId);
    const wrap = card.querySelector('.app-icon-wrapper');
    if (!app || !wrap) return;
    const v = app.variants ? app.variants[Number(card.dataset.variantIndex) || 0] : null;
    const iconName = (v || app).icon;
    const active = app.variants && wrap.querySelector('.mark-stack') ? app.variants.find((x) => String(x.id) === card.dataset.activeVariant) || v : v;
    card.style.setProperty('--c1', tone(appGradient(app, active)[0]));
    const plate = card.closest('.icon-plate');
    if (plate) plate.style.setProperty('--c1', tone(appGradient(app)[0]));
    if (wrap.querySelector('.mark-stack')) { refreshStack(card, app); return; }
    const before = wrap.querySelector('.app-icon');
    const after = retileIcon(wrap, app, v, iconName);
    const mark = card.querySelector('.card-glyph');
    if (mark) retileIcon(mark, app, v, iconName, '');
    if (after && after !== before) {
      after.style.opacity = '0';
      requestAnimationFrame(() => requestAnimationFrame(() => { after.style.opacity = ''; }));
    }
  });
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open) {
    lastDetailKey = null;
    renderPaletteResults(document.getElementById('paletteInput').value);
  }
};

const sameIcons = (a, b) => JSON.stringify(a && a.icons) === JSON.stringify(b && b.icons);

const commitIconManifest = (next, assets) => {
  if (assets) {
    if (assets.inline) {
      iconAssets.sprite = true;
    } else {
      if (assets.text) {
        mountSprite(assets.text);
        writeSpriteCache(next, assets.text);
      }
      iconAssets.sprite = !!assets.text;
    }
    if (assets.atlas) applyAtlas(next);
    if (assets.glyphAtlas) applyGlyphAtlas(next);
    iconAssets.atlas = assets.atlas;
    iconAssets.glyphAtlas = assets.glyphAtlas;
  }
  iconManifest = next;
  try { localStorage.setItem(ICONS_KEY, JSON.stringify(next)); } catch (e) { if (LX_DEBUG) console.warn(e); }
  if (document.querySelector('#appGrid .app-card')) refreshMarks();
  warmGlyphs();
};

const applyIconManifest = (next) => {
  if (!validIconManifest(next)) return Promise.resolve();
  if (isV1Manifest(next)) {
    if (isV1Manifest(iconManifest) && sameIcons(next, iconManifest)) return Promise.resolve();
    commitIconManifest(next, null);
    return Promise.resolve();
  }
  if (iconManifest && !isV1Manifest(iconManifest) && manifestSig(iconManifest) === manifestSig(next)) return Promise.resolve();
  return Promise.all([
    inlineSpriteMatches(next) ? Promise.resolve(null) : fetchSpriteText(next),
    needsFaviconAtlas(next) ? decodeAtlas(next.atlas.file) : Promise.resolve(false),
    next.glyphAtlas ? decodeAtlas(next.glyphAtlas.file) : Promise.resolve(false)
  ]).then(([text, atlas, glyphAtlas]) => commitIconManifest(next, { text, atlas, glyphAtlas, inline: inlineSpriteMatches(next) }));
};

const fetchIconManifest = () => {
  if (!/^https?:$/.test(location.protocol)) return Promise.resolve(null);
  try {
    return fetch(new URL('icons/manifest.v2.json', location.href), { credentials: 'same-origin', mode: 'same-origin' }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
  } catch (e) { return Promise.resolve(null); }
};

Promise.resolve(window.__lxIcons || fetchIconManifest()).then(applyIconManifest);

const setBaseCatalog = (next) => {
  if (sameCatalog(next, baseCatalog)) return;
  baseCatalog = next;
  composeCategories();
  if (firstCardBatchDone && document.visibilityState === 'visible' && !activeViewTransition && !gridSwitch) withCrossfade(() => rebuildCatalogUI());
  else rebuildCatalogUI();
  warmGlyphs();
};

const renderEmptyCatalog = () => {
  const grid = document.getElementById('appGrid');
  if (!grid || categories.length) return;
  grid.classList.remove('is-auto-flow');
  grid.innerHTML = `<div class="grid-empty">${icon('fa-box-open')}<span>${escapeHtml(t('catalogUnavailable'))}</span></div>`;
};

const applyCatalogResult = (result) => {
  if (result.status === 'missing') {
    try { localStorage.removeItem(CATALOG_CACHE_KEY); } catch (e) { if (LX_DEBUG) console.warn(e); }
    if (inlineCatalog) setBaseCatalog(inlineCatalog);
    return 'missing';
  }
  if (result.status !== 'ok') return result.status;
  const changed = !sameCatalog(result.catalog, baseCatalog);
  try { localStorage.setItem(CATALOG_CACHE_KEY, JSON.stringify(result.catalog)); } catch (e) { if (LX_DEBUG) console.warn(e); }
  setBaseCatalog(result.catalog);
  return changed ? 'updated' : 'same';
};

const refreshCatalog = async () => {
  try { applyCatalogResult(await fetchedCatalog()); } catch (e) { if (LX_DEBUG) console.warn(e); }
};

let hardRefreshBusy = false;
const hardRefreshCatalog = async () => {
  if (hardRefreshBusy) return;
  const btn = document.getElementById('refreshToggle');
  if (!/^https?:$/.test(location.protocol)) { showToast(t('refreshOffline'), true); return; }
  hardRefreshBusy = true;
  btn?.classList.add('is-spinning');
  btn?.setAttribute('aria-busy', 'true');
  const started = performance.now();
  let outcome = 'error';
  try {
    const url = new URL(CATALOG_URL, location.href);
    url.searchParams.set('_', Date.now().toString(36));
    const res = await fetch(url, { cache: 'reload', credentials: 'same-origin', mode: 'same-origin' }).catch(() => null);
    outcome = applyCatalogResult(await parseCatalogResponse(res));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
  const wait = Math.max(0, 520 - (performance.now() - started));
  setTimeout(() => {
    btn?.classList.remove('is-spinning');
    btn?.removeAttribute('aria-busy');
    hardRefreshBusy = false;
    const msg = { updated: 'refreshUpdated', same: 'refreshSame', missing: 'refreshMissing', offline: 'refreshOffline' }[outcome] || 'refreshFailed';
    showToast(t(msg), !['updated', 'same'].includes(outcome));
    if (outcome === 'updated' || outcome === 'same') sfx.arpUp();
  }, wait);
};

const updateRefreshButtonLabel = () => {
  const btn = document.getElementById('refreshToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', t('refreshCatalog'));
  btn.title = t('refreshCatalog');
};

const setSoundEnabled = (on) => {
  sfx.enabled = on;
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(on));
  setIcon(btn.querySelector('svg'), on ? 'fa-volume-up' : 'fa-volume-mute');
  updateSoundButtonLabel();
};

const applyImportedPrefs = (p) => {
  if (!isObj(p)) return;
  try {
    if (p.sound === '0' || p.sound === '1') {
      localStorage.setItem('lx-sound', p.sound);
      setSoundEnabled(p.sound === '1');
      if (sfx.enabled) sfx.resume();
    }
    if (isObj(p.variants)) {
      categories.forEach(c => c.apps.forEach((a) => {
        if (!a.variants || !Object.prototype.hasOwnProperty.call(p.variants, a.id)) return;
        const i = p.variants[a.id];
        if (Number.isInteger(i) && a.variants[i]) localStorage.setItem('lx-variant-' + a.id, String(i));
      }));
    }
    if (p.theme === 'light' || p.theme === 'dark') applyTheme(p.theme);
    if (PALETTES.includes(p.palette)) setPaletteMode(p.palette, { silent: true });
    if (CORNERS.includes(p.corners)) setCornersMode(p.corners, { silent: true });
    const importedView = p.view;
    if (VIEWS.includes(importedView) && !document.documentElement.dataset.viewLocked) setViewMode(importedView, { silent: true });
    if (OPEN_MODES.includes(p.open)) setOpenMode(p.open);
    if (p.zen === '0' || p.zen === '1') {
      localStorage.setItem('lx-zen', p.zen);
      setZenMode(p.zen === '1');
    }
    if ((p.lang === 'ar' || p.lang === 'en') && p.lang !== lang) {
      lang = p.lang;
      localStorage.setItem('lx-lang', lang);
      applyI18n({ rebuild: false });
    }
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

const pickFile = () => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  const done = (file) => { input.remove(); resolve(file); };
  input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null), { once: true });
  input.addEventListener('cancel', () => done(null), { once: true });
  document.body.appendChild(input);
  input.click();
});

const importUserLinks = async () => {
  const file = await pickFile();
  if (!file) return;
  try {
    if (file.size > LIMITS.fileBytes) fail('importTooLarge');
    let raw;
    try { raw = JSON.parse((await file.text()).replace(/^\ufeff/, '')); } catch (e) { fail('importInvalid'); }
    const { links, skipped } = cleanUserLinks(raw);
    const prefs = isObj(raw) && isObj(raw.prefs) ? raw.prefs : null;
    if (!links.length && !prefs) fail('importEmpty');
    if (links.length) {
      const current = readUserLinks().length;
      const question = current
        ? fmt('importConfirm', { n: links.length, m: current })
        : fmt('importConfirmNew', { n: links.length });
      if (!window.confirm(question)) return;
      try { localStorage.setItem(USER_LINKS_KEY, JSON.stringify(links)); } catch (e) { fail('storageFailed'); }
    }
    if (prefs) applyImportedPrefs(prefs);
    composeCategories();
    rebuildCatalogUI(links.length ? USER_CAT_ID : undefined);
    const note = skipped ? ` ${fmt('importSkipped', { n: skipped })}` : '';
    showToast((links.length ? fmt('importDone', { n: links.length }) : t('importPrefsDone')) + note);
    sfx.arpUp();
  } catch (e) {
    const key = IMPORT_ERRORS.includes(e && e.message) ? e.message : 'importInvalid';
    const n = { importTooLarge: LIMITS.fileBytes / 1024, importTooMany: LIMITS.userLinks }[key] ?? '';
    showToast(fmt(key, { n }), true);
  }
};

const exportUserData = () => {
  const prefs = { variants: {} };
  try {
    ['theme', 'lang', 'sound', 'zen', 'palette', 'corners', 'view', 'open'].forEach((k) => { const v = localStorage.getItem('lx-' + k); if (v !== null) prefs[k] = v; });
  } catch (e) { if (LX_DEBUG) console.warn(e); }
  categories.forEach(c => c.apps.forEach((a) => {
    if (!a.variants) return;
    let stored = null;
    try { stored = localStorage.getItem('lx-variant-' + a.id); } catch (e) { if (LX_DEBUG) console.warn(e); }
    if (stored !== null) prefs.variants[a.id] = getSelectedVariantIndex(a);
  }));
  const links = readUserLinks().map(({ title, url, icon: ic, gradient }) => ({ title, url, icon: ic, color: gradient[0] }));
  const base = { app: 'linkexpress', version: 1, exportedAt: new Date().toISOString(), links, prefs };
  let body = JSON.stringify(base, null, 2);
  let catalog = null;
  try { catalog = cleanCatalog({ categories: baseCatalog }); } catch (e) { if (LX_DEBUG) console.warn(e); }
  if (catalog) {
    const withCatalog = JSON.stringify({ ...base, catalog }, null, 2);
    if (new Blob([withCatalog]).size <= LIMITS.fileBytes) body = withCatalog;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `linkexpress-${new Date().toISOString().slice(0, 10)}.json`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast(t('exportDone'));
};

const resetUserLinks = () => {
  if (!window.confirm(t('resetConfirm'))) return;
  try { localStorage.removeItem(USER_LINKS_KEY); } catch (e) { if (LX_DEBUG) console.warn(e); }
  composeCategories();
  rebuildCatalogUI();
  showToast(t('resetDone'));
};

const updateDataButtonLabel = () => {
  const btn = document.getElementById('dataToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', t('dataMenu'));
  btn.title = t('dataMenu');
};

const openDataMenu = (btn, focusFirst) => {
  closeContextMenu();
  const menu = buildContextMenu();
  const items = [['import', 'fa-box-open', 'dataImport'], ['export', 'fa-file-lines', 'dataExport']];
  if (categories.some(c => c.id === USER_CAT_ID)) items.push(['reset', 'fa-triangle-exclamation', 'dataReset']);
  menu.innerHTML = items.map(([id, ic, key]) =>
    `<button type="button" role="menuitem" data-data-action="${id}">${icon(ic)}${escapeHtml(t(key))}</button>`).join('');
  const run = { import: importUserLinks, export: exportUserData, reset: resetUserLinks };
  menu.dataset.owner = 'data';
  btn.setAttribute('aria-expanded', 'true');
  const pad = 8;
  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const rtl = document.documentElement.dir === 'rtl';
  const x = rtl ? r.right - w : r.left;
  const y = r.bottom + pad + h <= window.innerHeight - pad ? r.bottom + pad : r.top - h - pad;
  placeContextMenu(menu, x, y);
  showContextMenu(menu, { anchor: btn, returnTo: btn, focusFirst });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-data-action]');
    if (!b || !run[b.dataset.dataAction]) return;
    sfx.click();
    closeContextMenu();
    run[b.dataset.dataAction]();
  }, { signal: contextMenuAC.signal });
};

const initDataMenu = () => {
  const btn = document.getElementById('dataToggle');
  if (!btn) return;
  let viaKeyboard = false;
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') viaKeyboard = true;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sfx.click(); openDataMenu(btn, true); }
  });
  btn.addEventListener('click', (e) => {
    const kb = viaKeyboard || e.detail === 0;
    viaKeyboard = false;
    if (contextMenuEl && contextMenuEl.classList.contains('is-open') && contextMenuEl.dataset.owner === 'data') {
      closeContextMenu();
      return;
    }
    sfx.click();
    openDataMenu(btn, kb);
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== USER_LINKS_KEY && e.key !== null) return;
    composeCategories();
    rebuildCatalogUI();
  });
};

function updateLookButtonLabel() {
  const btn = document.getElementById('lookToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', t('lookMenu'));
  btn.title = `${t('lookMenu')} · ${t('palette_' + paletteMode())} · ${t('corners_' + cornersMode())} · ${t('openMode_' + openMode())}`;
}

const renderLookMenu = (menu, next = {}) => {
  const p = next.palette || paletteMode(), c = next.corners || cornersMode(), o = next.open || openMode(), v = next.view || viewMode();
  const viewRow = (id) => {
    const checked = id === v;
    return `<button type="button" role="menuitemradio" aria-checked="${checked}" class="${checked ? 'is-active' : ''}" data-look-view="${id}">${icon(VIEW_ICONS[id])}<span>${escapeHtml(t('view_' + id))}</span><span class="look-view" aria-hidden="true" data-view="${id}">${'<i></i>'.repeat(id === 'bento' ? 4 : id === 'icons' ? 9 : 6)}</span></button>`;
  };
  const row = (kind, id, checked, trail) =>
    `<button type="button" role="menuitemradio" aria-checked="${checked}" class="${checked ? 'is-active' : ''}" data-look-${kind}="${id}">${icon(checked ? 'fa-circle-dot' : 'fa-circle')}<span>${escapeHtml(t((kind === 'palette' ? 'palette_' : 'corners_') + id))}</span>${trail}</button>`;
  const openRow = (id) => {
    const checked = id === o;
    return `<button type="button" role="menuitemradio" aria-checked="${checked}" class="look-open-row${checked ? ' is-active' : ''}" data-look-open="${id}">${icon(openModeIcon(id))}<span class="look-open-text"><span>${escapeHtml(t('openMode_' + id))}</span><small>${escapeHtml(t('openModeHint_' + id))}</small></span><span class="ctx-check" aria-hidden="true">${checked ? icon('fa-check') : ''}</span></button>`;
  };
  menu.innerHTML =
    `<div class="lx-context-menu-label" role="presentation">${escapeHtml(t('openMode'))}</div>` +
    OPEN_MODES.map(openRow).join('') +
    `<div class="lx-context-menu-sep" role="separator"></div>` +
    `<div class="lx-context-menu-label" role="presentation">${escapeHtml(t('lookColors'))}</div>` +
    PALETTES.map(id => row('palette', id, id === p,
      `<span class="look-swatches" aria-hidden="true">${PALETTE_SWATCHES[id].map(sw => `<span style="--sw:${sw}"></span>`).join('')}</span>`)).join('') +
    `<div class="lx-context-menu-sep" role="separator"></div>` +
    `<div class="lx-context-menu-label" role="presentation">${escapeHtml(t('lookCorners'))}</div>` +
    CORNERS.map(id => row('corners', id, id === c,
      `<span class="look-corner" aria-hidden="true" style="--cr:${CORNER_SAMPLES[id]}"></span>`)).join('') +
    `<div class="lx-context-menu-sep" role="separator"></div>` +
    `<div class="lx-context-menu-label" role="presentation">${escapeHtml(t('lookLayout'))}</div>` +
    VIEWS.map(viewRow).join('');
};

const syncLookMenu = (menu, next = {}) => {
  const p = next.palette || paletteMode(), c = next.corners || cornersMode(), o = next.open || openMode(), v = next.view || viewMode();
  const mark = (b, on) => {
    if (b.getAttribute('aria-checked') === String(on)) return;
    b.setAttribute('aria-checked', String(on));
    b.classList.toggle('is-active', on);
  };
  menu.querySelectorAll('[data-look-palette]').forEach((b) => {
    const on = b.dataset.lookPalette === p;
    if (b.getAttribute('aria-checked') !== String(on)) setIcon(b.querySelector('svg'), on ? 'fa-circle-dot' : 'fa-circle');
    mark(b, on);
  });
  menu.querySelectorAll('[data-look-corners]').forEach((b) => {
    const on = b.dataset.lookCorners === c;
    if (b.getAttribute('aria-checked') !== String(on)) setIcon(b.querySelector('svg'), on ? 'fa-circle-dot' : 'fa-circle');
    mark(b, on);
  });
  menu.querySelectorAll('[data-look-view]').forEach((b) => mark(b, b.dataset.lookView === v));
  menu.querySelectorAll('[data-look-open]').forEach((b) => {
    const on = b.dataset.lookOpen === o;
    if (b.getAttribute('aria-checked') !== String(on)) {
      const check = b.querySelector('.ctx-check');
      if (check) check.innerHTML = on ? icon('fa-check') : '';
    }
    mark(b, on);
  });
};

const openLookMenu = (btn, focusFirst) => {
  closeContextMenu();
  const menu = buildContextMenu();
  renderLookMenu(menu);
  menu.dataset.owner = 'look';
  btn.setAttribute('aria-expanded', 'true');
  const pad = 8;
  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const rtl = document.documentElement.dir === 'rtl';
  const x = rtl ? r.right - w : r.left;
  const y = r.bottom + pad + h <= window.innerHeight - pad ? r.bottom + pad : r.top - h - pad;
  placeContextMenu(menu, x, y);
  showContextMenu(menu, { anchor: btn, returnTo: btn, focusFirst });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-look-palette],[data-look-corners],[data-look-open],[data-look-view]');
    if (!b) return;
    sfx.click();
    const focusKey = b.dataset.lookPalette ? `[data-look-palette="${b.dataset.lookPalette}"]`
      : b.dataset.lookCorners ? `[data-look-corners="${b.dataset.lookCorners}"]`
      : b.dataset.lookView ? `[data-look-view="${b.dataset.lookView}"]`
      : `[data-look-open="${b.dataset.lookOpen}"]`;
    if (b.dataset.lookPalette) setPaletteMode(b.dataset.lookPalette, { silent: true });
    else if (b.dataset.lookCorners) setCornersMode(b.dataset.lookCorners, { silent: true });
    else if (b.dataset.lookView) setViewMode(b.dataset.lookView, { silent: true });
    else setOpenMode(b.dataset.lookOpen);
    syncLookMenu(menu, { palette: b.dataset.lookPalette, corners: b.dataset.lookCorners, open: b.dataset.lookOpen, view: b.dataset.lookView });
    menu.querySelector(focusKey)?.focus({ preventScroll: true });
  }, { signal: contextMenuAC.signal });
};

const initLookMenu = () => {
  const btn = document.getElementById('lookToggle');
  if (!btn) return;
  updateLookButtonLabel();
  let viaKeyboard = false;
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') viaKeyboard = true;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sfx.click(); openLookMenu(btn, true); }
  });
  btn.addEventListener('click', (e) => {
    const kb = viaKeyboard || e.detail === 0;
    viaKeyboard = false;
    if (contextMenuEl && contextMenuEl.classList.contains('is-open') && contextMenuEl.dataset.owner === 'look') {
      closeContextMenu();
      return;
    }
    sfx.click();
    openLookMenu(btn, kb);
  });
  window.addEventListener('storage', (e) => {
    if (e.key === 'lx-palette' && PALETTES.includes(e.newValue)) setPaletteMode(e.newValue, { silent: true, persist: false });
    if (e.key === 'lx-corners' && CORNERS.includes(e.newValue)) setCornersMode(e.newValue, { silent: true, persist: false });
    if (e.key === 'lx-view' && VIEWS.includes(e.newValue) && !document.documentElement.dataset.viewLocked) setViewMode(e.newValue, { silent: true, persist: false });
    if (e.key === 'lx-open' || e.key === null) syncOpenModeUI();
  });
};

const initRefreshButton = () => {
  const btn = document.getElementById('refreshToggle');
  if (!btn) return;
  updateRefreshButtonLabel();
  btn.addEventListener('click', () => { sfx.click(); hardRefreshCatalog(); });
};

const boot = async () => {
  const { instant } = await loadCatalog();
  setupInteractions();
  initDataMenu();
  initLookMenu();
  syncOpenModeUI();
  initRefreshButton();
  if (!categories.length) renderEmptyCatalog();
  warmGlyphs();
  if (instant) {
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 400));
    idle(() => refreshCatalog(), { timeout: 1500 });
  }
};

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((e) => { if (LX_DEBUG) console.warn(e); });
  });
}

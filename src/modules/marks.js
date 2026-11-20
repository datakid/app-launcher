import { LX_DEBUG, escapeHtml } from './util.js';
import { categories } from './catalogue.js';
import { invalidateGridCache } from './grid.js';
import { tone } from './theme.js';
import { assignLastDetailKey, renderPaletteResults } from './palette/view.js';

export const ICON_RE = /^fa-[a-z0-9]+(?:-[a-z0-9]+){0,6}$/;
export const DEFAULT_ICON = 'fa-circle';
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

export const icon = (name, extraClass = '') => {
  const safe = resolveIcon(name);
  const cls = extraClass ? `${extraClass} fas ${safe}` : `fas ${safe}`;
  return `<svg class="${cls}" aria-hidden="true" focusable="false"><use href="#${safe}"></use></svg>`;
};

export const setIcon = (element, name) => {
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
const glyphScaleOf = (e) => {
  const ink = typeof e.ink === 'number' ? e.ink : 0;
  return ink > 0 && ink <= 1 ? Math.round(Math.min(1.14, Math.max(0.86, Math.sqrt(0.29 / ink))) * 100) / 100 : null;
};
const syncGlyphScale = (node, scale) => {
  const next = scale ? String(scale) : '';
  if (node.style.getPropertyValue('--glyph-scale') === next) return;
  if (next) node.style.setProperty('--glyph-scale', next);
  else node.style.removeProperty('--glyph-scale');
};
const glyphRefFor = (key) => {
  const e = iconEntry(key);
  if (!e || e.status === 'default') return null;
  if (isV1Manifest(iconManifest)) return typeof e.glyph === 'string' && GLYPH_RE.test(e.glyph) ? { url: e.glyph, sig: `v1:${e.glyph}` } : null;
  const g = e.glyph;
  if (!g || typeof g !== 'object') return null;
  const scale = glyphScaleOf(e);
  if (typeof g.symbol === 'string' && SYM_RE.test(g.symbol)) return iconAssets.sprite && document.getElementById(g.symbol) ? { sym: g.symbol, sig: `s:${g.symbol}`, scale } : null;
  const cell = iconAssets.glyphAtlas ? cellRef(iconManifest.glyphAtlas, g.atlas, 'g') : null;
  return cell ? { ...cell, scale } : null;
};
const faviconRefFor = (key) => {
  const e = iconEntry(key);
  if (!e || e.status === 'default') return null;
  if (isV1Manifest(iconManifest)) return typeof e.favicon === 'string' && FAV_RE.test(e.favicon) ? { url: e.favicon, sig: `v1:${e.favicon}` } : null;
  return iconAssets.atlas ? cellRef(iconManifest.atlas, e.favicon, 'f') : null;
};
export const findAppById = (id) => {
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
export const appGradient = (app, variant) => {
  const base = findAppById(app.parentId || app.id) || app;
  const vs = Array.isArray(base.variants) && base.variants.length ? base.variants : null;
  if (!vs) return tintOf(String(base.id)) || app.gradient;
  const pick = variant || (app.parentId && vs[app.variantIndex]) || vs[Number(base.defaultVariant) || 0];
  return tintOf(`${base.id}--${pick.id}`) || base.gradient || app.gradient;
};
export const appMark = (app, variant) => {
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
  const scaleStyle = r.scale ? `--glyph-scale:${r.scale}` : '';
  if (r.sym) return `<svg class="${c}lx-glyph mark-glyph" data-ms="${r.sig}"${scaleStyle ? ` style="${scaleStyle}"` : ''} aria-hidden="true" focusable="false"><use href="#${r.sym}"></use></svg>`;
  return `<span class="${c}lx-glyph mark-glyph-atlas" data-ms="${r.sig}" style="--ac:${r.c};--ar:${r.r}${scaleStyle ? `;${scaleStyle}` : ''}" aria-hidden="true"></span>`;
};
const favHtml = (m, cls) => {
  const c = cls ? `${cls} ` : '';
  const r = m.ref;
  if (r.url) return `<img class="${c}lx-fav" data-ms="${r.sig}" src="${r.url}" alt="" decoding="async" draggable="false">`;
  return `<span class="${c}lx-fav mark-fav" data-ms="${r.sig}" style="--ac:${r.c};--ar:${r.r}" aria-hidden="true"></span>`;
};
export const markHtml = (app, variant, iconName, cls) => {
  const m = appMark(app, variant);
  if (m.kind === 'glyph') return glyphHtml(m, cls);
  if (m.kind === 'favicon') return favHtml(m, cls);
  return icon(iconName, cls);
};
export const wrapOpen = (app, variant) => `<div class="app-icon-wrapper" data-mark="${appMark(app, variant).kind}">`;
const markKind = (n) => (n.classList.contains('lx-glyph') ? 'glyph' : n.classList.contains('lx-fav') ? 'favicon' : 'fa');
export const retileIcon = (host, app, variant, iconName, cls = 'app-icon') => {
  const m = appMark(app, variant);
  if (host.classList.contains('app-icon-wrapper') || host.classList.contains('ctx-head-icon')) host.dataset.mark = m.kind;
  const cur = host.querySelector(cls ? '.' + cls : ':scope > svg, :scope > .lx-glyph, :scope > .lx-fav');
  if (cur && markKind(cur) === m.kind) {
    if (m.kind === 'fa') { setIcon(cur, iconName); return cur; }
    const sig = m.ref.sig;
    if (cur.dataset.ms === sig) {
      if (m.kind === 'glyph') syncGlyphScale(cur, m.ref.scale);
      return cur;
    }
    if (m.ref.url && m.kind === 'glyph' && cur.tagName === 'SPAN' && !cur.classList.contains('mark-glyph-atlas')) {
      cur.style.setProperty('--glyph', `url(${m.ref.url})`);
      syncGlyphScale(cur, m.ref.scale);
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
export const stackableVariants = (app) => Array.isArray(app.variants) && app.variants.length > 1 && app.variants.every((v) => /^[a-z0-9-]+$/i.test(String(v.id)));
const renderMarkStack = (app, cls) => {
  app.variants.forEach((v) => ensureVariantRule(String(v.id)));
  const items = app.variants.map((v) => markHtml(app, v, v.icon, cls).replace(/^<([a-z]+)/, `<$1 data-variant="${String(v.id)}"`));
  return `<span class="mark-stack" aria-hidden="true">${items.join('')}</span>`;
};
export const cardMarkHtml = (app, activeVariant, iconName, cls, stacked) => (stacked ? renderMarkStack(app, cls) : markHtml(app, activeVariant, iconName, cls));
export const cardHostMarkup = host => {
  const short = host.replace(/\.(?:vercel\.app|netlify\.app|github\.io|pages\.dev|workers\.dev)$/i, '');
  return `<span class="card-host-full">${escapeHtml(host)}</span><span class="card-host-short" aria-hidden="true">${escapeHtml(short || host)}</span>`;
};
export const setActiveVariant = (cardEl, variantId, patch) => {
  cardEl.dataset.activeVariant = variantId;
  if (!patch) return;
  const link = cardEl.querySelector('.card-link-overlay');
  if (link) {
    link.href = patch.href;
    link.setAttribute('aria-label', `${patch.label} — ${patch.href}`);
    link.title = patch.href;
  }
  const meta = cardEl.querySelector('.card-meta');
  if (meta) { meta.innerHTML = cardHostMarkup(patch.host); meta.title = patch.href; }
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
const warmedGlyphs = new Set();
export const warmGlyphs = () => {
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
  invalidateGridCache();
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
    assignLastDetailKey(null);
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
  invalidateGridCache();
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

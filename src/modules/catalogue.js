import { LX_DEBUG, clamp, escapeHtml } from './util.js';
import { sfx } from './audio.js';
import { DEFAULT_ICON, ICON_RE, icon, warmGlyphs } from './marks.js';
import { STRINGS, t } from './i18n.js';
import { closeContextMenu } from './context-menu.js';
import { invalidateGridCache } from './grid.js';
import { hexBlend, withCrossfade } from './theme.js';
import { updateBarLabel } from './i18n-apply.js';
import { activateTab, activeViewTransition, assignCurrentTabId, buildTabRail, currentTabId, firstCardBatchDone, gridSwitch } from './tabs.js';
import { invalidateSearchIndex } from './palette/query.js';
import { assignLastDetailKey, assignPaletteScope, assignPaletteScopesKey, paletteScope, renderPaletteResults } from './palette/view.js';
import { showToast } from './toast.js';

const CATALOG_URL = 'links.json';
const catalogRequest = (() => {
  if (!/^https?:$/.test(location.protocol)) return Promise.resolve(null);
  if (window.__lxCatalog) return window.__lxCatalog;
  try {
    return fetch(new URL(CATALOG_URL, location.href), { cache: 'no-cache', credentials: 'same-origin', mode: 'same-origin' }).catch(() => null);
  } catch (e) { return Promise.resolve(null); }
})();
export const categories = [];
const PALETTE_CAT_ID = 'palette';
export const paletteGroups = [];
export const isPaletteOnly = (cat) => cat.id === PALETTE_CAT_ID;
const CATALOG_CACHE_KEY = 'lx-catalog-cache';
export const USER_LINKS_KEY = 'lx-user-links';
export const USER_CAT_ID = 'mine';
export const LIMITS = Object.freeze({
  fileBytes: 64 * 1024, catalogBytes: 256 * 1024,
  userLinks: 24, cats: 12, appsPerCat: 24, variants: 4, text: 60, url: 2048
});
const ID_RE = /^[a-z0-9][a-z0-9-]{0,39}$/;
const HEX_RE = /^#[0-9a-f]{6}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]/g;
const DEFAULT_GRADIENT = ['#7c9bff', '#b4c6ff', '#1c2f8f'];
export const IMPORT_ERRORS = ['importTooLarge', 'importTooMany', 'importEmpty', 'importInvalid', 'storageFailed'];
export const fail = (key) => { throw new Error(key); };
export const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
export const fmt = (key, vars = {}) => t(key).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
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

export const cleanCatalog = (raw) => {
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

export const cleanUserLinks = (raw) => {
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

export const readUserLinks = () => {
  try { return cleanUserLinks(JSON.parse(localStorage.getItem(USER_LINKS_KEY) || '[]')).links; }
  catch (e) { return []; }
};

export let baseCatalog = [];

const userCategory = (apps) => ({
  id: USER_CAT_ID, label: STRINGS.userCategory, icon: 'fa-id-card', accent: '#e0a458', key: 6, apps
});

export const composeCategories = () => {
  invalidateGridCache();
  invalidateSearchIndex();
  const mine = readUserLinks();
  paletteGroups.splice(0, paletteGroups.length, ...baseCatalog.filter(isPaletteOnly));
  categories.splice(0, categories.length, ...baseCatalog.filter(c => !isPaletteOnly(c)), ...(mine.length ? [userCategory(mine)] : []));
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

export const loadCatalog = async () => {
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

export const rebuildCatalogUI = (preferId) => {
  closeContextMenu();
  if (!categories.length) { buildTabRail(); renderEmptyCatalog(); return; }
  const has = (id) => !!id && categories.some(c => c.id === id);
  const target = has(preferId) ? preferId : has(currentTabId) ? currentTabId : categories[0].id;
  const hashWasTab = location.hash.replace('#', '') === currentTabId;
  const changed = target !== currentTabId;
  const quiet = firstCardBatchDone && !changed;
  const focusedTab = document.activeElement?.closest?.('.tab-btn')?.dataset.id || null;
  if (!has(currentTabId)) assignCurrentTabId(null);
  buildTabRail();
  updateBarLabel();
  activateTab(target, { playSound: false, instant: true, pushHash: changed && (hashWasTab || target === preferId) });
  if (quiet) {
    document.querySelectorAll('#appGrid .app-card, #appGrid .icon-plate').forEach((c) => { c.classList.add('no-enter'); c.style.willChange = ''; });
  }
  if (focusedTab) document.getElementById(`tab-${has(focusedTab) ? focusedTab : target}`)?.focus({ preventScroll: true });
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open) {
    assignLastDetailKey(null);
    assignPaletteScopesKey('');
    if (paletteScope !== 'all' && paletteScope !== '_cmd' && !categories.some(c => c.id === paletteScope)) assignPaletteScope('all');
    renderPaletteResults(document.getElementById('paletteInput').value);
  }
};

const sameCatalog = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const setBaseCatalog = (next) => {
  if (sameCatalog(next, baseCatalog)) return;
  baseCatalog = next;
  composeCategories();
  if (firstCardBatchDone && document.visibilityState === 'visible' && !activeViewTransition && !gridSwitch) withCrossfade(() => rebuildCatalogUI());
  else rebuildCatalogUI();
  warmGlyphs();
};

export const renderEmptyCatalog = () => {
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

export const refreshCatalog = async () => {
  try { applyCatalogResult(await fetchedCatalog()); } catch (e) { if (LX_DEBUG) console.warn(e); }
};

let hardRefreshBusy = false;
export const hardRefreshCatalog = async () => {
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

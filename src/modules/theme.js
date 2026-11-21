import { LX_DEBUG } from './util.js';
import { categories, fmt } from './catalogue.js';
import { sfx } from './audio.js';
import { appGradient, setIcon } from './marks.js';
import { t } from './i18n.js';
import { EASE_LUX, MOTION, MQ, Motion, animate, isLowEnd } from './motion.js';
import { assignPointerFieldDirty } from './pointer-field.js';
import { closeContextMenu, contextMenuEl } from './context-menu.js';
import { invalidateGridCache, renderCards } from './grid.js';
import { updateThemeButtonLabel } from './controls.js';
import { activeViewTransition, applyTabAccent, assignActiveViewTransition, currentTabId, measureRail, runGridSwitch, settleGridSwitch, withViewTransition } from './tabs.js';
import { paletteActiveIndex, paletteItems, renderPaletteResults, scopeList, syncScopeIndicator } from './palette/view.js';
import { showToast } from './toast.js';
import { updateLookButtonLabel } from './appearance-menu.js';

export let isLightTheme = false;

export const hueFromHex = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return 220;
  const h = mx === r ? ((g - b) / d + (g < b ? 6 : 0)) : mx === g ? ((b - r) / d + 2) : ((r - g) / d + 4);
  return h * 60;
};

export const hexBlend = (hex, mix, ratio) => {
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
export const PALETTES = ['vivid', 'curated', 'muted', 'mono'];
export const CORNERS = ['balanced', 'soft', 'crisp'];
export const VIEWS = ['bento', 'list', 'icons'];
export const VIEW_ICONS = { bento: 'fa-table-cells-large', list: 'fa-list', icons: 'fa-grip' };
export const PALETTE_SWATCHES = {
  curated: ['#6d82ad', '#5f9a94', '#a99563', '#ad7a80'],
  muted: ['#8c95b6', '#7ea198', '#b9a47c', '#b48b94'],
  vivid: ['#7c9bff', '#2dd4bf', '#f5b445', '#f472b6'],
  mono: ['#dcdcdb', '#9c9d9f', '#67686b', '#3a3b3d']
};
export const CORNER_SAMPLES = { soft: '9px', balanced: '5px', crisp: '1.5px' };
export const ORB_SAT = { curated: 0.88, muted: 0.5, vivid: 1.45, mono: 0.04 };
const MUTED_GREY = [140, 133, 124];
export const paletteMode = () => {
  const p = document.documentElement.dataset.palette;
  return PALETTES.includes(p) ? p : 'vivid';
};
export const cornersMode = () => {
  const c = document.documentElement.dataset.corners;
  return CORNERS.includes(c) ? c : 'balanced';
};
export const viewMode = () => (VIEWS.includes(document.documentElement.dataset.view) ? document.documentElement.dataset.view : 'bento');
export const isFlatView = (v = viewMode()) => v === 'list' || v === 'icons';
export const tone = (hex) => {
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

export const withCrossfade = (apply) => {
  const rootEl = document.documentElement;
  if (!document.startViewTransition || MQ.reducedMotion || isLowEnd()) { apply(); return; }
  const vt = withViewTransition(() => { rootEl.classList.add('lx-theme-swapping'); apply(); });
  if (!vt) { requestAnimationFrame(() => rootEl.classList.remove('lx-theme-swapping')); return; }
  vt.ready.then(() => {
    animate(rootEl, { opacity: [0, 1] }, { duration: MOTION.crossfade.inMs, easing: EASE_LUX, pseudoElement: '::view-transition-new(root)' });
  }).catch(() => {});
  vt.finished.catch(() => {}).finally(() => { rootEl.classList.remove('lx-theme-swapping'); if (activeViewTransition === vt) assignActiveViewTransition(null); });
};

const retintUI = () => {
  invalidateGridCache();
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

export const setPaletteMode = (mode, { silent = false, persist = true } = {}) => {
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

export const setCornersMode = (mode, { silent = false, persist = true } = {}) => {
  const root = document.documentElement;
  if (!CORNERS.includes(mode) || root.dataset.corners === mode) return;
  withCrossfade(() => {
    root.dataset.corners = mode;
    invalidateGridCache();
    assignPointerFieldDirty(true);
    updateLookButtonLabel();
    requestAnimationFrame(() => measureRail());
  });
  if (persist && !root.dataset.cornersLocked) {
    try { localStorage.setItem('lx-corners', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (!silent) showToast(`${t('lookCorners')}: ${t('corners_' + mode)}`);
};

export const setViewMode = (mode, { silent = false, persist = true } = {}) => {
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
    runGridSwitch(grid, run, 0, mode, 'view');
  }
  assignPointerFieldDirty(true);
  Motion.wake();
  if (persist && !root.dataset.viewLocked) {
    try { localStorage.setItem('lx-view', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (!silent) showToast(fmt('viewChanged', { m: t('view_' + mode) }));
};
export const updateFavicon = (cat) => {
  const accent = tone((cat && cat.accent) || '#7c9bff');
  const light = hexBlend(accent, [255, 255, 255], 0.45);
  const dark = hexBlend(accent, [0, 0, 0], 0.55);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${light}"/><stop offset="0.55" stop-color="${accent}"/><stop offset="1" stop-color="${dark}"/></linearGradient></defs><rect x="1" y="1" width="62" height="62" rx="16" fill="url(#g)"/><rect x="20" y="30" width="18" height="18" rx="3" fill="none" stroke="#fff" stroke-width="4"/><path d="M27 37 L44 20 M44 20 L34 20 M44 20 L44 30" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const link = document.querySelector('link[rel="icon"]');
  if (link) link.href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
};
const getStoredTheme = () => {
  try { return localStorage.getItem('lx-theme'); } catch (e) { return null; }
};
export const applyTheme = (explicit) => {
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

export const initThemeControls = () => {
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
    vt.finished.catch(() => {}).finally(() => { rootEl.classList.remove('lx-theme-swapping'); if (activeViewTransition === vt) assignActiveViewTransition(null); });

    sfx.chime(isLight);
  });
};

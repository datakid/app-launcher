import { escapeHtml } from './util.js';
import { sfx } from './audio.js';
import { icon, setIcon } from './marks.js';
import { t } from './i18n.js';
import { OPEN_MODES, openMode, openModeIcon, setOpenMode, syncOpenModeUI } from './open.js';
import { buildContextMenu, closeContextMenu, contextMenuAC, contextMenuEl, placeContextMenu, showContextMenu } from './context-menu.js';
import { invalidateGridCache } from './grid.js';
import { CORNERS, CORNER_SAMPLES, PALETTES, PALETTE_SWATCHES, VIEWS, VIEW_ICONS, cornersMode, paletteMode, setCornersMode, setPaletteMode, setViewMode, viewMode } from './theme.js';

export function updateLookButtonLabel() {
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
  if (!menu.querySelector('[data-look-palette]') || getComputedStyle(menu).opacity === '0') renderLookMenu(menu);
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

export const initLookMenu = () => {
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
    if (e.key?.startsWith('lx-variant-')) invalidateGridCache();
    if (e.key === 'lx-palette' && PALETTES.includes(e.newValue)) setPaletteMode(e.newValue, { silent: true, persist: false });
    if (e.key === 'lx-corners' && CORNERS.includes(e.newValue)) setCornersMode(e.newValue, { silent: true, persist: false });
    if (e.key === 'lx-view' && VIEWS.includes(e.newValue) && !document.documentElement.dataset.viewLocked) setViewMode(e.newValue, { silent: true, persist: false });
    if (e.key === 'lx-open' || e.key === null) syncOpenModeUI();
  });
};

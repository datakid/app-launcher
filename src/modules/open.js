import { LX_DEBUG } from './util.js';
import { fmt } from './catalogue.js';
import { setIcon } from './marks.js';
import { t } from './i18n.js';
import { invalidateGridCache } from './grid.js';
import { assignLastDetailKey, renderPaletteDetail } from './palette/view.js';
import { showToast } from './toast.js';
import { updateLookButtonLabel } from './appearance-menu.js';

export const OPEN_MODES = ['new', 'same'];
export const openMode = () => {
  let v = null;
  try { v = localStorage.getItem('lx-open'); } catch (e) { if (LX_DEBUG) console.warn(e); }
  return v === 'same' ? 'same' : 'new';
};
export const otherOpenMode = (m = openMode()) => (m === 'same' ? 'new' : 'same');
export const openModeAction = (m = openMode()) => (m === 'same' ? 'same-tab' : 'new-tab');
export const openModeIcon = (m = openMode()) => (m === 'same' ? 'fa-arrow-right-to-bracket' : 'fa-arrow-up-right-from-square');
export const openInSameTab = (url) => { if (url) window.location.href = url; };
export const openUrlWith = (url, m = openMode()) => (m === 'same' ? openInSameTab(url) : openInNewTab(url));
export const openInNewTab = (url) => {
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
export const syncOpenModeUI = () => {
  invalidateGridCache();
  const m = openMode();
  document.documentElement.dataset.openMode = m;
  document.querySelectorAll('#appGrid .card-link-overlay').forEach((a) => {
    if (m === 'same') a.removeAttribute('target');
    else a.setAttribute('target', '_blank');
    a.dataset.openMode = m;
  });
  document.querySelectorAll('#appGrid .open-affordance svg').forEach((s) => setIcon(s, openModeIcon(m)));
  assignLastDetailKey(null);
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open && typeof renderPaletteDetail === 'function') renderPaletteDetail();
  updateLookButtonLabel();
};

export const setOpenMode = (mode, { silent = true, persist = true } = {}) => {
  if (!OPEN_MODES.includes(mode)) return;
  if (persist) {
    try { localStorage.setItem('lx-open', mode); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  syncOpenModeUI();
  if (!silent) showToast(fmt('openModeSet', { m: t('openMode_' + mode) }));
};

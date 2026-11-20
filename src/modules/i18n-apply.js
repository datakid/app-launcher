import { categories } from './catalogue.js';
import { applyManifest, lang, t } from './i18n.js';
import { assignPointerFieldDirty } from './pointer-field.js';
import { invalidateGridCache, renderCards } from './grid.js';
import { updateLangButtonLabel, updateRefreshButtonLabel, updateSoundButtonLabel, updateThemeButtonLabel, updateZenButtonLabel } from './controls.js';
import { applyTabAccent, buildTabRail, currentTabId, measureRail, setActiveButtonStates, settleGridSwitch } from './tabs.js';
import { invalidateSearchIndex } from './palette/query.js';
import { paletteActiveIndex, paletteItems, renderPaletteResults, setPaletteActive } from './palette/view.js';
import { syncZenMetrics } from './zen.js';
import { updateDataButtonLabel } from './data-menu.js';
import { updateLookButtonLabel } from './appearance-menu.js';

const sweepStaticStrings = () => {
  document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-aria]').forEach(el => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
  document.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.dataset.i18nTitle)); });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder)); });
  updateBarKbd();
  updateBarLabel();
  if (typeof updateRefreshButtonLabel === 'function') updateRefreshButtonLabel();
};

export const isMacPlatform = () => {
  const p = navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '';
  return /mac|iphone|ipad|ipod/i.test(p);
};

export const updateBarLabel = () => {
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

export const applyI18n = (opts = {}) => {
  invalidateGridCache();
  const { rebuild = true } = opts;
  invalidateSearchIndex();

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

  assignPointerFieldDirty(true);

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

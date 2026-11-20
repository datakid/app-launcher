import { LX_DEBUG } from './util.js';
import { categories, loadCatalog, refreshCatalog, renderEmptyCatalog } from './catalogue.js';
import { warmGlyphs } from './marks.js';
import { assignLang, resolveInitialLang } from './i18n.js';
import { syncOpenModeUI } from './open.js';
import { initBarGlow, initMagneticControls, initPointerField } from './pointer-field.js';
import { fitIconLabels } from './views/icons.js';
import { applyTheme, initThemeControls } from './theme.js';
import { initOrbs } from './orbs.js';
import { applyStoredSoundPref, initControlToggles, initRefreshButton, initSoundResume, updateZenButtonLabel } from './controls.js';
import { applyI18n } from './i18n-apply.js';
import { activateTab, buildTabRail, getInitialTab, initTabGhost, initTabInput, measureRail } from './tabs.js';
import { initBarSearchButton, initPaletteDialog, initPaletteHints, initPaletteInput, syncHeroRestBox } from './palette/view.js';
import { initQrDialog, openQrFromUrl } from './qr-dialog.js';
import { initIdle } from './idle.js';
import { assignZenFontsPending, syncZenMetrics } from './zen.js';
import { initDebugOverlay } from './debug.js';
import { initDataMenu } from './data-menu.js';
import { initLookMenu } from './appearance-menu.js';
import { initShortcuts } from './shortcuts.js';
import { initGridKeyboardNav } from './views/nav.js';

const initFontsReady = () => {
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => {
      const applyFontsReady = () => {
        requestAnimationFrame(() => {
          measureRail();
          syncHeroRestBox();
          syncZenMetrics();
          const iconGrid = document.getElementById('appGrid');
          if (iconGrid && iconGrid.dataset.layout === 'icons') fitIconLabels(iconGrid);
          document.documentElement.classList.add('fonts-ready');
        });
      };
      if (document.documentElement.classList.contains('is-zen-transitioning')) {
        assignZenFontsPending(applyFontsReady);
      } else {
        requestAnimationFrame(applyFontsReady);
      }
    });
  } else {
    document.documentElement.classList.add('fonts-ready');
  }
};

const initViewportSync = () => {
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
};

const initPageShow = () => {
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
};

const setupInteractions = () => {
  assignLang(resolveInitialLang());
  applyI18n({ rebuild: false });

  applyTheme();
  applyStoredSoundPref();
  initSoundResume();
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
  initFontsReady();
  initOrbs();
  initViewportSync();
  initPageShow();
  initIdle();
  initThemeControls();
  initControlToggles();
  initTabInput();
  initPaletteInput();
  initQrDialog();
  openQrFromUrl();
  initPaletteDialog();
  initBarSearchButton();
  initShortcuts();
  initGridKeyboardNav();
  initPaletteHints();
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

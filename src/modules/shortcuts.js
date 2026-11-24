import { LX_DEBUG, cycle } from './util.js';
import { categories } from './catalogue.js';
import { otherOpenMode, setOpenMode } from './open.js';
import { CORNERS, PALETTES, VIEWS, cornersMode, paletteMode, setCornersMode, setPaletteMode, setViewMode, viewMode } from './theme.js';
import { assignHeroReturnFocus, openPalette, paletteClosing, requestClosePalette } from './palette/view.js';
import { closeQr, openQrForApp, openQrForSite } from './qr-dialog.js';
import { motionMs } from './motion.js';
import { isZen, toggleZenMode } from './zen.js';

export const initShortcuts = () => {
  const paletteDialog = document.getElementById('lx-palette');
  const searchBtn = document.getElementById('lxBarSearch');
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
      if (paletteDialog.open && !paletteClosing()) { requestClosePalette(); return; }
      if (document.activeElement === searchBtn) assignHeroReturnFocus(true);
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
      assignHeroReturnFocus(true);
      openPalette('');
      return;
    }
    if (isTypeAhead(e)) {
      e.preventDefault();
      assignHeroReturnFocus(true);
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
        setTimeout(() => card.classList.remove('is-keylaunched'), motionMs('--dur-fast'));
        card.querySelector('.card-link-overlay')?.click();
      }
    }
  });
};

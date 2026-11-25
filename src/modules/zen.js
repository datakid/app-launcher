import { LX_DEBUG } from './util.js';
import { t } from './i18n.js';
import { EASE_LUX, MOTION, MQ, Motion, animate } from './motion.js';
import { assignPointerFieldDirty } from './pointer-field.js';
import { closeContextMenu } from './context-menu.js';
import { fitIconLabels, repackIcons } from './views/icons.js';
import { invalidateGridCache } from './grid.js';
import { updateZenButtonLabel } from './controls.js';
import { activeViewTransition, assignActiveViewTransition, measureRail, nameTiles, withViewTransition } from './tabs.js';
import { syncHeroRestBox } from './palette/view.js';
import { stopIdle } from './idle.js';

let zenGen = 0;
let zenVT = null;
let zenFallbackAnims = [];
let zenFocusReturn = false;
let zenFontsPending = null;
export const assignZenFontsPending = (v) => (zenFontsPending = v);

export const isZen = () => document.body.classList.contains('is-zen');

export const syncZenMetrics = () => {
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

const zenLive = () => {
  const cards = [...document.querySelectorAll('#appGrid .app-card')];
  if (zenVT) {
    return cards.map((_, i) => {
      const cs = getComputedStyle(document.documentElement, `::view-transition-group(tile-${i})`);
      const m = new DOMMatrix(cs.transform);
      const width = parseFloat(cs.width);
      return width ? { left: m.e, top: m.f, width, height: parseFloat(cs.height) } : null;
    });
  }
  return zenFallbackAnims.length ? cards.map((c) => (c.querySelector('.card-clip') || c).getBoundingClientRect()) : null;
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
  assignPointerFieldDirty(true);
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

const runZenFlip = (enabled, cards, gen, from) => {
  zenNeutralizeSprings();
  const rects = from || cards.map((c) => c.getBoundingClientRect());
  document.body.classList.toggle('is-zen', enabled);
  syncZenLayout();
  updateZenButtonLabel();

  return new Promise((resolve) => requestAnimationFrame(resolve)).then(() => {
    if (gen !== zenGen) return;
    const anims = cards.flatMap((card, i) => {
      const old = rects[i];
      if (!old) return [];
      const next = card.getBoundingClientRect();
      const dx = old.left - next.left;
      const dy = old.top - next.top;
      const sxRaw = next.width ? old.width / next.width : 1;
      const syRaw = next.height ? old.height / next.height : 1;
      const scale = Math.min(sxRaw, syRaw);
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(scale - 1) < 0.002) return [];
      const layers = card.classList.contains('app-card--icon') ? [card] : [card.querySelector('.card-shadow'), card.querySelector('.card-clip')].filter(Boolean);
      return layers.map((layer) => {
        const anim = animate(layer, [
          { transformOrigin: '0 0', transform: `translate(${dx}px, ${dy}px) scale(${from ? sxRaw : scale}, ${from ? syRaw : scale})`, opacity: 0.92 },
          { transformOrigin: '0 0', transform: 'none', opacity: 1 }
        ], { duration: MOTION.zen.inMs, easing: EASE_LUX, fill: 'both' });
        zenFallbackAnims.push(anim);
        return anim;
      });
    });
    return Promise.allSettled(anims.map((a) => a.finished));
  }).finally(() => {
    if (gen === zenGen) zenCancelFallback();
  });
};

export const setZenMode = (enabled) => {
  const paletteDialog = document.getElementById('lx-palette');
  if (paletteDialog && paletteDialog.open) return;
  if (document.getElementById('lx-qr')?.open) return;
  if (isZen() === enabled && !document.documentElement.classList.contains('is-zen-transitioning')) return;
  invalidateGridCache();

  const zenBtn = document.getElementById('zenToggle');
  zenFocusReturn = document.activeElement === zenBtn;

  zenGen += 1;
  const gen = zenGen;
  try { localStorage.setItem('lx-zen', enabled ? '1' : '0'); } catch (e) { if (LX_DEBUG) console.warn(e); }

  const live = zenLive();
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
  if (appGrid && !live) nameTiles(appGrid, true);

  if (document.startViewTransition && !live) {
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
      if (activeViewTransition === vt) assignActiveViewTransition(null);
      zenFinish(gen, zenBtn);
    });
    return;
  }

  runZenFlip(enabled, cards, gen, live).finally(() => {
    zenFinish(gen, zenBtn);
  });
};

export const toggleZenMode = () => { setZenMode(!isZen()); };

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
    assignPointerFieldDirty(true);
    Motion.wake();
    syncHeroRestBox();
    measureRail();
    syncZenMetrics();
  }));
};

window.addEventListener('resize', zenForceSettle, { passive: true });

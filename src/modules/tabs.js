import { LX_DEBUG, escapeHtml } from './util.js';
import { categories } from './catalogue.js';
import { sfx } from './audio.js';
import { icon } from './marks.js';
import { loc } from './i18n.js';
import { EASE_ENTER, EASE_EXIT, EASE_LUX, MOTION, MQ, Motion, animate, isLowEnd, motionMs } from './motion.js';
import { assignPointerFieldDirty } from './pointer-field.js';
import { setInteractionOrigin } from './origin.js';
import { repackIcons } from './views/icons.js';
import { cardDistances, gridUnits, renderCards, staggerCardEntry, staggerDelay } from './grid.js';
import { isFlatView, tone, updateFavicon, viewMode } from './theme.js';

export let activeViewTransition = null;
export const assignActiveViewTransition = (v) => (activeViewTransition = v);
export let currentTabId = null;
export const assignCurrentTabId = (v) => (currentTabId = v);
export let firstCardBatchDone = false;
export const assignFirstCardBatchDone = (v) => (firstCardBatchDone = v);

const supportsTileTransitions = typeof CSS !== 'undefined' && CSS.supports('view-transition-class', 'x');
export const supportsViewTimeline = typeof CSS !== 'undefined' && CSS.supports('animation-timeline', 'view()');
export const isNarrowViewport = () => MQ.narrow;

let vtDebounceTimer = null;
const VT_DEBOUNCE_MS = 80;

export const withViewTransition = (fn) => {
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

export const nameTiles = (grid, on) => {
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

export const applyTabAccent = (cat, impulseDir = 0) => {
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

export const measureRail = () => {
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

  railAnim = animate(ind, 
    [railBox(from), { ...railBox(mid), offset: 0.42 }, railBox(to)],
    { duration: MOTION.tab.railMs, easing: EASE_LUX, fill: 'both' }
  );
  railAnim.finished.then(() => {
    placeIndicator(ind, to);
    railAnim?.cancel(); railAnim = null;
  }).catch(() => {});
};

export const initTabGhost = () => {
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

export const setActiveButtonStates = (id) => {
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

export let gridSwitch = null;

export const settleGridSwitch = () => {
  if (!gridSwitch) return;
  const s = gridSwitch;
  gridSwitch = null;
  s.anims.forEach((a) => { try { a.cancel(); } catch (e) { if (LX_DEBUG) console.warn(e); } });
  s.ghost?.remove();
  s.cards.forEach((c) => { c.style.willChange = ''; });
};

export const runGridSwitch = (g, run, travel, nextView = viewMode(), kind = 'tab') => {
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
    ghost.classList.remove('has-dim-engine', 'has-ring');
    ghost.querySelectorAll('.app-card').forEach((c) => { c.classList.remove('is-tracking', 'is-live', 'is-hot', 'is-kb-focus', 'is-ring'); c.style.transform = ''; c.style.willChange = ''; });
    ghost.querySelectorAll('.card-clip, .card-shadow').forEach((n) => { n.style.opacity = ''; });
    ghost.style.cssText += `;contain:layout paint style;position:absolute;left:${g.offsetLeft}px;top:${g.offsetTop}px;width:${g.offsetWidth}px;height:${g.offsetHeight}px;margin:0;pointer-events:none;z-index:0;overflow:hidden;`;
    ghost.scrollTop = g.scrollTop;
    container.insertBefore(ghost, g);
    const out = animate(ghost, 
      [{ opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }, { opacity: 0, transform: `translate3d(${-travel * (kind === 'tab' ? 8 : MOTION.travelOut)}px,0,0) scale(${MOTION.scaleOut})` }],
      { duration: mo.outMs, easing: kind === 'tab' ? EASE_EXIT : MOTION.outEase, fill: 'forwards' }
    );
    anims.push(out);
  }

  const wasBoot = run();
  const scrollDriven = supportsViewTimeline && isNarrowViewport();
  const cards = gridUnits(g);
  const { dists, max } = !g._cacheHit && mo.stagger ? cardDistances(cards) : { dists: [], max: 1 };

  if (g.classList.contains('is-auto-flow')) g.classList.toggle('has-overflow', g.scrollHeight - g.clientHeight > 4);

  if (g._cacheHit) {
    if (!MQ.reducedMotion) anims.push(animate(g, [{ opacity: 0 }, { opacity: 1 }], { duration: motionMs('--dur-micro', 160), easing: EASE_LUX }));
  } else if (!scrollDriven || kind === 'tab') {
    cards.forEach((c, i) => {
      c.classList.add('no-enter');
      c.style.willChange = 'opacity, translate, scale';
      const from = inFlat && !travel ? `0 ${MOTION.liftIn}px` : `${travel * (kind === 'tab' ? 8 : MOTION.travelIn)}px 0`;
      const a = animate(c, 
        [{ opacity: 0, translate: from, scale: String(MOTION.scaleIn) }, { opacity: 1, translate: '0 0', scale: '1' }],
        { duration: mo.inMs, delay: mo.inDelay + staggerDelay(kind, dists[i], max), easing: kind === 'tab' ? EASE_ENTER : EASE_LUX, fill: 'backwards' }
      );
      anims.push(a);
    });
  } else if (wasBoot) {
    staggerCardEntry(g, wasBoot);
  }

  const state = { anims, ghost, cards };
  gridSwitch = state;
  assignPointerFieldDirty(true);
  Motion.wake();

  return Promise.allSettled(anims.map((a) => a.finished)).then(() => {
    if (gridSwitch !== state) return;
    gridSwitch = null;
    ghost?.remove();
    cards.forEach((c) => { c.style.willChange = ''; });
    if (g._icDeferred) { g._icDeferred = false; repackIcons(g); }
    assignPointerFieldDirty(true);
    Motion.wake();
  });
};

export const activateTab = (id, opts = {}) => {
  const { pushHash = true, playSound = true, instant = false } = opts;
  if (!categories.some(c => c.id === id)) return Promise.resolve();
  const prevId = currentTabId;
  const dir = prevId ? (catIndex(id) > catIndex(prevId) ? 1 : -1) : 1;
  currentTabId = id;

  const cat = categories.find(c => c.id === id);

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

  const run = () => renderCards(g, id, { useCache: prevId !== id });

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

export const buildTabRail = () => {
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

export const getInitialTab = () => {
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

export const initTabInput = () => {
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
};

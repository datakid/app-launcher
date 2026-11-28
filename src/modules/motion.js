export const Motion = (() => {
  const subs = new Set();
  let raf = null, last = 0;

  const tick = (now) => {
    const dt = Math.max(0, Math.min((now - last) / 1000, 1 / 20));
    last = now;
    if (dt > 0) for (const s of subs) s.fixed?.(dt);
    let alive = false;
    for (const s of subs) { if (s.render?.(now / 1000, 1) !== false) alive = true; }
    raf = alive && !document.hidden ? requestAnimationFrame(tick) : null;
  };

  return {
    add(s) { subs.add(s); this.wake(); },
    remove(s) { subs.delete(s); },
    wake() { if (!raf && !document.hidden) { last = performance.now(); raf = requestAnimationFrame(tick); } },
    get subCount() { return subs.size; },
    get awake() { return !!raf; }
  };
})();

document.addEventListener('visibilitychange', () => { if (!document.hidden) Motion.wake(); });

export const MQ = (() => {
  const specs = {
    reducedMotion: '(prefers-reduced-motion: reduce)',
    hoverFine: '(hover: hover) and (pointer: fine)',
    reducedTransparency: '(prefers-reduced-transparency: reduce)',
    narrow: '(max-width: 1024px)'
  };
  const state = {};
  for (const key in specs) {
    const mql = window.matchMedia(specs[key]);
    state[key] = mql.matches;
    mql.addEventListener('change', (e) => { state[key] = e.matches; syncMotion(); });
  }
  return state;
})();

const motionStyle = getComputedStyle(document.documentElement);
const token = (name) => motionStyle.getPropertyValue(name).trim();
const unit = (name) => {
  const v = token(name);
  const n = Number.parseFloat(v) || 0;
  return /[^m]s$/.test(v) ? n * 1000 : n;
};
export const motionMs = unit;
export const EASE_LUX = token('--ease-lux');
export const EASE_ENTER = token('--ease-enter');
export const EASE_EXIT = token('--ease-exit');
export const EASE_ACCEL = token('--ease-accel');
export const isLowEnd = () => navigator.hardwareConcurrency <= 4 || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4);
const MOTION_SPEC = {
  tab: { outMs: '--lx-tab-out', inMs: '--lx-tab-in', inDelay: '--mo-tab-wait', stagger: '--mo-tab-stagger', railMs: '--mo-tab-rail', travelOut: '--mo-tab-travel', travelIn: '--mo-tab-travel' },
  view: { outMs: '--mo-view-out', inMs: '--mo-view-in', inDelay: '--mo-view-wait', stagger: '--mo-view-stagger', travelOut: '--mo-travel-out', travelIn: '--mo-travel-in' },
  fx: { liftIn: '--mo-lift', scaleOut: '--mo-scale-out', scaleIn: '--mo-scale-in' },
  palette: { inMs: '--mo-pal-in', outMs: '--mo-pal-out', fade: '--mo-pal-fade', wait: '--mo-pal-wait', outFade: '--mo-pal-out-fade', hero: '--mo-pal-hero' },
  crossfade: { inMs: '--mo-xfade' },
  theme: { inMs: '--mo-theme' },
  zen: { inMs: '--mo-zen' },
  boot: { offset: '--mo-boot-offset', spread: '--mo-boot-spread' },
  tile: { inMs: '--mo-tile' }
};
export const MOTION = {};
export const syncMotion = () => {
  for (const group in MOTION_SPEC) {
    const row = MOTION[group] || (MOTION[group] = {});
    for (const field in MOTION_SPEC[group]) row[field] = unit(MOTION_SPEC[group][field]);
  }
};
syncMotion();
let scrollingTimer = 0;
const onAnyScroll = () => {
  const root = document.documentElement;
  if (!root.classList.contains('lx-scrolling')) root.classList.add('lx-scrolling');
  clearTimeout(scrollingTimer);
  scrollingTimer = setTimeout(() => { root.classList.remove('lx-scrolling'); for (const hook of scrollSettleHooks) hook(); Motion.wake(); }, 150);
};
document.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
if (isLowEnd()) document.documentElement.setAttribute('data-lowend', '');

export class Spring {
  constructor(k = 190, c = 24, v = 0, scale = 1, px = false) {
    this.k = k; this.c = c; this.v = v; this.dv = 0; this.to = v;
    this.scale = scale; this.px = px;
  }
  fixed(dt) {
    let t = Math.min(dt, 1 / 20);
    while (t > 1e-6) {
      const h = Math.min(t, 1 / 240);
      const a = -this.k * (this.v - this.to) - this.c * this.dv;
      this.dv += a * h;
      this.v += this.dv * h;
      t -= h;
    }
  }

  snap() { this.v = this.to; this.dv = 0; }
  get settled() {
    const eps = this.px ? Math.max(1e-3 * this.scale, 0.5) : 1e-3 * this.scale;
    return Math.abs(this.dv) < eps && Math.abs(this.v - this.to) < eps;
  }
}

export const spring = (responseSec, damping = 1.0, scale = 1, px = false) => {
  const w = (2 * Math.PI) / responseSec;
  return new Spring(w * w, 2 * damping * w, 0, scale, px);
};

export const scrollSettleHooks = [];

export const animate = (el, keyframes, options) => {
  if (!MQ.reducedMotion) return el.animate(keyframes, options);
  const instant = typeof options === 'number' || options == null ? { duration: 0 } : { ...options, duration: 0, delay: 0, endDelay: 0 };
  return el.animate(keyframes, instant);
};

let tileFrom = null;
export const noteTile = (el) => {
  const r = el && el.getBoundingClientRect();
  tileFrom = r && r.width ? { r, at: performance.now() } : null;
};
export const travelTile = (el, src) => {
  const from = tileFrom && performance.now() - tileFrom.at < 800 ? tileFrom.r : src && src.getBoundingClientRect();
  const to = el && el.getBoundingClientRect();
  if (!from || !from.width || !to || !to.width) return;
  tileFrom = null;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2);
  const dy = from.top + from.height / 2 - (to.top + to.height / 2);
  animate(el, [{ translate: `${dx}px ${dy}px`, scale: from.width / to.width }, { translate: '0px 0px', scale: 1 }], { duration: MOTION.tile.inMs, easing: EASE_LUX });
};

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
    mql.addEventListener('change', (e) => { state[key] = e.matches; });
  }
  return state;
})();

const motionStyle = getComputedStyle(document.documentElement);
export const motionMs = (name, fallback) => {
  const value = motionStyle.getPropertyValue(name).trim();
  const number = Number.parseFloat(value);
  return Number.isFinite(number) && /m?s$/.test(value) ? number * (value.endsWith('ms') ? 1 : 1000) : fallback;
};
export const EASE_LUX = motionStyle.getPropertyValue('--ease-lux').trim() || 'cubic-bezier(0.22, 1, 0.36, 1)';
export const EASE_ENTER = motionStyle.getPropertyValue('--ease-enter').trim() || EASE_LUX;
export const EASE_EXIT = motionStyle.getPropertyValue('--ease-exit').trim() || EASE_LUX;
export const isLowEnd = () => navigator.hardwareConcurrency <= 4 || (typeof navigator.deviceMemory === 'number' && navigator.deviceMemory <= 4);
const MOTION_SHARED = { outEase: 'cubic-bezier(0.4, 0, 0.7, 0.2)', travelOut: 10, travelIn: 14, liftIn: 8, scaleOut: 0.988, scaleIn: 0.982 };
const MOTION_LEGACY = {
  ...MOTION_SHARED,
  tab: { outMs: motionMs('--lx-tab-out', 120), inMs: motionMs('--lx-tab-in', 240), inDelay: 0, stagger: 0, railMs: 460 },
  view: { outMs: 190, inMs: motionMs('--dur-slow', 620), inDelay: 60, stagger: 150, railMs: 460 },
  version: { inMs: 240 },
  paletteOpen: { inMs: 420 },
  paletteClose: { outMs: 250 },
  qr: { inMs: 420, outMs: 250, variantMs: 240 },
  crossfade: { inMs: 280 },
  theme: { inMs: 460 },
  boot: { inMs: 0, offset: 120, spread: 260 },
  hover: { inMs: 0 }
};
const MOTION_NEW = {
  ...MOTION_SHARED,
  tab: { outMs: motionMs('--lx-tab-out', 120), inMs: motionMs('--lx-tab-in', 240), inDelay: 0, stagger: 0, railMs: 220 },
  view: { outMs: 120, inMs: 220, inDelay: 60, stagger: 0, railMs: 220 },
  version: { inMs: 120 },
  paletteOpen: { inMs: 200 },
  paletteClose: { outMs: 140 },
  qr: { inMs: 220, outMs: 150, variantMs: 160 },
  crossfade: { inMs: 200 },
  theme: { inMs: 320 },
  boot: { inMs: 360, offset: 120, spread: 180 },
  hover: { inMs: motionMs('--dur-micro', 160) }
};
export const MOTION = document.documentElement.dataset.motion === 'legacy' ? MOTION_LEGACY : MOTION_NEW;
document.documentElement.style.setProperty('--lx-version-ms', `${MOTION.version.inMs}ms`);
document.documentElement.style.setProperty('--lx-qr-in-ms', `${MOTION.qr.inMs}ms`);
document.documentElement.style.setProperty('--lx-qr-out-ms', `${MOTION.qr.outMs}ms`);
document.documentElement.style.setProperty('--lx-qr-variant-ms', `${MOTION.qr.variantMs}ms`);
if (MOTION.boot.inMs) document.documentElement.style.setProperty('--lx-boot-ms', `${MOTION.boot.inMs}ms`);
if (MOTION.hover.inMs) document.documentElement.style.setProperty('--lx-hover-ms', `${MOTION.hover.inMs}ms`);
let scrollingTimer = 0;
const onAnyScroll = () => {
  const root = document.documentElement;
  if (!root.classList.contains('lx-scrolling')) root.classList.add('lx-scrolling');
  clearTimeout(scrollingTimer);
  scrollingTimer = setTimeout(() => { root.classList.remove('lx-scrolling'); for (const hook of scrollSettleHooks) hook(); Motion.wake(); }, 150);
};
document.addEventListener('scroll', onAnyScroll, { passive: true, capture: true });
if (isLowEnd()) document.documentElement.setAttribute('data-lowend', '');
export const EASE_ACCEL = 'cubic-bezier(0.4, 0, 1, 1)';

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

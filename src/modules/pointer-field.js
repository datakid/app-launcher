import { LX_DEBUG, clamp } from './util.js';
import { MQ, Motion, scrollSettleHooks, spring } from './motion.js';
import { isFlatView, viewMode } from './theme.js';
import { gridSwitch } from './tabs.js';
import { confirmationPending } from './data-menu.js';
import { onPointerMove } from './pointer.js';

let pointerFieldDirty = true;
export const assignPointerFieldDirty = (v) => (pointerFieldDirty = v);
export let pointerVX = 0;
export const initPointerField = () => {
  const grid = document.getElementById('appGrid');
  const container = document.querySelector('.container');
  const spot = document.getElementById('spotlight');
  if (!grid || !container) return;
  if (!MQ.hoverFine) return;

  const paletteEl = document.getElementById('lx-palette');
  const qrEl = document.getElementById('lx-qr');
  const isSuspended = () => confirmationPending || !!((paletteEl && paletteEl.open) || (qrEl && qrEl.open));
  let REVEAL_RADIUS = Math.max(150, Math.min(260, window.innerWidth * 0.22));
  let cards = [];
  let px = -9999, py = -9999;
  let sx = -9999, sy = -9999;
  let hasPointer = false;
  let lastMove = 0;
  let hoveredAccentCard = null;
  let lastHoverAccent = '';
  let gridRect = null;
  let focal = null;
  let focalSince = 0;
  let gapSince = 0;
  let cardHoverFlag = false;
  let intentPending = false;
  const engage = spring(0.46, 1.0);
  const DIM_BASE = 0.07;
  const DIM_FAR = 0.18;
  const DIM_INTENT_MS = 110;
  const GAP_HOLD_MS = 480;
  grid.classList.add('has-dim-engine');

  const measure = () => {
    cards = viewMode() === 'icons' ? [] : Array.from(grid.querySelectorAll('.app-card'));
    if (LX_DEBUG) window.__lxDebugPointerFieldCount = cards.length;
    const gr = grid.getBoundingClientRect();
    gridRect = gr;
    if (focal && !focal.isConnected) {
      const id = focal.dataset.appId;
      focal = cards.find(c => c.dataset.appId === id) || null;
      if (focal) cards.forEach(c => { if (c._springs) return; c._seedDim = true; });
    }
    const gl = gr.left - grid.scrollLeft, gt = gr.top - grid.scrollTop;
    cards.forEach(c => {
      const w = c.offsetWidth, h = c.offsetHeight;
      let left, top;
      if (c.offsetParent === grid) { left = gl + c.offsetLeft; top = gt + c.offsetTop; }
      else { const r = c.getBoundingClientRect(); left = r.left; top = r.top; }
      c._r = { left, top, right: left + w, bottom: top + h };
      if (!c._clip) c._clip = c.querySelector('.card-clip');
      if (!c._shadow) c._shadow = c.querySelector('.card-shadow');
      if (!c._springs) {

        c._springs = {
          tx: spring(0.44, 1.0),
          ty: spring(0.44, 1.0),
          tz: spring(0.4, 1.0, 7, true),
          reveal: spring(0.48, 1.0),
          sc: spring(0.36, 0.94, 0.02),
          hov: spring(0.34, 1.0),
          dim: spring(0.5, 1.0)
        };
        c._springs.sc.v = 1;
        c._springs.sc.to = 1;
        if (c._seedDim && focal && c !== focal) c._springs.dim.v = c._springs.dim.to = DIM_BASE * engage.v;
        c._seedDim = false;
      }
      if (!c._last) c._last = {};
    });
    pointerFieldDirty = false;
    falloffFor = undefined;
  };

  let falloffFor;
  const computeFalloff = () => {
    if (falloffFor === focal) return;
    falloffFor = focal;
    const f = focal && focal._r ? focal._r : null;
    let maxD = 1;
    cards.forEach(c => {
      if (!f || !c._r) { c._fd = 0; return; }
      const d = Math.hypot((c._r.left + c._r.right - f.left - f.right) / 2, (c._r.top + c._r.bottom - f.top - f.bottom) / 2);
      c._fd = d;
      maxD = Math.max(maxD, d);
    });
    cards.forEach(c => { c._fd = (c._fd || 0) / maxD; });
  };

  const setFocal = (next, now) => {
    if (next === focal) return;
    if (!focal) focalSince = now;
    focal = next;
  };

  const setIfChanged = (c, key, val, eps, unit) => {
    const prev = c._last[key];
    if (prev !== undefined && Math.abs(prev - val) < eps) return;
    c._last[key] = val;
    c.style.setProperty(key, unit ? `${val}${unit}` : String(val));
  };

  const subscriber = {
    fixed(dt) {
      pointerVX *= Math.exp(-dt / 0.14);
      if (gridSwitch || document.documentElement.classList.contains('lx-scrolling')) return;
      if (pointerFieldDirty) measure();
      const zenTransitioning = document.documentElement.classList.contains('is-zen-transitioning') || !!(qrEl && qrEl.open);
      const wantsTilt = !MQ.reducedMotion && !zenTransitioning;
      const suspended = isSuspended();
      const fx = suspended ? -9999 : px;
      const fy = suspended ? -9999 : py;
      const now = performance.now();
      hoveredAccentCard = null;

      let under = null;
      for (const c of cards) {
        const r = c._r;
        if (r && fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom) { under = c; break; }
      }
      const kb = suspended ? null : cards.find(c => c.classList.contains('is-kb-focus')) || null;
      if (under) {
        gapSince = 0;
        setFocal(under, now);
      } else if (focal && focal !== kb && !suspended && !zenTransitioning && gridRect && hasPointer &&
                 fx >= gridRect.left && fx <= gridRect.right && fy >= gridRect.top && fy <= gridRect.bottom) {
        if (!gapSince) gapSince = now;
        if (now - gapSince > GAP_HOLD_MS) { gapSince = 0; setFocal(kb, now); }
      } else {
        gapSince = 0;
        setFocal(kb, now);
      }
      computeFalloff();
      const listMode = isFlatView();
      const engaged = !!focal && !zenTransitioning && !gridSwitch && !listMode && cards.length > 1 && (kb === focal || now - focalSince >= DIM_INTENT_MS);
      intentPending = !!focal && !engaged && !zenTransitioning && !listMode && cards.length > 1;
      engage.to = engaged ? 1 : 0;
      if (zenTransitioning) engage.snap(); else engage.fixed(dt);
      if (engaged !== cardHoverFlag) {
        cardHoverFlag = engaged;
        document.body.classList.toggle('is-card-hover', engaged);
      }

      cards.forEach(c => {
        const r = c._r;
        const s = c._springs;
        if (!r || !s) return;

        const fd = c._fd || 0;
        const depth = c === focal ? 0 : (DIM_BASE + (DIM_FAR - DIM_BASE) * fd * fd) * (c.classList.contains('status-closed') ? 1.15 : 1);
        s.dim.to = depth * engage.v;
        if (zenTransitioning) s.dim.snap(); else s.dim.fixed(dt);

        if (zenTransitioning) {
          s.tx.to = 0; s.ty.to = 0; s.tz.to = 0; s.reveal.to = 0; s.hov.to = 0; s.sc.to = 1;
          s.tx.snap(); s.ty.snap(); s.tz.snap(); s.reveal.snap(); s.sc.snap(); s.hov.snap();
          return;
        }

        const dx = fx < r.left ? r.left - fx : fx > r.right ? fx - r.right : 0;
        const dy = fy < r.top ? r.top - fy : fy > r.bottom ? fy - r.bottom : 0;
        const d = Math.hypot(dx, dy);
        let o = d >= REVEAL_RADIUS ? 0 : 1 - d / REVEAL_RADIUS;
        o *= o;
        s.reveal.to = o * 0.9;

        const inside = fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom;
        if (inside) hoveredAccentCard = c;
        if (inside && wantsTilt) {
          const nx = (fx - r.left - (r.right - r.left) / 2) / ((r.right - r.left) / 2);
          const ny = (fy - r.top - (r.bottom - r.top) / 2) / ((r.bottom - r.top) / 2);
          const lean = clamp(pointerVX * 0.0006, -0.25, 0.25);
          s.tx.to = nx + lean;
          s.ty.to = ny;
          s.tz.to = 7;
        } else {
          s.tx.to = 0; s.ty.to = 0; s.tz.to = 0;
        }

        const focused = !suspended && c.classList.contains('is-kb-focus');
        const active = inside || focused;
        s.hov.to = active ? 1 : 0;
        s.sc.to = c._pressed ? 0.988 : (active ? 1.004 : 1 - 0.018 * s.dim.v);

        if (wantsTilt) {
          s.tx.fixed(dt); s.ty.fixed(dt); s.tz.fixed(dt); s.reveal.fixed(dt);
          s.sc.fixed(dt); s.hov.fixed(dt);
        } else {

          s.tx.snap(); s.ty.snap(); s.tz.snap(); s.reveal.snap();
          s.sc.snap(); s.hov.snap();
        }
      });

      const nextAccent = hoveredAccentCard ? hoveredAccentCard.style.getPropertyValue('--c1') : '';
      if (nextAccent !== lastHoverAccent && spot) {
        lastHoverAccent = nextAccent;
        if (nextAccent) spot.style.setProperty('--hover-accent', nextAccent);
        else spot.style.removeProperty('--hover-accent');
      }

      if (hasPointer && !suspended) {
        const k = 1 - Math.exp(-dt / 0.09);
        sx += (px - sx) * k;
        sy += (py - sy) * k;
      } else {
        sx = px; sy = py;
      }
    },

    render() {
      let alive = false;
      const suspended = isSuspended();
      const fx = suspended ? -9999 : px;
      const fy = suspended ? -9999 : py;

      cards.forEach(c => {
        const r = c._r;
        const s = c._springs;
        if (!r || !s) return;

        const clip = c._clip || c;
        const lp = clip._last || (clip._last = {});
        const setLeaf = (key, val, eps, unit) => {
          const prev = lp[key];
          if (prev !== undefined && Math.abs(prev - val) < eps) return;
          lp[key] = val;
          clip.style.setProperty(key, unit ? `${val}${unit}` : String(val));
        };
        setLeaf('--reveal-o', s.reveal.v, 0.001);
        if (s.reveal.to > 0) {
          setLeaf('--rx', fx - r.left, 0.5, 'px');
          setLeaf('--ry', fy - r.top, 0.5, 'px');
        } else if (s.reveal.v <= 0.002 && '--rx' in lp) {
          clip.style.removeProperty('--rx');
          clip.style.removeProperty('--ry');
          delete lp['--rx'];
          delete lp['--ry'];
        }
        setIfChanged(c, '--tx', s.tx.v, 0.002);
        setIfChanged(c, '--ty', s.ty.v, 0.002);
        setIfChanged(c, '--hov', s.hov.v, 0.002);
        const op = 1 - s.dim.v;
        if (op > 0.999) {
          if (c._last.op !== undefined) { c.style.opacity = ''; c._last.op = undefined; }
        } else if (c._last.op === undefined || Math.abs(c._last.op - op) > 0.002) {
          c._last.op = op;
          c.style.opacity = op.toFixed(3);
        }

        const inside = fx >= r.left && fx <= r.right && fy >= r.top && fy <= r.bottom;
        if (inside) {
          if (!c._hasPos) { c._hasPos = true; c.classList.add('has-pointer-pos'); }
          c.classList.add('is-tracking');
          setLeaf('--gx', fx - r.left, 0.5, 'px');
          setLeaf('--gy', fy - r.top, 0.5, 'px');
        } else if (c.classList.contains('is-tracking')) {
          c.classList.remove('is-tracking');
        }

        const tx = s.tx.v, ty = s.ty.v, tz = s.tz.v, sc = s.sc.v;
        const rest = Math.abs(tx) < 0.001 && Math.abs(ty) < 0.001 && Math.abs(tz) < 0.05 && Math.abs(sc - 1) < 0.0002;
        const L = c._last;
        if (rest) {
          if (L.tf !== '') { c.style.transform = ''; L.tf = ''; L.tx = L.ty = L.tz = L.sc = undefined; }
        } else if (L.tx === undefined || Math.abs(L.tx - tx) > 0.0015 || Math.abs(L.ty - ty) > 0.0015 || Math.abs(L.tz - tz) > 0.05 || Math.abs(L.sc - sc) > 0.0002) {
          L.tx = tx; L.ty = ty; L.tz = tz; L.sc = sc;
          L.tf = `perspective(1600px) rotateX(${(-ty * 1.1).toFixed(3)}deg) rotateY(${(tx * 1.1).toFixed(3)}deg) translateZ(${tz.toFixed(2)}px) scale(${sc.toFixed(4)})`;
          c.style.transform = L.tf;
        }

        const moving = !(s.tx.settled && s.ty.settled && s.tz.settled && s.reveal.settled && s.sc.settled && s.hov.settled);
        const settled = !moving && s.dim.settled;
        const live = inside || moving;
        if (live !== !!c._wc) { c._wc = live; c.classList.toggle('is-live', live); }
        const hot = !MQ.reducedMotion && s.hov.to > 0.5;
        if (hot !== !!c._hot) { c._hot = hot; c.classList.toggle('is-hot', hot); }

        if (!settled) alive = true;
      });
      if (!engage.settled || gapSince || intentPending) alive = true;

      if (spot && !document.body.classList.contains('is-cinema')) {
        if (hasPointer && !suspended) {
          const idle = performance.now() - lastMove > 2200;
          spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
          spot.classList.add('is-active');
          spot.classList.toggle('is-idle', idle);
          if (!idle || Math.abs(px - sx) > 0.1 || Math.abs(py - sy) > 0.1) alive = true;
        } else {
          if (hasPointer) spot.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0)`;
          spot.classList.remove('is-active', 'is-idle');
        }
      }

      return alive;
    }
  };

  onPointerMove((e) => {
    if (e.pointerType === 'touch') return;
    const now = performance.now();
    if (!hasPointer) {
      px = e.clientX; py = e.clientY;
      sx = px; sy = py;
      pointerVX = 0;
      hasPointer = true;
      lastMove = now;
      pointerFieldDirty = true;
      Motion.wake();
      return;
    }
    if (isSuspended()) {
      px = e.clientX; py = e.clientY;
      sx = px; sy = py;
      pointerVX = 0;
      lastMove = now;
      return;
    }
    const dt = Math.max((now - lastMove) / 1000, 1 / 240);
    const rawVx = clamp((e.clientX - px) / dt, -4000, 4000);
    pointerVX += (rawVx - pointerVX) * (1 - Math.exp(-dt / 0.05));
    px = e.clientX; py = e.clientY;
    lastMove = now;
    Motion.wake();
  });

  if (paletteEl) {
    paletteEl.addEventListener('close', () => { pointerFieldDirty = true; Motion.wake(); });
  }
  if (qrEl) {
    qrEl.addEventListener('close', () => { pointerFieldDirty = true; Motion.wake(); });
    qrEl.addEventListener('toggle', () => { Motion.wake(); });
  }
  grid.addEventListener('focusin', () => Motion.wake());
  grid.addEventListener('focusout', () => Motion.wake());
  grid.addEventListener('animationend', (e) => {
    if (!e.target.classList || !e.target.classList.contains('app-card')) return;
    pointerFieldDirty = true;
    Motion.wake();
  });
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || hasPointer) return;
    px = e.clientX; py = e.clientY;
    sx = px; sy = py;
    hasPointer = true;
    lastMove = performance.now();
    pointerFieldDirty = true;
    Motion.wake();
  }, { passive: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { pointerFieldDirty = true; Motion.wake(); });
  container.addEventListener('transitionend', (e) => {
    if (e.target !== container || e.propertyName !== 'transform') return;
    pointerFieldDirty = true;
    Motion.wake();
  });

  document.addEventListener('pointerleave', () => {
    px = -9999; py = -9999;
    hasPointer = false;
    Motion.wake();
  });

  window.addEventListener('blur', () => {
    px = -9999; py = -9999;
    hasPointer = false;
    Motion.wake();
  });

  document.addEventListener('pointerout', (e) => {
    if (e.relatedTarget === null) {
      px = -9999; py = -9999;
      hasPointer = false;
      Motion.wake();
    }
  });

  window.addEventListener('resize', () => { REVEAL_RADIUS = Math.max(150, Math.min(260, window.innerWidth * 0.22)); pointerFieldDirty = true; Motion.wake(); }, { passive: true });
  window.addEventListener('scroll', (e) => {
    const tgt = e.target;
    if (tgt && tgt !== document && paletteEl && paletteEl.contains(tgt)) return;
    pointerFieldDirty = true;
    Motion.wake();
  }, { passive: true, capture: true });
  if (typeof ResizeObserver === 'function') {
    const gridResizeObserver = new ResizeObserver(() => { pointerFieldDirty = true; Motion.wake(); });
    gridResizeObserver.observe(grid);
  }

  measure();
  Motion.add(subscriber);
};

export const initMagneticControls = () => {
  const pill = document.querySelector('.controls-pill');
  if (!pill) return;
  if (!MQ.hoverFine) return;
  if (MQ.reducedMotion) return;

  const FIELD = 40, MAX_PULL = 6;
  const paletteEl = document.getElementById('lx-palette');
  let buttons = [];
  let px = -9999, py = -9999;
  let dirty = true;
  let pillRect = null;

  const measure = () => {
    pillRect = pill.getBoundingClientRect();
    buttons = Array.from(pill.querySelectorAll('button')).map(btn => {
      if (!btn._mag) {
        btn._mag = { x: spring(0.22, 1.0, MAX_PULL, true), y: spring(0.22, 1.0, MAX_PULL, true), s: spring(0.22, 1.0, 0.06) };
        btn._mag.s.v = 1; btn._mag.s.to = 1;
        btn.addEventListener('pointerenter', () => { btn._mag.s.to = 1.06; Motion.wake(); });
        btn.addEventListener('pointerleave', () => { btn._mag.s.to = 1; Motion.wake(); });
      }
      const r = btn.getBoundingClientRect();
      return { btn, cx: r.left + r.width / 2, cy: r.top + r.height / 2, m: btn._mag };
    });
    dirty = false;
  };

  const subscriber = {
    fixed(dt) {
      if (dirty) measure();
      buttons.forEach(({ cx, cy, m }) => {
        const d = Math.hypot(px - cx, py - cy);
        if (d < FIELD) {
          const pull = (1 - d / FIELD) * MAX_PULL;
          const ang = Math.atan2(py - cy, px - cx);
          m.x.to = Math.cos(ang) * pull;
          m.y.to = Math.sin(ang) * pull;
        } else {
          m.x.to = 0; m.y.to = 0;
        }
        m.x.fixed(dt); m.y.fixed(dt); m.s.fixed(dt);
      });
    },
    render() {
      let alive = false;
      buttons.forEach(({ btn, m }) => {
        btn.style.translate = `${m.x.v.toFixed(2)}px ${m.y.v.toFixed(2)}px`;
        btn.style.scale = m.s.v.toFixed(3);
        if (!m.x.settled || !m.y.settled || !m.s.settled) alive = true;
      });
      return alive;
    }
  };

  window.addEventListener('resize', () => { dirty = true; Motion.wake(); }, { passive: true });
  window.addEventListener('scroll', () => { dirty = true; Motion.wake(); }, { passive: true, capture: true });
  if (typeof ResizeObserver === 'function') {
    const pillResizeObserver = new ResizeObserver(() => { dirty = true; Motion.wake(); });
    pillResizeObserver.observe(pill);
  }
  onPointerMove((e) => {
    if (paletteEl && paletteEl.open) {
      if (px !== -9999) { px = -9999; py = -9999; Motion.wake(); }
      return;
    }
    if (!pillRect || dirty) measure();
    const r = pillRect;
    const inField = e.clientX >= r.left - FIELD && e.clientX <= r.right + FIELD &&
                    e.clientY >= r.top - FIELD && e.clientY <= r.bottom + FIELD;
    if (inField) { px = e.clientX; py = e.clientY; Motion.wake(); }
    else if (px !== -9999) { px = -9999; py = -9999; Motion.wake(); }
  });
  pill.addEventListener('transitionend', (e) => {
    if (e.target !== pill || e.propertyName !== 'transform') return;
    dirty = true;
  });

  pill.classList.add('is-magnetic');
  measure();
  Motion.add(subscriber);
};
export const initBarGlow = () => {
  const bar = document.getElementById('lxBar');
  if (!bar) return;
  if (!MQ.hoverFine) return;

  let rect = null;
  let lit = false;
  const invalidate = () => { rect = null; };
  window.addEventListener('resize', invalidate, { passive: true });
  window.addEventListener('scroll', invalidate, { passive: true, capture: true });
  bar.addEventListener('transitionend', invalidate);
  bar.addEventListener('pointerenter', () => { rect = bar.getBoundingClientRect(); }, { passive: true });
  bar.addEventListener('pointermove', (e) => {
    if (!rect) rect = bar.getBoundingClientRect();
    bar.style.setProperty('--rx', `${e.clientX - rect.left}px`);
    bar.style.setProperty('--ry', `${e.clientY - rect.top}px`);
    if (!lit) { lit = true; bar.style.setProperty('--reveal-o', '0.9'); }
  }, { passive: true });
  bar.addEventListener('pointerleave', () => {
    lit = false;
    bar.style.setProperty('--reveal-o', '0');
  }, { passive: true });
};

scrollSettleHooks.push(() => { pointerFieldDirty = true; });

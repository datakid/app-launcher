import { LX_DEBUG } from './util.js';
import { MQ, animate } from './motion.js';

let idleTimer;
const IDLE_MS = 25000;

let cinemaAnim = null;
const CINEMA_PERIOD_S = 20 * Math.PI * 10;
const cinemaFrames = (() => {
  const frames = [];
  const steps = 480;
  for (let i = 0; i <= steps; i++) {
    const tt = (i / steps) * CINEMA_PERIOD_S;
    const x = 50 + Math.sin(tt * 0.08) * 22;
    const y = 15 + Math.cos(tt * 0.05) * 8;
    frames.push({ transform: `translate3d(${x.toFixed(2)}vw, ${y.toFixed(2)}vh, 0)` });
  }
  return frames;
})();

export const stopIdle = () => {
  if (!document.body.classList.contains('is-cinema')) return;
  document.body.classList.remove('is-cinema');
  if (cinemaAnim) {
    try { cinemaAnim.commitStyles(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    cinemaAnim.cancel();
    cinemaAnim = null;
  }
};

const startIdle = () => {
  const spot = document.getElementById('spotlight');
  if (!spot || document.hidden) return;
  spot.classList.remove('is-active', 'is-idle');
  document.body.classList.add('is-cinema');
  if (MQ.reducedMotion || typeof spot.animate !== 'function') return;
  cinemaAnim?.cancel();
  cinemaAnim = animate(spot, cinemaFrames, { duration: CINEMA_PERIOD_S * 1000, iterations: Infinity, easing: 'linear' });
};

let armIdleAt = 0;
const armIdle = () => {
  const now = performance.now();
  if (now - armIdleAt < 150) return;
  armIdleAt = now;
  clearTimeout(idleTimer);
  stopIdle();
  idleTimer = setTimeout(startIdle, IDLE_MS);
};

export const initIdle = () => {
  ['pointermove', 'keydown', 'wheel', 'touchstart'].forEach(evt =>
    document.addEventListener(evt, armIdle, { passive: true })
  );
  armIdle();
};

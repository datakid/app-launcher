import { LX_DEBUG } from './util.js';
import { Motion } from './motion.js';

export const initDebugOverlay = () => {
  if (!LX_DEBUG) return;

  const box = document.createElement('div');
  box.setAttribute('aria-hidden', 'true');
  box.style.cssText = 'position:fixed;bottom:8px;inset-inline-start:8px;z-index:99999;' +
    'background:rgba(0,0,0,.82);color:#5eff8f;font:11px/1.6 ui-monospace,monospace;' +
    'padding:8px 10px;border-radius:8px;pointer-events:none;white-space:pre;';
  document.body.appendChild(box);

  let frames = 0, fps = 0, lastFpsAt = performance.now();
  let longTaskCount = 0;

  if ('PerformanceObserver' in window) {
    try {
      new PerformanceObserver((list) => { longTaskCount += list.getEntries().length; })
        .observe({ type: 'longtask', buffered: true });
    } catch (e) { if (LX_DEBUG) console.warn(e); }
  }

  const tick = () => {
    frames++;
    const now = performance.now();
    if (now - lastFpsAt >= 500) {
      fps = Math.round((frames * 1000) / (now - lastFpsAt));
      frames = 0;
      lastFpsAt = now;
    }
    const liveCards = document.querySelectorAll('.app-card').length;
    const refCards = window.__lxDebugPointerFieldCount ?? 0;
    box.textContent =
      `FPS: ${fps}\n` +
      `Motion: ${Motion.awake ? 'awake' : 'asleep'} (${Motion.subCount} subs)\n` +
      `Cards: ${liveCards} live / ${refCards} tracked\n` +
      `Long tasks: ${longTaskCount}`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

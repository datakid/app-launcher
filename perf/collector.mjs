export const collectorInit = () => {
  if (window.__perf) return;
  const P = (window.__perf = { entries: [], loaf: [] });
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) P.entries.push({ name: e.name, startTime: e.startTime, duration: e.duration });
    }).observe({ type: 'event', durationThreshold: 16, buffered: true });
  } catch (e) {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) P.loaf.push({ startTime: e.startTime, duration: e.duration });
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch (e) {}
  const DECOR = '.badge-dot, .spotlight, h1';
  const GRID = '#appGrid, .grid-ghost';
  P.running = (mode) => document.getAnimations().filter((a) => {
    if (a.playState !== 'running') return false;
    if (mode) {
      const t = a.effect && a.effect.target;
      const el = t && t.closest ? t : null;
      if (mode === 'grid') { if (!el || !el.closest(GRID) || el.closest(DECOR)) return false; }
      else if (el && el.closest(DECOR)) return false;
    }
    if (a.timeline && a.timeline !== document.timeline) return false;
    const it = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().iterations : 1;
    return it !== Infinity;
  }).length;
  P.begin = (cfg) => new Promise((resolve) => {
    const frames = [];
    let inputT = null;
    let firstCard = null;
    let lastRunning = -1;
    const onInput = (e) => {
      if (inputT !== null) return;
      if (cfg.trigger.key && String(e.key || '').toLowerCase() !== cfg.trigger.key) return;
      inputT = e.timeStamp;
      firstCard = document.querySelector('#appGrid .app-card');
    };
    window.addEventListener(cfg.trigger.type, onInput, true);
    const finish = (windowEnd) => {
      window.removeEventListener(cfg.trigger.type, onInput, true);
      let resources = [];
      try {
        resources = performance.getEntriesByType('resource').map((r) => ({ name: r.name, initiatorType: r.initiatorType, startTime: r.startTime }));
      } catch (e) {}
      if (inputT !== null) {
        try {
          performance.mark('lx-in', { startTime: inputT });
          performance.mark('lx-out', { startTime: windowEnd });
        } catch (e) {}
      }
      resolve({ inputT, windowEnd, frames, resources, events: P.entries.slice(), loaf: P.loaf.slice() });
    };
    const tick = (ts) => {
      const running = P.running();
      const c = document.querySelector('#appGrid .app-card');
      const op = c ? parseFloat(getComputedStyle(c).opacity) : null;
      frames.push({ t: ts, running, core: P.running(true), grid: P.running('grid'), op, same: inputT === null ? true : c === firstCard });
      if (inputT !== null) {
        if (running > 0) lastRunning = ts;
        const since = ts - inputT;
        if (cfg.mode === 'fixed') {
          if (since >= cfg.fixedMs) return finish(ts);
        } else if (since >= cfg.maxMs || (lastRunning >= 0 ? ts - lastRunning >= 160 : since >= 320)) {
          return finish(ts);
        }
      } else if (ts > cfg.startTimeoutAt) {
        return finish(ts);
      }
      requestAnimationFrame(tick);
    };
    cfg.startTimeoutAt = performance.now() + 8000;
    requestAnimationFrame(tick);
  });
};

export const idleScript = () => window.__perf.running() === 0;

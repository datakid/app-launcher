import { viewMode } from '../theme.js';

export const initGridKeyboardNav = () => {
  const appGrid = document.getElementById('appGrid');
  appGrid.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const from = e.target.closest && e.target.closest('.app-card');
    if (!from || e.target.closest('.variant-chips')) return;
    const cards = [...appGrid.querySelectorAll('.app-card')];
    if (!cards.length) return;
    if (viewMode() === 'list' && e.key.startsWith('Arrow')) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const neighbour = cards[cards.indexOf(from) + (e.key === 'ArrowDown' ? 1 : -1)];
        if (neighbour) {
          e.preventDefault();
          neighbour.querySelector('.card-link-overlay')?.focus({ preventScroll: false });
        }
      }
      return;
    }
    let target = null;
    if (e.key === 'Home') target = cards[0];
    else if (e.key === 'End') target = cards[cards.length - 1];
    else {
      const rtl = document.documentElement.dir === 'rtl';
      const center = (c) => {
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      };
      const o = center(from);
      let vx = 0, vy = 0;
      if (e.key === 'ArrowLeft') vx = -1;
      if (e.key === 'ArrowRight') vx = 1;
      if (e.key === 'ArrowUp') vy = -1;
      if (e.key === 'ArrowDown') vy = 1;
      let best = Infinity;
      cards.forEach((c) => {
        if (c === from) return;
        const p = center(c);
        const dx = p.x - o.x, dy = p.y - o.y;
        const along = dx * vx + dy * vy;
        if (along <= 4) return;
        const across = Math.abs(dx * vy) + Math.abs(dy * vx);
        const score = along + across * 2.2;
        if (score < best) { best = score; target = c; }
      });
      if (!target && vx !== 0) {
        const idx = cards.indexOf(from);
        const step = (vx > 0) !== rtl ? 1 : -1;
        target = cards[idx + step] || null;
      }
    }
    if (!target) return;
    e.preventDefault();
    target.querySelector('.card-link-overlay')?.focus({ preventScroll: false });
  });
};

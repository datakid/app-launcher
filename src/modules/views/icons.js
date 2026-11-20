import { solveIconRows } from '../../icon-solver.js';
import { appGradient } from '../marks.js';
import { loc, t } from '../i18n.js';
import { createCard, isFresh } from '../card.js';
import { tone } from '../theme.js';
import { gridSwitch } from '../tabs.js';

const IC_MIN = 104;

export const iconItems = (cat) => cat.apps.map((app, i) => ({ app, idx: i, n: Array.isArray(app.variants) && app.variants.length > 1 ? app.variants.length : 1, el: null }));

export const centerIconRows = (rows, cols) => {
  rows.forEach((row) => {
    const used = row.reduce((sum, it) => sum + Math.min(it.n, cols), 0);
    const left = cols - used;
    const start = left > 0 ? Math.floor(left / 2) + 1 : 1;
    row.forEach((it, i) => {
      if (i === 0 && left > 0) it.el.style.setProperty('grid-column', `${start} / span ${Math.min(it.n, cols)}`, 'important');
      else it.el.style.removeProperty('grid-column');
      it.el.classList.toggle('ic-half', left > 0 && left % 2 === 1);
    });
  });
};

export const iconCols = (grid) => {
  const cs = getComputedStyle(grid);
  const w = grid.clientWidth - (parseFloat(cs.paddingInlineStart) || 0) - (parseFloat(cs.paddingInlineEnd) || 0);
  const min = parseFloat(cs.getPropertyValue('--ic-min')) || IC_MIN;
  return Math.max(4, Math.floor(w / min));
};

export const fitIconLabels = (grid) => {
  const labels = [...grid.querySelectorAll('.icon-label')];
  labels.forEach((l) => l.classList.remove('is-tight'));
  const tight = labels.filter((l) => {
    const lh = parseFloat(getComputedStyle(l).lineHeight) || 16;
    return l.getBoundingClientRect().height > lh * 2 + 1 || l.scrollWidth > l.clientWidth + 1;
  });
  tight.forEach((l) => l.classList.add('is-tight'));
};

export const buildIconPlate = (it, cat, isBootBatch) => {
  const { app, idx } = it;
  const plate = document.createElement('div');
  plate.className = 'icon-plate' + (app.closed ? ' is-closed' : '');
  plate.setAttribute('role', 'group');
  plate.setAttribute('aria-label', loc(app.title));
  plate.style.setProperty('--n', String(it.n));
  plate.style.setProperty('--c1', tone(appGradient(app)[0]));
  const cap = document.createElement('span');
  cap.className = 'icon-plate-cap';
  cap.setAttribute('aria-hidden', 'true');
  const capText = document.createElement('span');
  capText.className = 'icon-plate-cap-text';
  capText.textContent = loc(app.title);
  cap.appendChild(capText);
  if (app.closed) {
    const tag = document.createElement('span');
    tag.className = 'badge badge-closed icon-plate-tag';
    tag.textContent = t('badgeClosed');
    cap.appendChild(tag);
    plate.title = app.closedReason ? `${t('badgeClosed')} — ${loc(app.closedReason)}` : t('badgeClosed');
  }
  if (isFresh(app)) {
    const dot = document.createElement('i');
    dot.className = 'icon-new-dot';
    cap.appendChild(dot);
  }
  plate.appendChild(cap);
  app.variants.forEach((v, vi) => {
    const card = createCard(app, idx, null, cat, { variantIndex: vi });
    card.classList.add('no-enter');
    plate.appendChild(card);
  });
  if (isBootBatch) plate.classList.add('is-boot-card');
  return plate;
};

export const repackIcons = (grid) => {
  const items = grid._icItems;
  if (!items || grid.dataset.layout !== 'icons') return;
  if (gridSwitch) { grid._icDeferred = true; return; }
  const cols = iconCols(grid);
  if (cols === grid._icCols) return;
  grid._icCols = cols;
  grid.style.setProperty('--ic-cols', String(cols));
  grid.querySelectorAll('.app-card, .icon-plate').forEach((c) => c.classList.add('no-enter'));
  const active = document.activeElement;
  const keep = active && grid.contains(active) ? active : null;
  const frag = document.createDocumentFragment();
  const rows = solveIconRows(items, cols);
  centerIconRows(rows, cols);
  rows.flat().forEach((it) => frag.appendChild(it.el));
  grid.appendChild(frag);
  if (keep) keep.focus({ preventScroll: true });
  fitIconLabels(grid);
};

let iconsResizeRaf = 0;
const iconsResizeTargets = new Set();
export const iconsRO = typeof ResizeObserver === 'function' ? new ResizeObserver((entries) => {
  entries.forEach((e) => iconsResizeTargets.add(e.target));
  cancelAnimationFrame(iconsResizeRaf);
  iconsResizeRaf = requestAnimationFrame(() => {
    iconsResizeTargets.forEach((g) => repackIcons(g));
    iconsResizeTargets.clear();
  });
}) : null;

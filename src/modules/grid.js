import { solveIconRows } from '../icon-solver.js';
import { escapeHtml } from './util.js';
import { categories } from './catalogue.js';
import { icon } from './marks.js';
import { lang, t } from './i18n.js';
import { MOTION, MQ } from './motion.js';
import { BentoSolver, LAYOUTS } from './views/bento.js';
import { createCard } from './card.js';
import { assignPointerFieldDirty } from './pointer-field.js';
import { lastInteractionPoint, railCenter } from './origin.js';
import { buildIconPlate, centerIconRows, fitIconLabels, iconCols, iconItems, iconsRO, repackIcons } from './views/icons.js';
import { viewMode } from './theme.js';
import { assignFirstCardBatchDone, firstCardBatchDone, isNarrowViewport, supportsViewTimeline } from './tabs.js';

const gridCache = new Map();
let gridDataVersion = 0;
export const invalidateGridCache = () => {
  gridDataVersion += 1;
  gridCache.clear();
  const grid = document.getElementById('appGrid');
  if (grid) grid._cacheKey = null;
};

const stashGrid = (grid) => {
  if (!grid._cacheKey) return;
  const entry = {
    fragment: document.createDocumentFragment(),
    columns: grid.style.gridTemplateColumns,
    rows: grid.style.gridTemplateRows,
    layout: grid.dataset.layout,
    rowCount: grid.dataset.rows,
    classes: ['is-auto-flow', 'has-overflow', 'at-bottom'].filter(c => grid.classList.contains(c)),
    items: grid._icItems,
    iconCols: grid._icCols,
    iconColumns: grid.style.getPropertyValue('--ic-cols'),
    scrollTop: grid.scrollTop,
    scrollLeft: grid.scrollLeft
  };
  while (grid.firstChild) entry.fragment.appendChild(grid.firstChild);
  gridCache.set(grid._cacheKey, entry);
};

export const renderCards = (grid, categoryId, { useCache = false } = {}) => {
  const cat = categories.find(c => c.id === categoryId);
  if (!cat) return false;
  if (!useCache) invalidateGridCache();
  const key = `${categoryId}|${lang}|${viewMode()}|${gridDataVersion}`;
  const hadFocusInGrid = grid.contains(document.activeElement) && document.activeElement !== grid;
  const cached = gridCache.get(key);
  grid._cacheHit = !!cached;
  if (iconsRO) iconsRO.unobserve(grid);
  stashGrid(grid);
  grid._cacheKey = key;
  if (cached) {
    grid.replaceChildren(cached.fragment);
    gridCache.delete(key);
    grid.style.gridTemplateColumns = cached.columns;
    grid.style.gridTemplateRows = cached.rows;
    if (cached.layout === undefined) delete grid.dataset.layout;
    else grid.dataset.layout = cached.layout;
    if (cached.rowCount === undefined) delete grid.dataset.rows;
    else grid.dataset.rows = cached.rowCount;
    ['is-auto-flow', 'has-overflow', 'at-bottom'].forEach(c => grid.classList.toggle(c, cached.classes.includes(c)));
    grid._icItems = cached.items;
    grid._icCols = cached.iconCols;
    grid._icDeferred = false;
    if (cached.iconColumns) grid.style.setProperty('--ic-cols', cached.iconColumns);
    else grid.style.removeProperty('--ic-cols');
    grid.querySelectorAll('.app-card, .icon-plate').forEach(c => {
      c.classList.add('no-enter');
      c.classList.remove('is-boot-card', 'is-tracking', 'is-live', 'is-hot', 'is-kb-focus', 'is-ring');
      c._pressed = false;
      c._wc = false;
      c._hot = false;
      c.style.willChange = '';
      c.style.transform = '';
      c.style.opacity = '';
      c.style.setProperty('--tx', '0');
      c.style.setProperty('--ty', '0');
      c.style.setProperty('--hov', '0');
      c._last = {};
      if (c._springs) Object.entries(c._springs).forEach(([name, s]) => { s.to = name === 'sc' ? 1 : 0; s.snap(); });
    });
    if (grid._icItems) {
      repackIcons(grid);
      fitIconLabels(grid);
      if (iconsRO) iconsRO.observe(grid);
    }
    grid.scrollTop = cached.scrollTop;
    grid.scrollLeft = cached.scrollLeft;
    assignPointerFieldDirty(true);
    if (hadFocusInGrid) (grid.querySelector('.card-link-overlay') || document.getElementById(`tab-${categoryId}`))?.focus({ preventScroll: true });
    return false;
  }
  grid._icDeferred = false;
  grid.classList.remove('has-overflow', 'at-bottom');

  if (!cat.apps.length) {
    grid.classList.remove('is-auto-flow');
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = '';
    delete grid.dataset.layout;
    delete grid.dataset.rows;
    grid._icItems = null;
    grid._icCols = undefined;
    grid.style.removeProperty('--ic-cols');
    grid.innerHTML = `<div class="grid-empty">${icon('fa-box-open')}<span>${escapeHtml(t('emptyCategory'))}</span></div>`;
    assignPointerFieldDirty(true);
    if (hadFocusInGrid) document.getElementById(`tab-${categoryId}`)?.focus({ preventScroll: true });
    return false;
  }

  const n = cat.apps.length;
  const listView = viewMode() === 'list';
  const iconsView = viewMode() === 'icons';
  const curated = listView || iconsView ? null : LAYOUTS[n];
  const generated = curated || listView || iconsView ? null : BentoSolver.generate(n);

  grid.classList.toggle('is-auto-flow', !listView && !iconsView && !curated && !generated);
  if (listView) grid.dataset.layout = 'list';
  else if (iconsView) grid.dataset.layout = 'icons';
  else delete grid.dataset.layout;

  if (generated) grid.dataset.rows = String(generated.rows);
  else delete grid.dataset.rows;

  if (curated) {
    grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
    grid.style.gridTemplateRows = 'repeat(3, 1fr)';
  } else if (generated) {
    grid.style.gridTemplateColumns = `repeat(${BentoSolver.COLS}, 1fr)`;
    grid.style.gridTemplateRows = `repeat(${generated.rows}, 1fr)`;
  } else {
    grid.style.gridTemplateColumns = '';
    grid.style.gridTemplateRows = '';
  }

  const frag = document.createDocumentFragment();
  const isBootBatch = !firstCardBatchDone;
  if (iconsView) {
    const cols = iconCols(grid);
    grid.style.setProperty('--ic-cols', String(cols));
    const entries = iconItems(cat);
    entries.forEach((it) => {
      if (it.n > 1) {
        it.el = buildIconPlate(it, cat, isBootBatch);
      } else {
        it.el = createCard(it.app, it.idx, null, cat);
        if (isBootBatch) it.el.classList.add('is-boot-card');
      }
    });
    grid._icItems = entries;
    grid._icCols = cols;
    const rows = solveIconRows(entries, cols);
    centerIconRows(rows, cols);
    rows.flat().forEach((it) => frag.appendChild(it.el));
    if (iconsRO) iconsRO.observe(grid);
  } else {
    grid._icItems = null;
    grid.style.removeProperty('--ic-cols');
  }
  if (!iconsView) cat.apps.forEach((app, i) => {
    let placement = null;
    if (curated) {
      const track = curated[i];
      placement = { type: 'explicit', col: track[0], row: track[1] };
    } else if (generated) {
      const item = generated.items[i];
      placement = { type: 'span', col: item.col, row: item.row, rowIndex: item.rowIndex };
    }
    const card = createCard(app, i, placement, cat);
    if (isBootBatch) card.classList.add('is-boot-card');
    if (!curated && !generated && !listView && !iconsView && i === 0) card.classList.add('card-wide');
    frag.appendChild(card);
  });
  grid.innerHTML = '';
  grid.appendChild(frag);
  if (iconsView) fitIconLabels(grid);
  assignFirstCardBatchDone(true);
  assignPointerFieldDirty(true);
  if (hadFocusInGrid) grid.querySelector('.card-link-overlay')?.focus({ preventScroll: true });
  return isBootBatch;
};

export const staggerDelay = (kind, dist, max) => {
  if (kind === 'boot') return MOTION.boot.offset + Math.round((dist / max) * MOTION.boot.spread);
  const m = MOTION[kind];
  return m && m.stagger ? Math.round((dist / max) * m.stagger) : 0;
};

export const gridUnits = (grid) => [...grid.querySelectorAll(':scope > .app-card, :scope > .icon-plate, :scope > .grid-empty')];

export const cardDistances = (cards) => {
  const origin = lastInteractionPoint ?? railCenter();
  let max = 1;
  const dists = cards.map((c) => {
    const r = c.getBoundingClientRect();
    const d = Math.hypot(r.left + r.width / 2 - origin.x, r.top + r.height / 2 - origin.y);
    max = Math.max(max, d);
    return d;
  });
  return { dists, max };
};

export const staggerCardEntry = (grid, isBootBatch) => {
  if (grid._cacheHit) return;
  const cards = gridUnits(grid);
  const skipEntryAnim = MQ.reducedMotion;
  const isAutoFlow = grid.classList.contains('is-auto-flow');
  const scrollDriven = supportsViewTimeline && isNarrowViewport();

  const overflowAmount = isAutoFlow ? grid.scrollHeight - grid.clientHeight : 0;
  const { dists, max } = isBootBatch ? cardDistances(cards) : { dists: [], max: 1 };

  if (isAutoFlow) grid.classList.toggle('has-overflow', overflowAmount > 4);
  cards.forEach((c, i) => {
    c.style.animationDelay = scrollDriven ? '0s' : `${isBootBatch ? staggerDelay('boot', dists[i], max) : 0}ms`;
    if (!skipEntryAnim) {
      c.style.willChange = 'transform, opacity';
      c.addEventListener('animationend', () => { c.style.willChange = ''; }, { once: true });
    }
  });
};

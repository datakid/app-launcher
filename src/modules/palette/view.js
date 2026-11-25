import { TIER, search } from '../../search.js';
import { LX_DEBUG, copyToClipboard, escapeHtml } from '../util.js';
import { categories, fmt, isPaletteOnly } from '../catalogue.js';
import { sfx } from '../audio.js';
import { DEFAULT_ICON, appGradient, icon, markHtml, retileIcon, setIcon, wrapOpen } from '../marks.js';
import { scheduleWarmActiveEntry } from '../warm.js';
import { STRINGS, lang, loc, t } from '../i18n.js';
import { openInNewTab, openInSameTab, openMode, openModeAction, otherOpenMode } from '../open.js';
import { bumpFreq, getFreqMap, getRecentEntries, pushRecent, recentScores } from '../store.js';
import { EASE_ACCEL, EASE_LUX, MOTION, MQ, animate, motionMs } from '../motion.js';
import { gradVars, isFresh } from '../card.js';
import { closeContextMenu } from '../context-menu.js';
import { tone } from '../theme.js';
import { activateTab, activeViewTransition, assignActiveViewTransition, currentTabId } from '../tabs.js';
import { allPaletteEntries, highlightTitle, normMap, normalizeAr, paletteSearchIndex, searchCommands } from './query.js';
import { commandEntries, keycapsHtml, runCommand } from './commands.js';
import { openQrFromPalette } from '../qr-dialog.js';

export let paletteItems = [];
export let paletteActiveIndex = -1;
let paletteActionIndex = 0;
let paletteZone = 'list';
let paletteTryPicks = null;

let paletteEntranceArmed = false;

let lastDetailKey = null;
export const assignLastDetailKey = (v) => (lastDetailKey = v);
let paletteSkipCloseChime = false;
export const assignPaletteSkipCloseChime = (v) => (paletteSkipCloseChime = v);
export let paletteBusy = false;
let heroReturnFocus = false;
export const assignHeroReturnFocus = (v) => (heroReturnFocus = v);
let heroRestBox = null;

export const syncHeroRestBox = () => {
  const dialog = document.getElementById('lx-palette');
  if (dialog && dialog.open) return;
  const hero = document.getElementById('lxBarSearch');
  if (hero) heroRestBox = hero.getBoundingClientRect();
};

const getActionsForEntry = (entry) => {
  if (entry && entry.app.command) return [{ id: 'run', icon: 'fa-bolt', label: t('actionRun'), kbd: 'Enter' }];
  const newTab = { id: 'new-tab', icon: 'fa-arrow-up-right-from-square', label: t('actionNewTab') };
  const sameTab = { id: 'same-tab', icon: 'fa-arrow-right-to-bracket', label: t('actionSameTab') };
  const [primary, secondary] = openMode() === 'same' ? [sameTab, newTab] : [newTab, sameTab];
  const actions = [
    { ...primary, kbd: 'Enter' },
    { ...secondary, kbd: 'Shift+Enter' },
    { id: 'copy-link', icon: 'fa-copy', label: t('actionCopyLink'), kbd: 'Ctrl/Cmd+Enter' },
    { id: 'copy-title', icon: 'fa-font', label: t('actionCopyTitle'), kbd: '' },
    { id: 'qr', icon: 'fa-qrcode', label: t('actionQr'), kbd: 'Alt+Q' }
  ];
  if (entry && !isPaletteOnly(entry.cat)) {
    actions.push({ id: 'reveal', icon: 'fa-crosshairs', label: t('actionReveal'), kbd: '' });
  }
  return actions;
};
let paletteCmdMode = false;

const updatePaletteMode = (isCmd) => {
  const el = document.getElementById('paletteMode');
  if (el && el.hidden === isCmd) el.hidden = !isCmd;
  document.getElementById('lx-palette')?.classList.toggle('is-command-mode', isCmd);
  const input = document.getElementById('paletteInput');
  if (input) input.setAttribute('placeholder', t(isCmd ? 'cmdPlaceholder' : 'searchPlaceholder'));
};

const syncPaletteCursor = (instant = false) => {
  const list = document.getElementById('paletteResults');
  if (!list) return;
  let cursor = list.querySelector(':scope > .palette-cursor');
  if (!cursor) {
    cursor = document.createElement('li');
    cursor.className = 'palette-cursor';
    cursor.setAttribute('role', 'presentation');
    cursor.setAttribute('aria-hidden', 'true');
    list.prepend(cursor);
    instant = true;
  }
  const entry = paletteItems[paletteActiveIndex];
  const li = entry ? document.getElementById('palette-item-' + sanitizeDomId(paletteEntryKey(entry))) : null;
  if (!li) { cursor.classList.remove('is-visible'); return; }
  const h = li.offsetHeight;
  if (!h) return;
  const y = li.offsetTop;
  cursor.classList.toggle('is-dimmed', paletteZone === 'actions');
  if (cursor.classList.contains('is-visible') && cursor.dataset.y === String(y) && cursor.dataset.h === String(h)) return;
  const snap = instant || !cursor.classList.contains('is-visible');
  if (snap) cursor.classList.add('is-snapping');
  cursor.dataset.y = String(y);
  cursor.dataset.h = String(h);
  cursor.style.transform = `translate3d(0, ${y}px, 0)`;
  cursor.style.height = `${h}px`;
  cursor.classList.add('is-visible');
  if (snap) {
    void cursor.offsetHeight;
    cursor.classList.remove('is-snapping');
  }
};

const paletteRowObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => syncPaletteCursor(true)) : null;
let paletteRenderKey = null;
const paletteEntryKey = (e) => e.app.id;

const sanitizeDomId = (key) => String(key).replace(/[^a-zA-Z0-9_-]/g, '-');

const paletteTrailHtml = (e) => e.app.command && e.app.kbd ? keycapsHtml(e.app.kbd) : '<kbd>↵</kbd>';
const paletteTrailClass = (e) => 'palette-item-trail' + (e.app.command && e.app.kbd ? ' is-persistent' : '');

const markRanges = (text, ranges, offset = 0) => {
  let out = '';
  let pos = 0;
  for (const [from, to] of ranges) {
    const a = from + offset;
    const b = to + offset;
    if (a < pos || b > text.length || b <= a) continue;
    out += `${escapeHtml(text.slice(pos, a))}<mark>${escapeHtml(text.slice(a, b))}</mark>`;
    pos = b;
  }
  return out + escapeHtml(text.slice(pos));
};

const paletteTitleHtml = (e, query) => {
  const title = loc(e.app.title);
  const h = e.hit;
  if (h && h.ranges.length) {
    let offset = -1;
    if (h.field === 'title' && h.text === title) offset = 0;
    else if (h.field === 'parent' && e.app.parentTitle && h.text === loc(e.app.parentTitle) && title.startsWith(h.text)) offset = 0;
    else if (h.field === 'variant' && e.app.variantLabel && h.text === loc(e.app.variantLabel) && title.endsWith(h.text)) offset = title.length - h.text.length;
    if (offset >= 0) return markRanges(title, h.ranges, offset);
  }
  return highlightTitle(title, query);
};

const VIA_PROSE = new Set(['status', 'badge']);
const VIA_FIELDS = new Set(['host', 'url', 'id', 'icon', 'acronym', 'status', 'badge']);

const paletteCatHtml = (e) => {
  const label = escapeHtml(loc(e.cat.label));
  const h = e.hit;
  if (!h || !h.text || !VIA_FIELDS.has(h.field)) return label;
  return `${label} · <span class="palette-item-via${VIA_PROSE.has(h.field) ? ' is-prose' : ''}">${markRanges(h.text, h.ranges)}</span>`;
};

const paletteItemContentHtml = (e, query) => `${wrapOpen(e.app, null)}${markHtml(e.app, null, e.app.icon, 'app-icon')}</div><div class="palette-item-text"><span class="palette-item-title">${paletteTitleHtml(e, query)}</span><span class="palette-item-cat">${paletteCatHtml(e)}</span></div><span class="${paletteTrailClass(e)}" aria-hidden="true">${paletteTrailHtml(e)}</span><button type="button" class="palette-qr" tabindex="-1" aria-label="${escapeHtml(t('ctxQr'))}"${e.app.command ? ' hidden' : ''}>${icon('fa-qrcode')}<span aria-hidden="true">QR</span></button>`;

const buildPaletteItemNode = (e, globalIndex, query, isActive) => {
  const li = document.createElement('li');
  li.className = 'palette-item' + (isActive ? ' is-active' : '');
  li.setAttribute('role', 'option');
  li.id = 'palette-item-' + sanitizeDomId(paletteEntryKey(e));
  li.setAttribute('aria-selected', String(isActive));
  li.dataset.key = paletteEntryKey(e);
  li.dataset.index = String(globalIndex);
  li.setAttribute('style', `${gradVars(appGradient(e.app))}--n:${globalIndex};`);
  li.innerHTML = paletteItemContentHtml(e, query);
  paletteRowObserver?.observe(li);
  return li;
};

const updatePaletteItemNode = (li, e, globalIndex, query, isActive) => {
  li.classList.toggle('is-active', isActive);
  li.setAttribute('aria-selected', String(isActive));
  li.dataset.index = String(globalIndex);
  li.style.setProperty('--n', globalIndex);
  if (e.app.gradient) li.style.setProperty('--c1', tone(appGradient(e.app)[0]));
  const tileEl = li.querySelector('.app-icon-wrapper');
  if (tileEl) retileIcon(tileEl, e.app, null, e.app.icon);
  const titleEl = li.querySelector('.palette-item-title');
  if (titleEl) titleEl.innerHTML = paletteTitleHtml(e, query);
  const catEl = li.querySelector('.palette-item-cat');
  if (catEl) catEl.innerHTML = paletteCatHtml(e);
  const qrEl = li.querySelector('.palette-qr');
  if (qrEl) {
    qrEl.hidden = !!e.app.command;
    qrEl.setAttribute('aria-label', t('ctxQr'));
  }
  const trailEl = li.querySelector('.palette-item-trail');
  if (trailEl) {
    trailEl.className = paletteTrailClass(e);
    trailEl.innerHTML = paletteTrailHtml(e);
  }
};

const buildPaletteHeaderNode = (text) => {
  const li = document.createElement('li');
  li.className = 'palette-group-header';
  li.setAttribute('role', 'presentation');
  li.textContent = text;
  return li;
};

export let paletteScope = 'all';
export const assignPaletteScope = (v) => (paletteScope = v);
let paletteScopesKey = '';
export const assignPaletteScopesKey = (v) => (paletteScopesKey = v);

export const scopeList = () => [{ id: 'all', label: STRINGS.scopeAll, accent: '#7c9bff', icon: 'fa-layer-group' }, ...categories];

const renderPaletteScopes = (counts, isCmd) => {
  const host = document.getElementById('paletteScopes');
  if (!host) return;
  host.hidden = isCmd || categories.length < 2;
  if (host.hidden) return;
  const list = scopeList();
  const key = `${lang}|${list.map(s => s.id).join(',')}`;
  if (key !== paletteScopesKey) {
    paletteScopesKey = key;
    host.querySelectorAll('.palette-scope').forEach(b => b.remove());
    list.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'palette-scope';
      b.dataset.scope = s.id;
      b.setAttribute('role', 'radio');
      b.tabIndex = -1;
      b.style.setProperty('--scope-accent', tone(s.accent || '#7c9bff'));
      b.innerHTML = `${s.id === 'all' ? '' : icon(s.icon)}<span class="palette-scope-label">${escapeHtml(loc(s.label))}</span><span class="palette-scope-count"></span>`;
      b.addEventListener('click', () => setPaletteScope(s.id));
      host.appendChild(b);
    });
  }
  host.querySelectorAll('.palette-scope').forEach((b) => {
    const on = b.dataset.scope === paletteScope;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
    const n = counts[b.dataset.scope] || 0;
    const countEl = b.querySelector('.palette-scope-count');
    if (countEl.textContent !== String(n)) countEl.textContent = String(n);
    b.classList.toggle('is-empty', !n);
  });
  requestAnimationFrame(syncScopeIndicator);
};

export const syncScopeIndicator = () => {
  const host = document.getElementById('paletteScopes');
  const ind = host?.querySelector('.palette-scope-indicator');
  const active = host?.querySelector('.palette-scope.is-active');
  if (!ind || !active) return;
  const first = !ind.classList.contains('is-ready');
  if (first) ind.style.transition = 'none';
  ind.style.width = `${active.offsetWidth}px`;
  ind.style.transform = `translate3d(${active.offsetLeft}px, 0, 0)`;
  ind.style.setProperty('--scope-accent', active.style.getPropertyValue('--scope-accent'));
  if (first) { void ind.offsetWidth; ind.style.transition = ''; ind.classList.add('is-ready'); }
};

const setPaletteScope = (id) => {
  if (id === paletteScope) return;
  paletteScope = id;
  sfx.tick(scopeList().findIndex(s => s.id === id));
  const input = document.getElementById('paletteInput');
  renderPaletteResults(input ? input.value : '');
  input?.focus({ preventScroll: true });
};

const cyclePaletteScope = (step) => {
  const list = scopeList();
  const i = Math.max(0, list.findIndex(s => s.id === paletteScope));
  setPaletteScope(list[(i + step + list.length) % list.length].id);
};

export const renderPaletteResults = (rawQuery) => {
  const paletteResults = document.getElementById('paletteResults');
  const isCmd = paletteCmdMode;
  const query = isCmd ? rawQuery.trim() : rawQuery;
  if (paletteScope !== 'all' && !categories.some(c => c.id === paletteScope)) paletteScope = 'all';
  const everyEntry = allPaletteEntries();
  const scopeCounts = { all: 0 };
  const scoped = paletteScope !== 'all';
  const scored = [];
  if (!isCmd) {
    const hits = search(paletteSearchIndex(), query, { currentTabId, recents: query.trim() ? recentScores() : null });
    hits.forEach((h) => {
      const e = everyEntry[h.index];
      scopeCounts.all++;
      scopeCounts[e.cat.id] = (scopeCounts[e.cat.id] || 0) + 1;
      if (!scoped || e.cat.id === paletteScope) scored.push({ app: e.app, cat: e.cat, score: h.score, hit: h });
    });
  }
  const allEntries = scoped ? everyEntry.filter(e => e.cat.id === paletteScope) : everyEntry;
  const commands = commandEntries();
  const rankCommands = (q) => searchCommands(commands, q);
  const cmdHits = !isCmd && !scoped && query.trim().length >= 2
    ? rankCommands(query).filter(e => e.hit.tier >= TIER.subsequence).slice(0, 3)
    : [];

  const prevActiveEntry = paletteItems[paletteActiveIndex];
  const prevActiveKey = prevActiveEntry ? paletteEntryKey(prevActiveEntry) : null;

  const rows = [];

  if (isCmd) {
    paletteTryPicks = null;
    paletteItems = query ? rankCommands(query) : commands;
    if (paletteItems.length) rows.push({ type: 'header', text: t('commandsGroup') });
    paletteItems.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
  } else if (!query && !scored.length) {
    paletteItems = [];
  } else if (!query) {
    paletteTryPicks = null;
    const recents = scoped ? [] : getRecentEntries(allEntries, 5);
    const recentIds = new Set(recents.map(e => e.app.id));
    const rest = scored.filter(e => !recentIds.has(e.app.id));
    paletteItems = [...recents, ...rest];
    if (recents.length) {
      rows.push({ type: 'header', text: t('recentGroup') });
      recents.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
      rows.push({ type: 'header', text: t('allGroup') });
      rest.forEach((e, i) => rows.push({ type: 'item', entry: e, index: recents.length + i }));
    } else {
      rest.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
    }
  } else if (scored.length || cmdHits.length) {
    paletteTryPicks = null;
    paletteItems = [...scored, ...cmdHits];
    scored.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
    if (cmdHits.length) {
      rows.push({ type: 'header', text: t('commandsGroup') });
      cmdHits.forEach((e, i) => rows.push({ type: 'item', entry: e, index: scored.length + i }));
    }
  } else {
    if (!paletteTryPicks) {
      const pool = allEntries.filter(e => !isPaletteOnly(e.cat));
      const picks = [];
      const used = new Set();
      while (picks.length < Math.min(3, pool.length)) {
        const idx = Math.floor(Math.random() * pool.length);
        if (used.has(idx)) continue;
        used.add(idx);
        picks.push(pool[idx]);
      }
      paletteTryPicks = picks;
    }
    paletteItems = paletteTryPicks;
    rows.push({ type: 'header', text: t('tryGroup') });
    paletteTryPicks.forEach((e, i) => rows.push({ type: 'item', entry: e, index: i }));
  }

  const renderKey = `${isCmd ? 1 : 0}\u0001${paletteScope}\u0001${query}`;
  const sameView = renderKey === paletteRenderKey;
  paletteRenderKey = renderKey;
  let newActiveIndex = sameView && prevActiveKey ? paletteItems.findIndex(e => paletteEntryKey(e) === prevActiveKey) : -1;
  if (newActiveIndex === -1) newActiveIndex = paletteItems.length ? 0 : -1;
  paletteActiveIndex = newActiveIndex;
  paletteActionIndex = 0;
  paletteZone = 'list';

  paletteResults.classList.toggle('entrance-armed', paletteEntranceArmed);
  paletteEntranceArmed = false;

  if (!sameView) paletteResults.scrollTop = 0;

  if (!rows.length) {
    paletteRowObserver?.disconnect();
    paletteResults.innerHTML = `<li class="palette-empty">${escapeHtml(t('noResults'))}</li>`;
  } else {
    const pool = new Map();
    paletteResults.querySelectorAll('.palette-item').forEach(li => pool.set(li.dataset.key, li));
    paletteResults.querySelectorAll('.palette-group-header, .palette-empty').forEach(el => el.remove());

    const usedKeys = new Set();
    rows.forEach(row => {
      if (row.type === 'header') {
        paletteResults.appendChild(buildPaletteHeaderNode(row.text));
        return;
      }
      const key = paletteEntryKey(row.entry);
      const isActive = row.index === paletteActiveIndex;
      let li = pool.get(key);
      if (li) {
        updatePaletteItemNode(li, row.entry, row.index, query, isActive);
      } else {
        li = buildPaletteItemNode(row.entry, row.index, query, isActive);
      }
      usedKeys.add(key);
      paletteResults.appendChild(li);
    });
    pool.forEach((li, key) => {
      if (usedKeys.has(key)) return;
      paletteRowObserver?.unobserve(li);
      li.remove();
    });
  }

  updateActiveDescendant();
  updateLiveAccent();
  renderPaletteDetail();
  updatePaletteGhost(isCmd ? '' : query);
  updatePaletteStatus(query, isCmd ? paletteItems.length : scored.length + cmdHits.length, isCmd);
  updatePaletteMode(isCmd);
  renderPaletteScopes(scopeCounts, isCmd);
  syncPaletteCursor(!sameView);
  scheduleWarmActiveEntry();
};

let paletteGhostTail = '';

const updatePaletteGhost = (query) => {
  const ghostEl = document.getElementById('paletteGhost');
  if (!ghostEl) return;
  const top = paletteItems[0];
  paletteGhostTail = '';
  if (query && top) {
    const title = loc(top.app.title);
    const nq = normalizeAr(query);
    const { out, map } = normMap(title);
    if (nq && out.startsWith(nq)) {
      paletteGhostTail = title.slice(nq.length < map.length ? map[nq.length] : title.length);
    }
  }
  ghostEl.innerHTML = paletteGhostTail
    ? `<span class="ghost-typed">${escapeHtml(query)}</span><span class="ghost-tail">${escapeHtml(paletteGhostTail)}</span>`
    : '';
};

let paletteStatusAnnounceTimer;
const updatePaletteStatus = (query, resultCount, isCmd = false) => {
  const statusEl = document.getElementById('paletteStatus');
  if (!statusEl) return;
  const activeCat = categories.find(c => c.id === currentTabId);
  const scopeLabel = isCmd ? t('commandsGroup') : (activeCat ? loc(activeCat.label) : '');
  const text = query
    ? (resultCount ? `${resultCount} ${t('resultsCountLabel')}` : '')
    : scopeLabel;
  if (query && paletteGhostTail) {
    const arrow = document.documentElement.dir === 'rtl' ? '←' : '→';
    statusEl.innerHTML = `${escapeHtml(text)} <span class="palette-ghost-hint">${arrow}</span>`;
  } else {
    statusEl.textContent = text;
  }
  clearTimeout(paletteStatusAnnounceTimer);
  if (query) paletteStatusAnnounceTimer = setTimeout(() => announcePalette(text), 600);
};

export const setPaletteActive = (i, { scroll = true } = {}) => {
  paletteActiveIndex = i;
  paletteZone = 'list';
  paletteActionIndex = 0;
  document.querySelectorAll('#paletteResults .palette-item').forEach((li) => {
    const on = Number(li.dataset.index) === i;
    li.classList.toggle('is-active', on);
    li.setAttribute('aria-selected', String(on));
  });
  const activeEntry = paletteItems[i];
  if (activeEntry && scroll) {
    document.getElementById('palette-item-' + sanitizeDomId(paletteEntryKey(activeEntry)))?.scrollIntoView({ block: 'nearest' });
  }
  updateActiveDescendant();
  updateLiveAccent();
  renderPaletteDetail();
  syncPaletteCursor();
  scheduleWarmActiveEntry();
};

export const renderPaletteDetail = () => {
  const detail = document.getElementById('paletteDetail');
  const entry = paletteItems[paletteActiveIndex];
  const key = entry ? `${entry.app.id}::${lang}` : `::${lang}`;
  if (key === lastDetailKey) return;
  lastDetailKey = key;

  if (!entry) {
    detail.removeAttribute('style');
    detail.innerHTML = `
      <div class="palette-detail-empty">
        ${icon('fa-magnifying-glass')}
        <span>${escapeHtml(t('noResultsMatch'))}</span>
      </div>`;
    return;
  }

  const { app, cat } = entry;
  detail.setAttribute('style', gradVars(appGradient(app)));

  const actionsHtml = `
    <div class="palette-actions" role="group" aria-label="${escapeHtml(t('actionsLabel'))}">
      ${getActionsForEntry(entry).map((a, i) => `
        <button type="button" class="palette-action${i === 0 ? ' is-primary' : ''}" id="palette-action-${a.id}" data-action="${a.id}">
          <span class="palette-action-icon">${icon(a.icon)}</span>
          <span class="palette-action-label">${escapeHtml(a.label)}</span>
          ${a.kbd ? `<span class="palette-keys">${keycapsHtml(a.kbd)}</span>` : ''}
        </button>
      `).join('')}
    </div>`;
  const slabHtml = `
    <div class="palette-detail-slab">
      <div class="palette-detail-slab-noise"></div>
      ${icon(app.icon, 'palette-detail-watermark')}
    </div>`;
  const fact = (label, value, cls = '') => `<div class="palette-fact"><dt>${escapeHtml(label)}</dt><dd${cls ? ` class="${cls}"` : ''}>${value}</dd></div>`;

  if (app.command) {
    detail.innerHTML = `
      ${slabHtml}
      <div class="palette-detail-header">
        <div class="app-icon-wrapper">${icon(app.icon, 'app-icon')}</div>
        <div class="palette-detail-title-wrap">
          <span class="palette-detail-eyebrow">${escapeHtml(t('commandKind'))}</span>
          <h3 class="palette-detail-title">${escapeHtml(loc(app.title))}</h3>
        </div>
      </div>
      <dl class="palette-facts">${fact(t('factRun'), `<span class="palette-keys">${keycapsHtml('Enter')}</span>`)}${app.kbd ? fact(t('factShortcut'), `<span class="palette-keys">${keycapsHtml(app.kbd)}</span>`) : ''}</dl>
      ${actionsHtml}
    `;
    detail.querySelectorAll('.palette-action').forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        if (paletteZone !== 'actions') sfx.tick(4);
        paletteActionIndex = 0;
        paletteZone = 'actions';
        updateActionHighlight();
      });
      btn.addEventListener('click', () => executeAction('run'));
    });
    updateActionHighlight();
    return;
  }

  let badgesHtml = '';
  if (isFresh(app)) badgesHtml += `<span class="palette-detail-badge badge-new"><span class="badge-dot"></span>${escapeHtml(t('badgeNew'))}</span>`;
  if (app.closed) badgesHtml += `<span class="palette-detail-badge badge-closed"><span class="badge-dot"></span>${escapeHtml(t('badgeClosed'))}</span>`;
  if (app.variantBadge) badgesHtml += `<span class="palette-detail-badge badge-variant">${icon('fa-clone')}${escapeHtml(app.variantBadge)}</span>`;

  let host = '';
  try { host = new URL(app.url).hostname; } catch (e) { if (LX_DEBUG) console.warn(e); }

  const reasonHtml = app.closed ? `<p class="palette-detail-reason">${escapeHtml(app.closedReason ? loc(app.closedReason) : t('closedReasonDefault'))}</p>` : '';

  const opened = Number(getFreqMap()[app.id]) || 0;
  const facts = [];
  if (host) facts.push(fact(t('factLink'), `<span dir="ltr">${escapeHtml(host)}</span>`, 'is-mono'));
  facts.push(opened
    ? fact(t('factActivity'), escapeHtml(fmt('statOpened', { n: opened })))
    : fact(t('factActivity'), escapeHtml(t('statNever')), 'is-quiet'));

  detail.innerHTML = `
    ${slabHtml}
    <div class="palette-detail-header">
      ${wrapOpen(app, null)}
        ${markHtml(app, null, app.icon, 'app-icon')}
      </div>
      <div class="palette-detail-title-wrap">
        <span class="palette-detail-eyebrow">${escapeHtml(loc(cat.label))}</span>
        <h3 class="palette-detail-title">${escapeHtml(loc(app.title))}</h3>
        ${badgesHtml ? `<div class="palette-detail-meta">${badgesHtml}</div>` : ''}
      </div>
    </div>
    ${reasonHtml}
    <dl class="palette-facts">${facts.join('')}</dl>
    ${actionsHtml}
  `;

  detail.querySelectorAll('.palette-action').forEach((btn) => {
    const actionId = btn.dataset.action;
    btn.addEventListener('mouseenter', () => {
      const idx = getActionsForEntry(entry).findIndex(a => a.id === actionId);
      if (paletteZone !== 'actions' || idx !== paletteActionIndex) sfx.tick(idx + 4);
      paletteActionIndex = idx;
      paletteZone = 'actions';
      updateActionHighlight();
    });
    btn.addEventListener('click', () => executeAction(actionId));
  });

  updateActionHighlight();
};

const updateActionHighlight = () => {
  document.querySelectorAll('.palette-action').forEach((btn, i) => {
    const active = paletteZone === 'actions' && i === paletteActionIndex;
    btn.classList.toggle('is-active', active);
  });
  updateActiveDescendant();
  document.querySelector('#paletteResults > .palette-cursor')?.classList.toggle('is-dimmed', paletteZone === 'actions');
};

const updateActiveDescendant = () => {
  const input = document.getElementById('paletteInput');
  if (!input) return;
  if (paletteZone === 'actions') {
    const actions = getActionsForEntry(paletteItems[paletteActiveIndex]);
    const a = actions[paletteActionIndex];
    input.setAttribute('aria-activedescendant', a ? `palette-action-${a.id}` : '');
  } else {
    const activeEntry = paletteItems[paletteActiveIndex];
    input.setAttribute('aria-activedescendant', activeEntry ? `palette-item-${sanitizeDomId(paletteEntryKey(activeEntry))}` : '');
  }
};

const updateLiveAccent = () => {
  const entry = paletteItems[paletteActiveIndex];
  const palette = document.getElementById('lx-palette');
  if (!palette) return;
  palette.style.setProperty('--c1', tone(entry ? appGradient(entry.app)[0] : '#7c9bff'));
};
let actionFeedbackTimer;

const announcePalette = (msg) => {
  const live = document.getElementById('paletteLive');
  if (live) live.textContent = msg;
};

const showActionFeedback = (actionId, ok, okLabel, failLabel) => {
  const btn = document.querySelector(`.palette-action[data-action="${actionId}"]`);
  if (!btn) return;
  clearTimeout(actionFeedbackTimer);
  const iconEl = btn.querySelector('svg');
  const label = btn.querySelector('.palette-action-label');
  const prevIconName = (iconEl.getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('fa-')) || DEFAULT_ICON;
  const prevLabelText = label.textContent;
  const msg = ok ? okLabel : failLabel;
  setIcon(iconEl, ok ? 'fa-check' : 'fa-triangle-exclamation');
  label.textContent = msg;
  announcePalette(msg);
  actionFeedbackTimer = setTimeout(() => {
    setIcon(iconEl, prevIconName);
    label.textContent = prevLabelText;
  }, 1400);
};

const revealInGrid = async (entry) => {
  if (isPaletteOnly(entry.cat)) return;
  const targetId = entry.app.parentId || entry.app.id;
  const targetCatId = entry.cat.id;
  closePaletteImmediate();
  if (currentTabId !== targetCatId) await activateTab(targetCatId);
  requestAnimationFrame(() => {
    const card = document.querySelector(`#appGrid .app-card[data-app-id="${CSS.escape(targetId)}"]`);
    if (!card) return;
    const reducedMotion = MQ.reducedMotion;
    card.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' });
    card.classList.add('is-revealed');
    card.addEventListener('animationend', () => card.classList.remove('is-revealed'), { once: true });
    card.querySelector('.card-link-overlay')?.focus({ preventScroll: true });
  });
};

const executeAction = async (actionId) => {
  const entry = paletteItems[paletteActiveIndex];
  if (!entry) return;
  if (entry.app.command) {
    if (actionId === 'copy-link' || actionId === 'copy-title' || actionId === 'qr') return;
    paletteSkipCloseChime = true;
    runCommand(entry);
    return;
  }
  if (entry.app.parentId && (actionId === 'new-tab' || actionId === 'same-tab')) {
    try { localStorage.setItem('lx-variant-' + entry.app.parentId, String(entry.app.variantIndex)); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (actionId === 'new-tab' || actionId === 'same-tab') {
    pushRecent(entry.app.id);
    bumpFreq(entry.app.id);
    try { localStorage.setItem('lx-last-open', entry.app.id); } catch (e) { if (LX_DEBUG) console.warn(e); }
  }
  if (actionId === 'new-tab') {
    sfx.click();
    openInNewTab(entry.app.url);
    paletteSkipCloseChime = true;
    document.querySelector('.palette-body')?.classList.add('is-collapsing');
    requestClosePalette();
  } else if (actionId === 'same-tab') {
    sfx.click();
    openInSameTab(entry.app.url);
  } else if (actionId === 'copy-link') {
    const ok = await copyToClipboard(entry.app.url);
    sfx.click();
    showActionFeedback('copy-link', ok, t('linkCopied'), t('copyFailed'));
  } else if (actionId === 'copy-title') {
    const ok = await copyToClipboard(loc(entry.app.parentTitle || entry.app.title));
    sfx.click();
    showActionFeedback('copy-title', ok, t('nameCopied'), t('copyFailed'));
  } else if (actionId === 'qr') {
    sfx.click();
    openQrFromPalette(entry);
  } else if (actionId === 'reveal') {
    sfx.click();
    await revealInGrid(entry);
  }
};

const openPaletteItem = (i) => {
  paletteActiveIndex = i;
  executeAction(openModeAction());
};

let morph = null;
let morphFrame = 0;
let heroTimer = 0;

const awaitAnimationSettled = (anim, maxMs) => new Promise((resolve) => {
  let done = false;
  const finishNow = () => {
    if (done) return;
    done = true;
    try { anim.finish(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    resolve();
  };
  const t = setTimeout(finishNow, maxMs);
  anim.finished.catch(() => {}).finally(() => {
    if (done) return;
    done = true;
    clearTimeout(t);
    resolve();
  });
});

const endMorph = () => {
  paletteBusy = false;
  const m = morph;
  if (!m) return;
  morph = null;
  cancelAnimationFrame(morphFrame);
  clearTimeout(heroTimer);
  m.parts.forEach((a) => a.cancel());
  const dialog = document.getElementById('lx-palette');
  dialog.style.willChange = '';
  dialog.classList.remove('is-morphing');
  dialog.querySelector('.palette-close')?.style.removeProperty('opacity');
  document.getElementById('paletteResults')?.style.removeProperty('--stagger-base');
};

const closeNow = () => {
  const dialog = document.getElementById('lx-palette');
  const hero = document.getElementById('lxBarSearch');
  dialog.close();
  endMorph();
  dialog.classList.remove('is-morphing', 'did-morph');
  document.body.classList.remove('palette-open');
  if (heroReturnFocus) {
    heroReturnFocus = false;
    hero?.focus({ preventScroll: true });
  }
};

const morphGeo = (dialog, hero) => {
  const row = dialog.querySelector('.palette-input-row').getBoundingClientRect();
  const heroBox = heroRestBox || hero.getBoundingClientRect();
  const bottomGap = Math.max(0, dialog.getBoundingClientRect().height - row.height);
  const dy = (heroBox.top + heroBox.height / 2) - (row.top + row.height / 2);
  return {
    closed: { clipPath: `inset(0px 0px ${bottomGap}px 0px round 999px)`, transform: `translateY(${dy}px)` },
    open: { clipPath: 'inset(0px 0px 0px 0px round 20px)', transform: 'translateY(0)' }
  };
};

const runMorph = (toOpen, geo) => {
  const dialog = document.getElementById('lx-palette');
  const prev = morph;
  const live = prev && prev.panel;
  const cs = getComputedStyle(dialog);
  const bodyEl = dialog.querySelector('.palette-body');
  const closeEl = dialog.querySelector('.palette-close');
  const mo = MOTION.palette;
  const total = toOpen ? mo.inMs : mo.outMs;
  const ms = live ? Math.max(1, total * (live.effect.getComputedTiming().progress || 0)) : total;
  const from = live ? { clipPath: cs.clipPath, transform: cs.transform } : geo[toOpen ? 'closed' : 'open'];
  const fadeMs = live ? ms : total * (toOpen ? mo.fade : mo.outFade);
  const wait = live || !toOpen ? 0 : total * mo.wait;
  const fade = (el, to) => animate(el, [{ opacity: live ? getComputedStyle(el).opacity : 1 - to }, { opacity: to }], { duration: fadeMs, delay: wait, easing: EASE_LUX, fill: 'both' });
  const panel = animate(dialog, [from, geo[toOpen ? 'open' : 'closed']], { duration: ms, easing: toOpen ? EASE_LUX : EASE_ACCEL, fill: 'both' });
  const parts = [panel, fade(bodyEl, +toOpen)];
  if (closeEl && (toOpen || live)) parts.push(fade(closeEl, 1));
  prev?.parts.forEach((a) => a.cancel());
  const m = { toOpen, geo, panel, parts };
  morph = m;
  dialog.style.willChange = 'clip-path, transform';
  clearTimeout(heroTimer);
  if (toOpen) document.body.classList.add('palette-open');
  else heroTimer = setTimeout(() => { document.body.classList.remove('palette-open'); }, Math.max(0, ms - mo.hero));
  awaitAnimationSettled(panel, total * 3).then(() => {
    if (morph !== m) return;
    if (toOpen) {
      endMorph();
      if (dialog.open) dialog.classList.add('did-morph');
      document.body.classList.toggle('palette-open', dialog.open);
    } else closeNow();
  });
};

export const paletteClosing = () => !!morph && !morph.toOpen;

export const openPalette = (seed = '') => {
  const dialog = document.getElementById('lx-palette');
  const hero = document.getElementById('lxBarSearch');
  if (paletteClosing() && morph.panel) {
    hero?.setAttribute('aria-expanded', 'true');
    sfx.veil(true);
    runMorph(true, morph.geo);
    return;
  }
  if (dialog.open || paletteBusy) return;
  closeContextMenu();
  paletteBusy = true;
  document.querySelector('.palette-body')?.classList.remove('is-collapsing');

  if (activeViewTransition) {
    try { activeViewTransition.skipTransition(); } catch (e) { if (LX_DEBUG) console.warn(e); }
    assignActiveViewTransition(null);
  }

  const input = document.getElementById('paletteInput');
  const reducedMotion = MQ.reducedMotion;
  const skipMorph = !hero || reducedMotion || typeof dialog.animate !== 'function' ||
    window.innerWidth < 1024 || !MQ.hoverFine;

  paletteCmdMode = seed.startsWith('>');
  input.value = paletteCmdMode ? seed.slice(1) : seed;
  seed = input.value;
  paletteTryPicks = null;
  lastDetailKey = null;
  paletteScope = 'all';
  paletteEntranceArmed = true;
  paletteRenderKey = null;
  paletteItems = [];
  paletteActiveIndex = -1;

  if (hero && !heroRestBox) heroRestBox = hero.getBoundingClientRect();

  const results = document.getElementById('paletteResults');
  if (results) results.style.setProperty('--stagger-base', skipMorph ? '0ms' : `${MOTION.palette.inMs * .55}ms`);
  renderPaletteResults(seed);

  document.querySelector('.container').classList.add('is-dollied');
  document.querySelector('.controls-pill').classList.add('is-dollied');
  document.querySelector('.dolly-scrim').classList.add('is-dollied');
  hero?.setAttribute('aria-expanded', 'true');

  if (skipMorph) {
    dialog.showModal();
    syncPaletteCursor(true);
    document.body.classList.add('palette-open');
    sfx.veil(true);
    input.focus({ preventScroll: true });
    paletteBusy = false;
    return;
  }

  dialog.classList.remove('did-morph');
  dialog.classList.add('is-morphing');
  dialog.showModal();
  syncPaletteCursor(true);
  sfx.veil(true);

  const pending = { toOpen: true, panel: null, parts: [] };
  morph = pending;
  dialog.querySelector('.palette-close')?.style.setProperty('opacity', '0');
  input.focus({ preventScroll: true });
  morphFrame = requestAnimationFrame(() => {
    if (morph !== pending || !dialog.open) return;
    runMorph(true, morphGeo(dialog, hero));
  });
};

export const closePaletteImmediate = () => {
  endMorph();
  if (!document.getElementById('lx-palette').open) return;
  document.getElementById('lxBarSearch')?.setAttribute('aria-expanded', 'false');
  if (!paletteSkipCloseChime) sfx.veil(false);
  paletteSkipCloseChime = true;
  document.getElementById('paletteGhost')?.replaceChildren();
  closeNow();
};

export const requestClosePalette = () => {
  const dialog = document.getElementById('lx-palette');
  if (morph && !morph.panel) {
    closePaletteImmediate();
    return;
  }
  if (!dialog.open || paletteClosing() || (paletteBusy && !morph)) return;
  paletteBusy = true;

  const hero = document.getElementById('lxBarSearch');
  hero?.setAttribute('aria-expanded', 'false');

  if (!paletteSkipCloseChime) sfx.veil(false);
  paletteSkipCloseChime = true;

  document.getElementById('paletteGhost')?.replaceChildren();

  const canMorph = !!hero && (!!morph || dialog.classList.contains('did-morph')) && !MQ.reducedMotion && typeof dialog.animate === 'function';
  if (!canMorph) {
    closeNow();
    return;
  }

  const geo = morph ? morph.geo : morphGeo(dialog, hero);
  dialog.classList.add('is-morphing');
  runMorph(false, geo);
};

const togglePalette = () => {
  if (document.getElementById('lx-palette').open && !paletteClosing()) requestClosePalette(); else openPalette();
};

export const initPaletteInput = () => {
  const paletteInput = document.getElementById('paletteInput');
  const paletteResultsList = document.getElementById('paletteResults');

  let lastPointerX = -1;
  let lastPointerY = -1;
  paletteResultsList.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'touch') return;
    if (e.clientX === lastPointerX && e.clientY === lastPointerY) return;
    lastPointerX = e.clientX;
    lastPointerY = e.clientY;
    const li = e.target.closest('.palette-item');
    if (!li || !paletteResultsList.contains(li)) return;
    const idx = Number(li.dataset.index);
    if (idx === paletteActiveIndex && paletteZone === 'list') return;
    if (idx !== paletteActiveIndex) sfx.tick(idx);
    setPaletteActive(idx, { scroll: false });
  }, { passive: true });
  paletteResultsList.addEventListener('click', (e) => {
    const li = e.target.closest('.palette-item');
    if (!li || !paletteResultsList.contains(li)) return;
    if (e.target.closest('.palette-qr')) {
      e.preventDefault();
      setPaletteActive(Number(li.dataset.index), { scroll: false });
      executeAction('qr');
      return;
    }
    openPaletteItem(Number(li.dataset.index));
  });

  let searchFrame = 0;
  let pendingRaw = '';
  const cancelScheduledSearch = () => {
    if (searchFrame) cancelAnimationFrame(searchFrame);
    searchFrame = 0;
  };
  const scheduleSearch = (raw) => {
    pendingRaw = raw;
    if (searchFrame) return;
    searchFrame = requestAnimationFrame(() => {
      searchFrame = 0;
      renderPaletteResults(pendingRaw);
    });
  };

  paletteInput.addEventListener('input', (e) => {
    if (e.isComposing) return;
    if (!paletteCmdMode && paletteInput.value.startsWith('>')) {
      paletteCmdMode = true;
      paletteInput.value = paletteInput.value.slice(1).trimStart();
      cancelScheduledSearch();
      sfx.tick(4);
      renderPaletteResults(paletteInput.value);
      return;
    }
    const raw = paletteInput.value;
    if (!raw) {
      cancelScheduledSearch();
      renderPaletteResults('');
      return;
    }
    scheduleSearch(raw);
  });

  paletteInput.addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Backspace' && paletteCmdMode && !paletteInput.value) {
      e.preventDefault();
      paletteCmdMode = false;
      cancelScheduledSearch();
      sfx.tick(0);
      renderPaletteResults('');
      return;
    }
    const forwardKey = document.documentElement.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight';
    if (
      e.key === forwardKey && paletteZone === 'list' && paletteGhostTail &&
      paletteInput.selectionStart === paletteInput.value.length &&
      paletteInput.selectionEnd === paletteInput.value.length
    ) {
      e.preventDefault();
      const completed = paletteInput.value + paletteGhostTail;
      paletteInput.value = completed;
      cancelScheduledSearch();
      renderPaletteResults(completed);
      return;
    }

    if (e.key === 'Tab' && e.shiftKey && !paletteCmdMode) {
      e.preventDefault();
      cyclePaletteScope(1);
      return;
    }

    if (e.key === 'Tab') {
      if (paletteActiveIndex === -1) return;
      e.preventDefault();
      paletteZone = paletteZone === 'list' ? 'actions' : 'list';
      if (paletteZone === 'actions') paletteActionIndex = 0;
      updateActionHighlight();
      sfx.tick(paletteZone === 'actions' ? paletteActionIndex + 4 : paletteActiveIndex);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (paletteZone === 'actions') {
        const n = getActionsForEntry(paletteItems[paletteActiveIndex]).length;
        paletteActionIndex = (paletteActionIndex + 1) % n;
        updateActionHighlight();
        sfx.tick(paletteActionIndex + 4);
      } else if (paletteItems.length) {
        setPaletteActive((paletteActiveIndex + 1) % paletteItems.length);
        sfx.tick(paletteActiveIndex);
      }
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (paletteZone === 'actions') {
        const n = getActionsForEntry(paletteItems[paletteActiveIndex]).length;
        paletteActionIndex = (paletteActionIndex - 1 + n) % n;
        updateActionHighlight();
        sfx.tick(paletteActionIndex + 4);
      } else if (paletteItems.length) {
        setPaletteActive((paletteActiveIndex - 1 + paletteItems.length) % paletteItems.length);
        sfx.tick(paletteActiveIndex);
      }
      return;
    }

    if (e.altKey && !e.metaKey && !e.ctrlKey && (e.code === 'KeyQ' || (e.key || '').toLowerCase() === 'q')) {
      e.preventDefault();
      e.stopPropagation();
      const entry = paletteItems[paletteActiveIndex];
      if (entry && !entry.app.command) executeAction('qr');
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      if (paletteActiveIndex === -1) return;
      if (e.shiftKey) { executeAction(openModeAction(otherOpenMode())); return; }
      if (e.ctrlKey || e.metaKey) { executeAction('copy-link'); return; }
      if (paletteZone === 'actions') { executeAction(getActionsForEntry(paletteItems[paletteActiveIndex])[paletteActionIndex].id); return; }
      executeAction(openModeAction());
      return;
    }
  });
};

export const initPaletteDialog = () => {
  const paletteDialog = document.getElementById('lx-palette');
  paletteDialog.addEventListener('close', () => {
    document.querySelector('.container').classList.remove('is-dollied');
    document.querySelector('.controls-pill').classList.remove('is-dollied');
    document.querySelector('.dolly-scrim').classList.remove('is-dollied');
    document.body.classList.remove('palette-open');
    if (paletteSkipCloseChime) paletteSkipCloseChime = false;
    else sfx.veil(false);
  });

  paletteDialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    requestClosePalette();
  });

  document.getElementById('paletteClose')?.addEventListener('click', requestClosePalette);

  paletteDialog.addEventListener('click', (e) => {
    if (!paletteDialog.open) return;
    const r = paletteDialog.getBoundingClientRect();
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    if (!inside) requestClosePalette();
  });
};

export const initBarSearchButton = () => {
  const searchBtn = document.getElementById('lxBarSearch');
  if (searchBtn) {
    const syncBarFocusState = () => {
      const bar = document.getElementById('lxBar');
      if (bar) bar.classList.toggle('is-focused', document.activeElement === searchBtn);
    };
    searchBtn.addEventListener('focus', syncBarFocusState);
    searchBtn.addEventListener('blur', syncBarFocusState);
    searchBtn.addEventListener('click', () => {
      heroReturnFocus = true;
      openPalette('');
    });
  }
};

export const initPaletteHints = () => {
  const paletteDialog = document.getElementById('lx-palette');
  const hintKbdByKey = new Map();
  document.querySelectorAll('.palette-hints kbd').forEach((k) => {
    const label = k.textContent.trim();
    if (label === '↑↓') { hintKbdByKey.set('ArrowUp', k); hintKbdByKey.set('ArrowDown', k); }
    else if (label === '⇥') hintKbdByKey.set('Tab', k);
    else if (label === '↵') hintKbdByKey.set('Enter', k);
    else if (label === 'Esc') hintKbdByKey.set('Escape', k);
    else hintKbdByKey.set(label, k);
  });
  document.addEventListener('keydown', (e) => {
    if (!paletteDialog.open) return;
    const kbd = hintKbdByKey.get(e.key);
    if (!kbd) return;
    kbd.classList.add('is-pressed');
    clearTimeout(kbd._pressTimer);
    kbd._pressTimer = setTimeout(() => kbd.classList.remove('is-pressed'), motionMs('--dur-micro'));
  });
};

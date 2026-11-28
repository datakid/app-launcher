import { LX_DEBUG, clamp, copyToClipboard, escapeHtml } from './util.js';
import { categories } from './catalogue.js';
import { sfx } from './audio.js';
import { appGradient, appMark, icon, markHtml, retileIcon, setIcon } from './marks.js';
import { loc, t } from './i18n.js';
import { noteTile, travelTile } from './motion.js';
import { OPEN_MODES, openMode, openModeIcon, openUrlWith, otherOpenMode, setOpenMode } from './open.js';
import { bumpFreq, pushRecent } from './store.js';
import { tone } from './theme.js';
import { isMacPlatform } from './i18n-apply.js';
import { assignHeroReturnFocus, openPalette } from './palette/view.js';
import { openQrForApp } from './qr-dialog.js';

export let contextMenuEl = null;
export let contextMenuAC = null;
let contextMenuReturn = null;

export const closeContextMenu = () => {
  if (!contextMenuEl || !contextMenuEl.classList.contains('is-open')) return;
  const hadFocus = contextMenuEl.contains(document.activeElement);
  contextMenuEl.classList.remove('is-open');
  contextMenuEl.inert = true;
  contextMenuEl.style.removeProperty('--menu-accent');
  delete contextMenuEl.dataset.owner;
  document.getElementById('dataToggle')?.setAttribute('aria-expanded', 'false');
  document.getElementById('lookToggle')?.setAttribute('aria-expanded', 'false');
  if (contextMenuAC) { contextMenuAC.abort(); contextMenuAC = null; }
  const back = contextMenuReturn;
  contextMenuReturn = null;
  if (hadFocus && back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
};

export const buildContextMenu = () => {
  if (contextMenuEl) return contextMenuEl;
  contextMenuEl = document.createElement('div');
  contextMenuEl.className = 'lx-context-menu';
  contextMenuEl.setAttribute('role', 'menu');
  contextMenuEl.tabIndex = -1;
  contextMenuEl.inert = true;
  document.body.appendChild(contextMenuEl);
  return contextMenuEl;
};

export const placeContextMenu = (menu, x, y) => {
  const pad = 8;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = `${clamp(x, pad, Math.max(pad, window.innerWidth - w - pad))}px`;
  menu.style.top = `${clamp(y, pad, Math.max(pad, window.innerHeight - h - pad))}px`;
};

export const showContextMenu = (menu, { anchor = null, returnTo = null, focusFirst = false } = {}) => {
  contextMenuReturn = returnTo;
  menu.inert = false;
  menu.classList.add('is-open');
  contextMenuAC = new AbortController();
  const { signal } = contextMenuAC;
  document.addEventListener('pointerdown', (e) => {
    if (menu.contains(e.target) || (anchor && anchor.contains(e.target))) return;
    contextMenuReturn = null;
    closeContextMenu();
  }, { passive: true, signal });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      closeContextMenu();
      return;
    }
    if (!menu.contains(document.activeElement)) return;
    e.stopImmediatePropagation();
    if (e.key === 'Tab') { e.preventDefault(); closeContextMenu(); return; }
    const row = document.activeElement.closest('.ctx-vrow');
    if (row && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const rowBtns = [...row.querySelectorAll('button')];
      const ri = rowBtns.indexOf(document.activeElement);
      const fwd = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
      const target = rowBtns[(ri + (fwd ? 1 : rowBtns.length - 1)) % rowBtns.length];
      if (target) { e.preventDefault(); target.focus({ preventScroll: true }); }
      return;
    }
    const items = [...menu.querySelectorAll('button:not(.ctx-side)')];
    if (!items.length) return;
    const cur = row ? row.querySelector('.ctx-vopen') : document.activeElement;
    const i = items.indexOf(cur);
    let next = null;
    if (e.key === 'ArrowDown') next = items[(i + 1) % items.length];
    else if (e.key === 'ArrowUp') next = items[i <= 0 ? items.length - 1 : i - 1];
    else if (e.key === 'Home') next = items[0];
    else if (e.key === 'End') next = items[items.length - 1];
    if (next) { e.preventDefault(); next.focus({ preventScroll: true }); }
  }, { signal, capture: true });
  window.addEventListener('resize', () => { contextMenuReturn = null; closeContextMenu(); }, { passive: true, signal });
  window.addEventListener('scroll', () => { contextMenuReturn = null; closeContextMenu(); }, { passive: true, capture: true, signal });
  const first = menu.querySelector('.ctx-vopen.is-default') || menu.querySelector('button:not(.ctx-side)');
  (focusFirst && first ? first : menu).focus({ preventScroll: true });
};

const syncCardMenuMode = (menu, mode) => {
  const seg = menu.querySelector('.ctx-seg');
  if (seg) seg.dataset.mode = mode;
  menu.querySelectorAll('[data-open-mode]').forEach((b) => {
    const on = b.dataset.openMode === mode;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  const other = otherOpenMode(mode);
  const otherLabel = t(other === 'new' ? 'actionNewTab' : 'actionSameTab');
  menu.querySelectorAll('[data-vother]').forEach((b) => {
    setIcon(b.querySelector('svg'), openModeIcon(other));
    b.title = otherLabel;
    const vLabel = b.parentElement?.querySelector('.ctx-vopen .ctx-label')?.textContent || '';
    b.setAttribute('aria-label', `${vLabel} — ${otherLabel}`);
  });
  const group = menu.querySelector('[data-action="open-new"]')?.parentElement;
  if (group) {
    const first = group.querySelector(`[data-action="open-${mode}"]`);
    const second = group.querySelector(`[data-action="open-${other}"]`);
    if (first && second) {
      group.querySelectorAll('.ctx-tag').forEach(tag => tag.remove());
      first.classList.add('is-default');
      second.classList.remove('is-default');
      const tag = document.createElement('span');
      tag.className = 'ctx-tag';
      tag.textContent = t('ctxDefault');
      first.appendChild(tag);
      group.insertBefore(first, group.firstChild);
    }
  }
  menu.dataset.mode = mode;
};

export const openCardContextMenu = (card, clientX, clientY, fromKeyboard = false) => {
  closeContextMenu();
  noteTile(card.querySelector('.app-icon-wrapper') || card);
  const menu = buildContextMenu();
  menu.dataset.owner = 'card';
  const linkEl = card.querySelector('.card-link-overlay');
  const activeUrl = linkEl ? linkEl.href : '';
  const variantChips = Array.from(card.querySelectorAll('.variant-chip'));

  const appId = card.dataset.appId;
  const cat = categories.find(c => c.apps.some(a => a.id === appId));
  const app = cat ? cat.apps.find(a => a.id === appId) : null;
  const activeChip = card.querySelector('.variant-chip.is-active');
  const chipIndex = activeChip ? Number(activeChip.dataset.variantIndex) : (card.classList.contains('app-card--icon') && card.dataset.variantIndex !== undefined ? Number(card.dataset.variantIndex) : -1);
  const activeVariant = app && app.variants && app.variants[chipIndex] ? app.variants[chipIndex] : null;
  const title = app ? loc(app.title) : '';
  const iconName = activeVariant ? activeVariant.icon : (app ? app.icon : 'fa-circle');
  let host = '';
  try { host = new URL(activeUrl).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
  const mode = openMode();
  if (app) menu.style.setProperty('--menu-accent', tone(appGradient(app, activeVariant)[0]));
  const kbdHint = (txt) => `<span class="ctx-kbd" aria-hidden="true">${escapeHtml(txt)}</span>`;
  const defaultTag = `<span class="ctx-tag">${escapeHtml(t('ctxDefault'))}</span>`;
  const openRow = (m) => `<button type="button" data-action="open-${m}" role="menuitem" class="ctx-item${m === mode ? ' is-default' : ''}">${icon(openModeIcon(m))}<span class="ctx-label">${escapeHtml(t(m === 'new' ? 'actionNewTab' : 'actionSameTab'))}</span>${m === mode ? defaultTag : ''}</button>`;

  const otherMode = otherOpenMode(mode);
  const otherLabel = t(otherMode === 'new' ? 'actionNewTab' : 'actionSameTab');
  const isVariantApp = !!(app && app.variants && variantChips.length);
  const openGroupHtml = isVariantApp
    ? `<div class="lx-context-menu-label" role="presentation">${escapeHtml(t('ctxOpen'))}</div><div class="ctx-group" role="group">${app.variants.map((v, i) => {
        const current = !!variantChips[i]?.classList.contains('is-active');
        const vLabel = loc(v.label);
        return `<div class="ctx-vrow${current ? ' is-current' : ''}" role="presentation">
          <button type="button" role="menuitem" class="ctx-item ctx-vopen${current ? ' is-default' : ''}" data-vopen="${i}">${icon(v.icon || 'fa-circle')}<span class="ctx-label">${escapeHtml(vLabel)}</span></button>
          <button type="button" role="menuitem" class="ctx-side" data-vother="${i}" aria-label="${escapeHtml(vLabel + ' — ' + otherLabel)}" title="${escapeHtml(otherLabel)}">${icon(openModeIcon(otherMode))}</button>
          <button type="button" role="menuitemradio" aria-checked="${current}" class="ctx-side ctx-pin${current ? ' is-pinned' : ''}" data-vpin="${i}" aria-label="${escapeHtml(vLabel + ' — ' + t('ctxUseVersion'))}" title="${escapeHtml(current ? t('ctxCurrent') : t('ctxUseVersion'))}">${icon('fa-thumbtack')}</button>
        </div>`;
      }).join('')}</div>`
    : `<div class="ctx-group" role="group">${openRow(mode)}${openRow(otherMode)}</div>`;

  let itemsHtml = `
    <div class="ctx-head" role="presentation" style="--c1:${escapeHtml(tone(app ? appGradient(app, activeVariant)[0] : '#7c9bff'))}">
      <span class="ctx-head-icon" data-mark="${app ? appMark(app, activeVariant).kind : 'fa'}">${app ? markHtml(app, activeVariant, iconName, '') : icon(iconName)}</span>
      <span class="ctx-head-text">
        <span class="ctx-head-title">${escapeHtml(title)}${activeVariant ? `<span class="ctx-head-variant">${escapeHtml(loc(activeVariant.label))}</span>` : ''}</span>
        <span class="ctx-head-sub">${host ? `<span dir="ltr">${escapeHtml(host)}</span>` : ''}${app && app.closed ? `<span class="ctx-head-closed">${escapeHtml(t('badgeClosed'))}</span>` : ''}</span>
      </span>
    </div>
    ${openGroupHtml}
    <div class="lx-context-menu-sep" role="separator"></div>
    <div class="ctx-group" role="group">
      <button type="button" data-action="copy" role="menuitem" class="ctx-item">${icon('fa-copy')}<span class="ctx-label">${escapeHtml(t('ctxCopyLink'))}</span></button>
      <button type="button" data-action="copy-name" role="menuitem" class="ctx-item">${icon('fa-font')}<span class="ctx-label">${escapeHtml(t('ctxCopyName'))}</span></button>
      <button type="button" data-action="qr" role="menuitem" class="ctx-item">${icon('fa-qrcode')}<span class="ctx-label">${escapeHtml(t('ctxQr'))}</span>${kbdHint(isMacPlatform() ? '⌥Q' : 'Alt Q')}</button>
      <button type="button" data-action="details" role="menuitem" class="ctx-item">${icon('fa-magnifying-glass')}<span class="ctx-label">${escapeHtml(t('ctxDetails'))}</span>${kbdHint(isMacPlatform() ? '⌘K' : 'Ctrl K')}</button>
    </div>
  `;
  itemsHtml += `
    <div class="lx-context-menu-sep" role="separator"></div>
    <div class="ctx-mode" role="group" aria-label="${escapeHtml(t('ctxOpenWith'))}">
      <span class="ctx-mode-label">${escapeHtml(t('ctxOpenWith'))}</span>
      <span class="ctx-seg" data-mode="${mode}">
        <span class="ctx-seg-thumb" aria-hidden="true"></span>
        ${OPEN_MODES.map(m => `<button type="button" role="menuitemradio" aria-checked="${m === mode}" data-open-mode="${m}" class="${m === mode ? 'is-active' : ''}" title="${escapeHtml(t('openModeHint_' + m))}">${escapeHtml(t('openMode_' + m))}</button>`).join('')}
      </span>
    </div>
  `;
  menu.innerHTML = itemsHtml;

  const recordCardLaunch = () => {
    const recentId = activeVariant ? `${appId}::${activeVariant.id}` : appId;
    pushRecent(recentId);
    bumpFreq(recentId);
    try { localStorage.setItem('lx-last-open', appId); } catch (err) { if (LX_DEBUG) console.warn(err); }
  };
  OPEN_MODES.forEach((m) => {
    menu.querySelector(`[data-action="open-${m}"]`)?.addEventListener('click', () => {
      sfx.click();
      contextMenuReturn = null;
      closeContextMenu();
      if (!activeUrl) return;
      recordCardLaunch();
      openUrlWith(activeUrl, m);
    });
  });
  const flashItem = (btn, ok, okText) => {
    btn.classList.add(ok ? 'is-done' : 'is-failed');
    const label = btn.querySelector('.ctx-label');
    setIcon(btn.querySelector('svg'), ok ? 'fa-check' : 'fa-triangle-exclamation');
    if (label) label.textContent = ok ? okText : t('copyFailed');
    setTimeout(() => { if (btn.isConnected && menu.contains(btn)) closeContextMenu(); }, 700);
  };
  menu.querySelector('[data-action="copy"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = activeUrl ? await copyToClipboard(activeUrl) : false;
    sfx.click();
    flashItem(btn, ok, t('linkCopied'));
  });
  menu.querySelector('[data-action="copy-name"]').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    const ok = title ? await copyToClipboard(title) : false;
    sfx.click();
    flashItem(btn, ok, t('nameCopied'));
  });
  menu.querySelector('[data-action="qr"]').addEventListener('click', () => {
    sfx.click();
    const back = linkEl || card;
    const liveChip = card.querySelector('.variant-chip.is-active');
    const vi = liveChip ? Number(liveChip.dataset.variantIndex) : (chipIndex >= 0 ? chipIndex : undefined);
    contextMenuReturn = null;
    noteTile(menu.querySelector('.ctx-head-icon'));
    closeContextMenu();
    openQrForApp(app, vi, back);
  });
  menu.querySelector('[data-action="details"]').addEventListener('click', () => {
    sfx.click();
    contextMenuReturn = null;
    noteTile(menu.querySelector('.ctx-head-icon'));
    closeContextMenu();
    assignHeroReturnFocus(false);
    openPalette(title);
  });
  const launchVariant = (i, m) => {
    const v = app && app.variants ? app.variants[i] : null;
    if (!v || !v.url) return;
    sfx.click();
    contextMenuReturn = null;
    closeContextMenu();
    const recentId = `${appId}::${v.id}`;
    pushRecent(recentId);
    bumpFreq(recentId);
    try { localStorage.setItem('lx-last-open', appId); } catch (err) { if (LX_DEBUG) console.warn(err); }
    openUrlWith(v.url, m);
  };
  menu.querySelectorAll('[data-vopen]').forEach((btn) => {
    const i = Number(btn.dataset.vopen);
    btn.addEventListener('click', (e) => launchVariant(i, e.shiftKey || e.metaKey || e.ctrlKey ? otherOpenMode(openMode()) : openMode()));
    btn.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); launchVariant(i, 'new'); } });
  });
  menu.querySelectorAll('[data-vother]').forEach((btn) => {
    btn.addEventListener('click', () => launchVariant(Number(btn.dataset.vother), otherOpenMode(openMode())));
  });
  menu.querySelectorAll('[data-vpin]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.vpin);
      if (btn.classList.contains('is-pinned')) {
        btn.classList.remove('is-nudge');
        void btn.offsetWidth;
        btn.classList.add('is-nudge');
        return;
      }
      variantChips[i]?.click();
      menu.querySelectorAll('.ctx-vrow').forEach((rowEl, ri) => {
        const on = ri === i;
        rowEl.classList.toggle('is-current', on);
        rowEl.querySelector('.ctx-vopen')?.classList.toggle('is-default', on);
        const pin = rowEl.querySelector('.ctx-pin');
        if (pin) {
          pin.classList.toggle('is-pinned', on);
          pin.setAttribute('aria-checked', String(on));
          pin.title = on ? t('ctxCurrent') : t('ctxUseVersion');
        }
      });
      const v = app && app.variants ? app.variants[i] : null;
      if (v) {
        const tint = tone(appGradient(app, v)[0]);
        menu.style.setProperty('--menu-accent', tint);
        const headEl = menu.querySelector('.ctx-head');
        if (headEl) headEl.style.setProperty('--c1', tint);
        const headVar = menu.querySelector('.ctx-head-variant');
        if (headVar) headVar.textContent = loc(v.label);
        const headIcon = menu.querySelector('.ctx-head-icon');
        if (headIcon && app) retileIcon(headIcon, app, v, v.icon, '');
        const headHost = menu.querySelector('.ctx-head-sub > span[dir]');
        if (headHost) { try { headHost.textContent = new URL(v.url).hostname.replace(/^www\./, ''); } catch (err) { if (LX_DEBUG) console.warn(err); } }
      }
    });
  });
  menu.querySelectorAll('[data-open-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const m = btn.dataset.openMode;
      if (m === openMode()) return;
      sfx.click();
      setOpenMode(m);
      syncCardMenuMode(menu, m);
      btn.focus({ preventScroll: true });
    });
  });

  placeContextMenu(menu, clientX, clientY);
  const returnTo = fromKeyboard || card.contains(document.activeElement) ? (linkEl || card) : document.activeElement;
  showContextMenu(menu, { returnTo, focusFirst: fromKeyboard });
  travelTile(menu.querySelector('.ctx-head-icon'));
};

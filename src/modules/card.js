import { LX_DEBUG, clamp, escapeHtml } from './util.js';
import { sfx } from './audio.js';
import { appGradient, cardHostMarkup, cardMarkHtml, icon, markHtml, retileIcon, setActiveVariant, stackableVariants, wrapOpen } from './marks.js';
import { attachDestinationWarming } from './warm.js';
import { loc, t } from './i18n.js';
import { openMode, openModeIcon } from './open.js';
import { bumpFreq, pushRecent } from './store.js';
import { Motion } from './motion.js';
import { variantFor, variantForSpan } from './views/bento.js';
import { pointerVX } from './pointer-field.js';
import { setInteractionOrigin } from './origin.js';
import { openCardContextMenu } from './context-menu.js';
import { invalidateGridCache } from './grid.js';
import { tone, viewMode } from './theme.js';
import { openQrForApp } from './qr-dialog.js';

export const getSelectedVariantIndex = (app) => {
  if (!app.variants) return -1;
  try {
    const stored = localStorage.getItem('lx-variant-' + app.id);
    if (stored !== null && app.variants[Number(stored)]) return Number(stored);
  } catch (e) { if (LX_DEBUG) console.warn(e); }
  return Number.isInteger(app.defaultVariant) && app.variants[app.defaultVariant] ? app.defaultVariant : 0;
};

const supportsAnchor = typeof CSS !== 'undefined' && CSS.supports('anchor-name', '--a');

const moveVariantIndicatorLegacy = (chipsEl, btn, instant) => {
  const indicator = chipsEl.querySelector('.variant-chip-indicator');
  if (!indicator || !btn) return;
  const p = chipsEl.getBoundingClientRect(), b = btn.getBoundingClientRect();
  const x = b.left - p.left, w = b.width;
  const prevX = chipsEl._lastX ?? x;
  const dx = x - prevX;
  const stretch = Math.min(Math.abs(dx) / Math.max(w, 1), 0.3);

  indicator.style.width = `${w}px`;
  indicator.style.transformOrigin = dx >= 0 ? 'left center' : 'right center';

  if (instant) {
    indicator.style.transition = 'none';
    indicator.style.transform = `translateX(${x}px)`;
  } else {
    indicator.style.transition = 'transform 0.3s var(--ease-lux)';
    indicator.style.transform = `translateX(${x}px) scaleX(${1 + stretch})`;
    clearTimeout(chipsEl._settleTimer);
    chipsEl._settleTimer = setTimeout(() => {
      indicator.style.transition = 'transform 0.25s var(--ease-spring)';
      indicator.style.transform = `translateX(${x}px) scaleX(1)`;
    }, 140);
  }
  chipsEl._lastX = x;
};

export const gradVars = (g) => `--c1:${tone(g[0])};`;

const NEW_TTL_DAYS = 30;
export const isFresh = (app) => {
  if (!app.since) return !!app.isNew;
  const t = Date.parse(app.since + 'T00:00:00');
  if (Number.isNaN(t)) return !!app.isNew;
  return (Date.now() - t) < NEW_TTL_DAYS * 86400000;
};
export const createCard = (app, idx, placement, cat, opts = {}) => {
  const el = document.createElement('div');
  const forcedIndex = Number.isInteger(opts.variantIndex) && app.variants && app.variants[opts.variantIndex] ? opts.variantIndex : -1;
  const isTile = forcedIndex >= 0;
  const variantIndex = isTile ? forcedIndex : getSelectedVariantIndex(app);
  const carriesDigit = idx < 9 && (!isTile || variantIndex === getSelectedVariantIndex(app));
  const activeVariant = app.variants ? app.variants[variantIndex] : null;
  const activeUrl = activeVariant ? activeVariant.url : app.url;
  const title = loc(app.title);
  const activeLabel = activeVariant ? `${title} — ${loc(activeVariant.label)}` : title;
  el.classList.add('app-card');
  el.dataset.appId = app.id;
  const listView = viewMode() === 'list';
  const iconsView = viewMode() === 'icons';
  if (listView) {
    el.classList.add('app-card--row');
    el.style.setProperty('--row', String(idx));
  }
  if (iconsView) {
    el.classList.add('app-card--icon');
    el.style.setProperty('--row', String(idx));
  }

  let octave = 0;
  let variant = null;
  if (placement && placement.type === 'explicit') {
    el.style.gridColumn = placement.col || '';
    el.style.gridRow = placement.row || '';
    const rowStart = placement.row ? Number(placement.row.split('/')[0]) : null;
    octave = rowStart ? clamp(1 - (rowStart - 1), -1, 1) : 0;
    variant = variantFor(placement.col);
  } else if (placement && placement.type === 'span') {
    el.style.gridColumn = `span ${placement.col}`;
    el.style.gridRow = placement.row > 1 ? `span ${placement.row}` : '';
    octave = clamp(1 - placement.rowIndex, -1, 1);
    variant = variantForSpan(placement.col, placement.row);
  } else {
    el.style.gridColumn = '';
    el.style.gridRow = '';
  }

  el.style.setProperty('--c1', tone(appGradient(app, activeVariant)[0]));
  if (app.variants) el.dataset.variantIndex = String(variantIndex);
  el.style.setProperty('--i', idx);

  const soundIndex = cat ? cat.key + idx : idx;

  if (variant) el.classList.add(variant);
  if (app.closed) el.classList.add('status-closed');

  const fresh = isFresh(app);
  let badgesHtml = '';
  if (fresh) badgesHtml += `<div class="badge badge-new"><span class="badge-dot"></span><span class="badge-label">${escapeHtml(t('badgeNew'))}</span></div>`;
  if (app.closed) badgesHtml += `<div class="badge badge-closed"><span class="badge-dot"></span><span class="badge-label">${escapeHtml(t('badgeClosed'))}</span></div>`;
  if (app.variantBadge) badgesHtml += `<div class="badge badge-variant">${icon('fa-clone')}<span class="badge-label">${escapeHtml(app.variantBadge)}</span></div>`;

  const iconClass = activeVariant ? activeVariant.icon : app.icon;
  const stackable = !!app.variants && !iconsView && !isTile && stackableVariants(app);
  if (stackable) el.dataset.activeVariant = String(activeVariant.id);
  const digitHtml = carriesDigit ? `<span class="digit-badge" aria-hidden="true" title="${escapeHtml(t('altShortcutHint').replace('{n}', String(idx + 1)))}">${idx + 1}</span>` : '';

  const chipsHtml = app.variants ? `
      <div class="variant-chips" role="radiogroup" aria-label="${escapeHtml(t('chooseVersionOf'))} ${escapeHtml(title)}">
        <div class="variant-chip-indicator" aria-hidden="true"></div>
        ${app.variants.map((v, i) => `
          <button type="button" class="variant-chip${i === variantIndex ? ' is-active' : ''}" role="radio" aria-checked="${i === variantIndex}" data-variant-index="${i}">${escapeHtml(loc(v.label))}</button>
        `).join('')}
      </div>` : '';

  const qrLabel = `${t('ctxQr')} — ${title}`;
  const qrBtnHtml = (cls, compact = false) => `<button type="button" class="card-qr ${cls}" aria-label="${escapeHtml(qrLabel)}"${compact ? ' tabindex="-1"' : ''}>${icon('fa-qrcode')}${compact ? '' : '<span class="card-qr-label" aria-hidden="true">QR</span>'}</button>`;

  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return ''; } };
  const host = hostOf(activeUrl);

  const overlayLabel = app.closed ? `${activeLabel} — ${t('badgeClosed')}` : activeLabel;
  const overlayTarget = openMode() === 'same' ? '' : ' target="_blank"';
  const overlayAttrs = `href="${escapeHtml(activeUrl)}"${overlayTarget} rel="noopener noreferrer" title="${escapeHtml(activeUrl)}" aria-label="${escapeHtml(overlayLabel)} — ${escapeHtml(activeUrl)}"`;

  const overlayHtml = `<a class="card-link-overlay" ${overlayAttrs} data-open-mode="${openMode()}"${carriesDigit ? ` aria-keyshortcuts="${idx + 1}"` : ''}></a>`;
  const surfaceHtml = `
      <div class="card-aura" aria-hidden="true"></div>
      ${listView ? '' : `<div class="card-glyph" aria-hidden="true">${cardMarkHtml(app, activeVariant, iconClass, '', stackable)}</div>`}
      <div class="card-glow"></div>
      <div class="card-sheen" aria-hidden="true"></div>
      ${app.closed ? '<div class="closed-tint" aria-hidden="true"></div>' : ''}`;
  const iconHtml = `${wrapOpen(app, activeVariant)}${cardMarkHtml(app, activeVariant, iconClass, 'app-icon', stackable)}${digitHtml}</div>`;
  const titleHtml = `<h3 class="app-title">${escapeHtml(title)}</h3>`;
  const hostHtml = host ? `<span class="card-meta" dir="ltr" title="${escapeHtml(activeUrl)}">${cardHostMarkup(host)}</span>` : '';

  const bentoBody = `
      <div class="bento-header">
        ${iconHtml}
        <div class="header-end">
          ${badgesHtml ? `<div class="badges">${badgesHtml}</div>` : ''}
          ${qrBtnHtml('card-qr--bento')}
        </div>
      </div>
      <div class="bento-footer">
        <div class="title-stack">
          <div class="title-row">
            ${titleHtml}
            <span class="open-affordance" aria-hidden="true">${icon(openModeIcon())}</span>
          </div>
          ${hostHtml}
        </div>
        ${chipsHtml}
      </div>`;
  const listBody = `
      <div class="row-icon">${iconHtml}</div>
      <div class="row-text">${titleHtml}${hostHtml}</div>
      ${chipsHtml ? `<div class="row-chips">${chipsHtml}</div>` : ''}
      ${badgesHtml ? `<div class="badges row-badges">${badgesHtml}</div>` : ''}
      ${qrBtnHtml('card-qr--row')}
      <span class="open-affordance row-go" aria-hidden="true">${icon(openModeIcon())}</span>`;

  const iconsBody = `
      ${wrapOpen(app, activeVariant)}${markHtml(app, activeVariant, iconClass, 'app-icon')}${digitHtml}${fresh && !isTile ? `<span class="icon-new-dot" aria-hidden="true"><span class="icon-new-text">${escapeHtml(t('badgeNew'))}</span></span>` : ''}</div>
      <span class="icon-label">${escapeHtml(isTile ? loc(activeVariant.label) : title)}</span>`;

  if (iconsView) {
    el.innerHTML = `${overlayHtml}${iconsBody}${qrBtnHtml('card-qr--icon', true)}`;
    if (app.closed) el.title = app.closedReason ? `${t('badgeClosed')} — ${loc(app.closedReason)}` : t('badgeClosed');
  } else {
    el.innerHTML = `
    <div class="card-shadow" aria-hidden="true"></div>
    <div class="card-clip">
      ${overlayHtml}${surfaceHtml}${listView ? listBody : bentoBody}
    </div>
  `;
  }

  const recordLaunch = () => {
    const vi = isTile ? variantIndex : getSelectedVariantIndex(app);
    const recentId = vi >= 0 && app.variants[vi] ? `${app.id}::${app.variants[vi].id}` : app.id;
    pushRecent(recentId);
    bumpFreq(recentId);
  };
  el.addEventListener('click', (e) => {
    const launched = !!e.target.closest('.card-link-overlay');
    setTimeout(() => {
      sfx.click();
      try { localStorage.setItem('lx-last-open', app.id); } catch (err) { if (LX_DEBUG) console.warn(err); }
      if (launched && isTile) {
        try { localStorage.setItem('lx-variant-' + app.id, String(variantIndex)); } catch (err) { if (LX_DEBUG) console.warn(err); }
        invalidateGridCache();
      }
      if (launched) recordLaunch();
    }, 0);
  });
  el.addEventListener('auxclick', (e) => {
    if (e.button !== 1 || !e.target.closest('.card-link-overlay')) return;
    try { localStorage.setItem('lx-last-open', app.id); } catch (err) { if (LX_DEBUG) console.warn(err); }
    recordLaunch();
  });
  el.addEventListener('mouseenter', () => { sfx.hover(soundIndex, { octave, velocity: clamp(Math.abs(pointerVX) / 2000, 0, 1) }); setInteractionOrigin(el); });
  const setRing = (on) => {
    el.classList.toggle('is-ring', on);
    const g = el.parentElement && el.parentElement.closest('.app-grid');
    if (g) g.classList.toggle('has-ring', on || !!g.querySelector('.app-card.is-ring'));
  };
  el.addEventListener('focusin', (e) => {
    let kb = false;
    try { kb = e.target.matches(':focus-visible'); } catch (err) { kb = true; }
    el.classList.toggle('is-kb-focus', kb);
    setRing(kb && e.target.classList.contains('card-link-overlay'));
    if (kb) sfx.hover(soundIndex, { octave });
    setInteractionOrigin(el);
  });
  el.addEventListener('focusout', (e) => {
    if (!e.relatedTarget || !el.contains(e.relatedTarget)) { el.classList.remove('is-kb-focus'); setRing(false); }
  });
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') { el._pressed = true; Motion.wake(); } }, { passive: true });
  const releasePress = () => { if (el._pressed) { el._pressed = false; Motion.wake(); } };
  el.addEventListener('pointerup', releasePress, { passive: true });
  el.addEventListener('pointercancel', releasePress, { passive: true });
  el.addEventListener('pointerleave', releasePress, { passive: true });
  el.addEventListener('pointerdown', () => { el._pdAt = performance.now(); el.classList.remove('is-kb-focus'); setRing(false); }, { passive: true, capture: true });
  const qrBtn = el.querySelector('.card-qr');
  if (qrBtn) {
    qrBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      sfx.click();
      const vi = app.variants ? Number(el.dataset.variantIndex) : undefined;
      openQrForApp(app, Number.isFinite(vi) ? vi : undefined, qrBtn);
    });
  }
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const kb = (e.clientX === 0 && e.clientY === 0) || !(el._pdAt && performance.now() - el._pdAt < 2000);
    const r = el.getBoundingClientRect();
    openCardContextMenu(el, kb ? r.left + r.width / 2 : e.clientX, kb ? r.top + r.height / 2 : e.clientY, kb);
  });

  if (app.variants && !iconsView) {
    const chipsEl = el.querySelector('.variant-chips');
    const tileEl = el.querySelector('.app-icon-wrapper');
    const linkEl = el.querySelector('.card-link-overlay');

    let currentVariantIndex = variantIndex;
    const applyVariant = (i) => {
      if (i === currentVariantIndex) return;
      chipsEl.dataset.dir = i > currentVariantIndex ? 'fwd' : 'back';
      currentVariantIndex = i;
      el.dataset.variantIndex = String(i);
      const v = app.variants[i];
      if (!v) return;
      const metaEl = el.querySelector('.card-meta');
      const markEl = el.querySelector('.card-glyph');
      const vLabel = loc(v.label);
      const ariaLabel = app.closed ? `${title} — ${vLabel} — ${t('badgeClosed')}` : `${title} — ${vLabel}`;
      chipsEl.querySelectorAll('.variant-chip').forEach((chip, ci) => {
        chip.classList.toggle('is-active', ci === i);
        chip.setAttribute('aria-checked', String(ci === i));
      });
      if (!supportsAnchor) moveVariantIndicatorLegacy(chipsEl, chipsEl.querySelector('.variant-chip.is-active'), false);
      if (stackable) {
        setActiveVariant(el, String(v.id), { href: v.url, host: hostOf(v.url), label: ariaLabel, c1: tone(appGradient(app, v)[0]) });
      } else {
        linkEl.href = v.url;
        if (metaEl) { metaEl.innerHTML = cardHostMarkup(hostOf(v.url)); metaEl.title = v.url; }
        linkEl.setAttribute('aria-label', `${ariaLabel} — ${v.url}`);
        linkEl.title = v.url;
        clearTimeout(el._iconTimer);
        cancelAnimationFrame(el._iconRaf);
        const outgoing = tileEl.querySelector('.app-icon');
        if (outgoing) outgoing.style.opacity = '0';
        el._iconTimer = setTimeout(() => {
          const incoming = retileIcon(tileEl, app, v, v.icon);
          if (markEl) retileIcon(markEl, app, v, v.icon, '');
          el.style.setProperty('--c1', tone(appGradient(app, v)[0]));
          if (incoming === outgoing) {
            incoming.style.opacity = '1';
          } else {
            incoming.style.opacity = '0';
            el._iconRaf = requestAnimationFrame(() => {
              el._iconRaf = requestAnimationFrame(() => { incoming.style.opacity = '1'; });
            });
          }
        }, 120);
      }
      try { localStorage.setItem('lx-variant-' + app.id, String(i)); } catch (e) { if (LX_DEBUG) console.warn(e); }
      invalidateGridCache();
      sfx.click();
    };

    chipsEl.querySelectorAll('.variant-chip').forEach((chip, i) => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applyVariant(i);
      });
    });

    if (!supportsAnchor) {
      requestAnimationFrame(() => moveVariantIndicatorLegacy(chipsEl, chipsEl.querySelector('.variant-chip.is-active'), true));
    }
  }

  attachDestinationWarming(el.querySelector('.card-link-overlay'));

  return el;
};

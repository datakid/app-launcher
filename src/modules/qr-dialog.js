import { qrMatrix } from '../qr.js';
import { copyToClipboard, downloadBlob, escapeHtml } from './util.js';
import { categories } from './catalogue.js';
import { sfx } from './audio.js';
import { appGradient, findAppById, icon, markHtml, setIcon, wrapOpen } from './marks.js';
import { loc, t } from './i18n.js';
import { MQ, noteTile, travelTile } from './motion.js';
import { getSelectedVariantIndex } from './card.js';
import { closeContextMenu } from './context-menu.js';
import { hexBlend, tone } from './theme.js';
import { currentTabId } from './tabs.js';
import { assignHeroReturnFocus, assignPaletteSkipCloseChime, closePaletteImmediate } from './palette/view.js';

const QR_QUIET = 4;
const QR_PAPER = '#fbfaf7';
const QR_NIGHT = [10, 12, 18];
const QR_LOGO_MAX_VERSION = 8;

const qrBuild = (url) => {
  const high = qrMatrix(url, 'H');
  if (high && high.version <= QR_LOGO_MAX_VERSION) return { m: high, logo: true };
  const m = qrMatrix(url, 'Q') || qrMatrix(url, 'M');
  return m ? { m, logo: false } : null;
};

const qrLogoBox = (m) => {
  const side = (Math.round(m.n * 0.27) | 1);
  const from = Math.floor((m.n - side) / 2);
  return { from, to: from + side, side };
};

const qrInk = (hex) => ({ ink: hexBlend(hex, QR_NIGHT, 0.82), eye: hexBlend(hex, QR_NIGHT, 0.6) });

const qrCell = (x, y, tl, tr, br, bl) => {
  const R = 0.5;
  const a = tl ? R : 0;
  const b = tr ? R : 0;
  const c = br ? R : 0;
  const d = bl ? R : 0;
  return `M${x + a} ${y}H${x + 1 - b}${b ? `a${R} ${R} 0 0 1 ${R} ${R}` : ''}V${y + 1 - c}${c ? `a${R} ${R} 0 0 1 -${R} ${R}` : ''}H${x + d}${d ? `a${R} ${R} 0 0 1 -${R} -${R}` : ''}V${y + a}${a ? `a${R} ${R} 0 0 1 ${R} -${R}` : ''}z`;
};

const qrDots = (m, hidden) => {
  const n = m.n;
  const on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && m.dark(r, c) && !hidden(r, c);
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!on(r, c)) continue;
      const up = on(r - 1, c);
      const dn = on(r + 1, c);
      const lf = on(r, c - 1);
      const rt = on(r, c + 1);
      d += qrCell(c + QR_QUIET, r + QR_QUIET, !up && !lf, !up && !rt, !dn && !rt, !dn && !lf);
    }
  }
  return d;
};

const qrFinder = (x, y, ink, eye) => `<rect x="${x + 0.5}" y="${y + 0.5}" width="6" height="6" rx="1.9" fill="none" stroke="${ink}" stroke-width="1"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3" rx="1" fill="${eye}"/>`;

const qrSvgMarkup = (m, label, hex, opts = {}) => {
  const n = m.n;
  const size = n + QR_QUIET * 2;
  const { ink, eye } = qrInk(hex);
  const box = opts.logo ? qrLogoBox(m) : null;
  const inFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  const hidden = (r, c) => inFinder(r, c) || (box && r >= box.from && r < box.to && c >= box.from && c < box.to);
  const dim = opts.px ? ` width="${opts.px}" height="${opts.px}"` : '';
  const bg = opts.paper ? `<rect width="${size}" height="${size}" fill="${QR_PAPER}"/>` : '';
  const q = QR_QUIET;
  return `<svg class="qr-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"${dim} role="img" aria-label="${escapeHtml(label)}" shape-rendering="geometricPrecision">${opts.title ? `<title>${escapeHtml(opts.title)}</title><desc>${escapeHtml(opts.desc || '')}</desc>` : ''}${bg}<path d="${qrDots(m, hidden)}" fill="${ink}"/>${qrFinder(q, q, ink, eye)}${qrFinder(q + n - 7, q, ink, eye)}${qrFinder(q, q + n - 7, ink, eye)}</svg>`;
};

const qrFileBase = (s) => (String(s || 'link').toLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/gi, '-').replace(/^-+|-+$/g, '') || 'link') + '-qr';
const qrPngBlob = (svg, px = 1024, caption = null) => new Promise((resolve) => {
  const img = new Image();
  const href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  img.onload = () => {
    URL.revokeObjectURL(href);
    const pad = caption ? Math.round(px * 0.07) : 0;
    const foot = caption ? Math.round(px * 0.17) : 0;
    const cv = document.createElement('canvas');
    cv.width = px + pad * 2;
    cv.height = px + pad * 2 + foot;
    const cx = cv.getContext('2d');
    if (caption) {
      cx.fillStyle = QR_PAPER;
      cx.beginPath();
      cx.roundRect(0, 0, cv.width, cv.height, Math.round(px * 0.06));
      cx.fill();
    }
    cx.drawImage(img, pad, pad, px, px);
    if (caption) {
      cx.textAlign = 'center';
      cx.textBaseline = 'alphabetic';
      cx.direction = document.documentElement.dir === 'rtl' ? 'rtl' : 'ltr';
      const fit = (text, weight, size, color, y) => {
        let f = size;
        cx.font = `${weight} ${f}px system-ui, -apple-system, "Segoe UI", sans-serif`;
        while (cx.measureText(text).width > cv.width - pad * 2 && f > 18) { f -= 2; cx.font = `${weight} ${f}px system-ui, -apple-system, "Segoe UI", sans-serif`; }
        cx.fillStyle = color;
        cx.fillText(text, cv.width / 2, y);
      };
      fit(caption.title, 600, Math.round(px * 0.045), '#14161c', px + pad * 2 + Math.round(foot * 0.42));
      fit(caption.host, 400, Math.round(px * 0.032), '#6b6f7a', px + pad * 2 + Math.round(foot * 0.78));
    }
    cv.toBlob((b) => resolve(b), 'image/png');
  };
  img.onerror = () => { URL.revokeObjectURL(href); resolve(null); };
  img.src = href;
});

const qrExportSvg = (url, hex, px, title) => {
  const m = qrMatrix(url, 'Q') || qrMatrix(url, 'M');
  return m ? qrSvgMarkup(m, title || url, hex, { paper: true, px, desc: url, title }) : null;
};

let qrState = null;
let qrOpenedAt = 0;
let qrDownOnBackdrop = false;
let qrDrag = null;
const qrCache = new Map();

const qrUrlFor = (s) => (s.app && s.app.variants && s.app.variants[s.variantIndex] ? s.app.variants[s.variantIndex].url : s.url);

const qrBuildCached = (url) => {
  if (qrCache.has(url)) {
    const hit = qrCache.get(url);
    qrCache.delete(url);
    qrCache.set(url, hit);
    return hit;
  }
  const built = qrBuild(url);
  qrCache.set(url, built);
  if (qrCache.size > 32) qrCache.delete(qrCache.keys().next().value);
  return built;
};

const qrView = (s) => {
  const variant = s.app && s.app.variants ? s.app.variants[s.variantIndex] : null;
  const url = qrUrlFor(s);
  const title = s.app ? loc(s.app.title) : s.title;
  let host = '';
  try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) { host = ''; }
  const hex = tone(s.app ? appGradient(s.app, variant)[0] : (categories.find(c => c.id === currentTabId)?.accent || '#7c9bff'));
  return { variant, url, title, host, hex, full: variant ? `${title} — ${loc(variant.label)}` : title };
};

const qrMarkHtml = (s, variant) => (s.app
  ? `${wrapOpen(s.app, variant)}${markHtml(s.app, variant, variant ? variant.icon : s.app.icon, 'app-icon')}</div>`
  : `<div class="app-icon-wrapper">${icon('fa-qrcode', 'app-icon')}</div>`);

const qrLogoHtml = (s, variant, built) => {
  const box = qrLogoBox(built.m);
  const frac = box.side / (built.m.n + QR_QUIET * 2);
  const mark = s.app ? qrMarkHtml(s, variant) : `<div class="app-icon-wrapper">${icon('fa-link', 'app-icon')}</div>`;
  return `<span class="qr-logo" style="--qr-logo:${frac.toFixed(4)}" aria-hidden="true">${mark}</span>`;
};

const qrPlaceThumb = (animate) => {
  const track = document.getElementById('qrVariants');
  if (!track || track.hidden) return;
  const thumb = track.querySelector('.qr-thumb');
  const active = track.querySelector('.qr-variant.is-active');
  if (!thumb || !active) return;
  const rtl = document.documentElement.dir === 'rtl';
  const x = rtl ? -(track.clientWidth - active.offsetLeft - active.offsetWidth) : active.offsetLeft;
  thumb.style.transition = animate ? '' : 'none';
  thumb.style.inlineSize = `${active.offsetWidth}px`;
  thumb.style.transform = `translateX(${x}px)`;
};

const renderQrShell = () => {
  const dialog = document.getElementById('lx-qr');
  const s = qrState;
  const v = qrView(s);
  dialog.setAttribute('aria-label', `${t('actionQr')} — ${v.title}`);
  const track = document.getElementById('qrVariants');
  if (s.app && s.app.variants && s.app.variants.length > 1) {
    track.hidden = false;
    track.setAttribute('aria-label', `${t('chooseVersionOf')} ${v.title}`);
    track.innerHTML = `<span class="qr-thumb" aria-hidden="true"></span>${s.app.variants.map((x, i) => `<button type="button" role="radio" class="qr-variant${i === s.variantIndex ? ' is-active' : ''}" aria-checked="${i === s.variantIndex}" data-qr-variant="${i}">${escapeHtml(loc(x.label))}</button>`).join('')}`;
  } else {
    track.hidden = true;
    track.innerHTML = '';
  }
  const note = document.getElementById('qrNote');
  const closed = s.app && s.app.closed;
  note.hidden = !closed;
  note.textContent = closed ? (s.app.closedReason ? loc(s.app.closedReason) : t('closedReasonDefault')) : '';
  dialog.querySelector('[data-qr="share"]').hidden = typeof navigator.share !== 'function';
  dialog.querySelector('[data-qr="image"]').hidden = !(navigator.clipboard && typeof window.ClipboardItem === 'function');
  const keys = { copy: 'C', png: 'P', svg: 'S', image: 'I' };
  dialog.querySelectorAll('.qr-tools [data-qr]').forEach((b) => {
    const label = b.getAttribute('aria-label') || '';
    b.title = keys[b.dataset.qr] ? `${label} · ${keys[b.dataset.qr]}` : label;
  });
};

const renderQrCode = (swap) => {
  const dialog = document.getElementById('lx-qr');
  const s = qrState;
  const v = qrView(s);
  s.hex = v.hex;
  s.view = v;
  dialog.style.setProperty('--c1', v.hex);
  document.getElementById('qrTitle').textContent = v.full;
  document.getElementById('qrHost').textContent = v.host;
  document.getElementById('qrIcon').innerHTML = qrMarkHtml(s, v.variant);
  const urlEl = document.getElementById('qrUrl');
  urlEl.textContent = v.url;
  urlEl.title = v.url;
  const built = qrBuildCached(v.url);
  s.ok = !!built;
  const stage = document.getElementById('qrStage');
  stage.querySelectorAll('.qr-layer.is-leaving').forEach((n) => n.remove());
  const prev = stage.querySelector('.qr-layer');
  const layer = document.createElement('div');
  layer.className = 'qr-layer';
  layer.innerHTML = built
    ? `${qrSvgMarkup(built.m, `${t('actionQr')}: ${v.url}`, v.hex, { logo: built.logo })}${built.logo ? qrLogoHtml(s, v.variant, built) : ''}`
    : `<div class="qr-fail">${icon('fa-triangle-exclamation')}<span>${escapeHtml(t('qrTooLong'))}</span></div>`;
  stage.classList.toggle('is-swap', swap);
  stage.classList.toggle('is-fail', !built);
  if (prev) {
    if (swap && !MQ.reducedMotion) {
      prev.classList.add('is-leaving');
      prev.addEventListener('animationend', (e) => { if (e.target === prev) prev.remove(); });
    } else prev.remove();
  }
  stage.appendChild(layer);
  dialog.querySelectorAll('[data-qr="png"], [data-qr="svg"], [data-qr="image"]').forEach((b) => { b.disabled = !built; });
  qrPlaceThumb(swap);
  if (swap && v.variant) document.getElementById('qrLive').textContent = `${loc(v.variant.label)} — ${t('qrReady')}`;
};

export const renderQr = () => {
  if (!qrState) return;
  renderQrShell();
  renderQrCode(false);
};

const qrSetOrigin = (dialog, el) => {
  let fx = 0;
  let fy = 0;
  if (el && typeof el.getBoundingClientRect === 'function') {
    const r = el.getBoundingClientRect();
    if (r.width || r.height) {
      fx = Math.max(-40, Math.min(40, (r.left + r.width / 2 - innerWidth / 2) * 0.08));
      fy = Math.max(-40, Math.min(40, (r.top + r.height / 2 - innerHeight / 2) * 0.08));
    }
  }
  dialog.style.setProperty('--qr-fx', `${fx.toFixed(1)}px`);
  dialog.style.setProperty('--qr-fy', `${fy.toFixed(1)}px`);
};

let qrKey = '';

const openQr = (state) => {
  const dialog = document.getElementById('lx-qr');
  if (!dialog || !state) return;
  closeContextMenu();
  const pal = document.getElementById('lx-palette');
  if (pal && pal.open) {
    assignHeroReturnFocus(false);
    assignPaletteSkipCloseChime(true);
    closePaletteImmediate();
  }
  const key = `${state.url}|${state.variantIndex}`;
  const resume = !dialog.open && qrKey === key && getComputedStyle(dialog).display !== 'none';
  qrKey = key;
  qrState = { ...state, returnTo: state.returnTo || document.activeElement };
  if (!resume) {
    renderQrShell();
    renderQrCode(false);
  }
  qrSetOrigin(dialog, qrState.returnTo);
  dialog.style.translate = '';
  qrOpenedAt = performance.now();
  if (!dialog.open) {
    dialog.showModal();
    sfx.veil(true);
  }
  document.body.classList.add('qr-open');
  qrPlaceThumb(false);
  if (!resume && qrState.app) travelTile(document.getElementById('qrIcon'), qrState.returnTo?.closest?.('.app-card')?.querySelector('.app-icon-wrapper'));
  dialog.querySelector('[data-qr="copy"]')?.focus({ preventScroll: true });
};

export const closeQr = () => {
  const dialog = document.getElementById('lx-qr');
  if (!dialog || !dialog.open) return;
  const back = qrState && qrState.returnTo;
  sfx.veil(false);
  dialog.style.translate = '';
  dialog.close();
  document.body.classList.remove('qr-open');
  qrState = null;
  if (back && back.isConnected && typeof back.focus === 'function') back.focus({ preventScroll: true });
};

export const openQrForApp = (app, variantIndex, returnTo) => {
  if (!app) return;
  const vi = app.variants ? (Number.isInteger(variantIndex) && app.variants[variantIndex] ? variantIndex : getSelectedVariantIndex(app)) : -1;
  openQr({ app, variantIndex: vi, url: app.url, returnTo });
};

export const openQrForSite = () => openQr({ app: null, variantIndex: -1, title: 'LinkExpress', url: `${location.origin}${location.pathname}${currentTabId ? '#' + currentTabId : ''}` });

export const openQrFromPalette = (entry) => {
  const parentId = entry.app.parentId || entry.app.id;
  const realApp = categories.flatMap(c => c.apps).find(a => a.id === parentId);
  const vi = entry.app.parentId ? entry.app.variantIndex : undefined;
  const back = document.querySelector(`#appGrid .app-card[data-app-id="${CSS.escape(parentId)}"] .card-link-overlay`);
  assignHeroReturnFocus(false);
  assignPaletteSkipCloseChime(true);
  noteTile(document.querySelector('#paletteDetail .app-icon-wrapper'));
  closePaletteImmediate();
  requestAnimationFrame(() => {
    if (realApp) openQrForApp(realApp, vi, back);
    else openQr({ app: null, variantIndex: -1, title: loc(entry.app.title), url: entry.app.url, returnTo: back });
  });
};

export const openQrFromUrl = () => {
  const params = new URLSearchParams(location.search);
  const id = params.get('qr');
  if (!id) return;
  let frames = 0;
  const attempt = () => {
    const app = findAppById(id);
    if (app) {
      const vid = params.get('v');
      const vi = app.variants && vid ? app.variants.findIndex((x) => x.id === vid) : -1;
      openQrForApp(app, vi >= 0 ? vi : undefined);
      return;
    }
    if (++frames < 240) requestAnimationFrame(attempt);
  };
  requestAnimationFrame(attempt);
};

const qrSelectVariant = (i) => {
  const dialog = document.getElementById('lx-qr');
  qrState.variantIndex = i;
  dialog.querySelectorAll('[data-qr-variant]').forEach((b) => {
    const on = Number(b.dataset.qrVariant) === i;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-checked', String(on));
  });
  renderQrCode(true);
};

export const initQrDialog = () => {
  const dialog = document.getElementById('lx-qr');
  if (!dialog) return;
  const outside = (e) => {
    const r = dialog.getBoundingClientRect();
    return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
  };
  document.getElementById('qrClose')?.addEventListener('click', closeQr);
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); closeQr(); });
  dialog.addEventListener('close', () => {
    document.body.classList.remove('qr-open');
    qrState = null;
  });
  dialog.addEventListener('pointerdown', (e) => { qrDownOnBackdrop = e.target === dialog && outside(e); });
  const grab = document.getElementById('qrGrab');
  const phone = window.matchMedia('(max-width: 640px)');
  if (grab) {
    grab.addEventListener('pointerdown', (e) => {
      if (!phone.matches) return;
      grab.setPointerCapture(e.pointerId);
      qrDrag = { y: e.clientY, t: e.timeStamp, dy: 0 };
      dialog.classList.add('is-dragging');
    });
    grab.addEventListener('pointermove', (e) => {
      if (!qrDrag) return;
      qrDrag.dy = Math.max(0, e.clientY - qrDrag.y);
      dialog.style.translate = `0 ${qrDrag.dy}px`;
    });
    const endDrag = (e) => {
      if (!qrDrag) return;
      const d = qrDrag;
      qrDrag = null;
      dialog.classList.remove('is-dragging');
      const speed = d.dy / Math.max(1, e.timeStamp - d.t);
      if (d.dy > 80 || speed > 0.5) closeQr();
      else dialog.style.translate = '';
    };
    grab.addEventListener('pointerup', endDrag);
    grab.addEventListener('pointercancel', endDrag);
  }
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) {
      if (performance.now() - qrOpenedAt < 250 || !qrDownOnBackdrop) return;
      if (outside(e)) closeQr();
      return;
    }
    const vb = e.target.closest('[data-qr-variant]');
    if (vb && qrState) {
      const i = Number(vb.dataset.qrVariant);
      if (i === qrState.variantIndex) return;
      sfx.click();
      qrSelectVariant(i);
      return;
    }
    const btn = e.target.closest('[data-qr]');
    if (!btn || !qrState || btn.disabled) return;
    const url = qrUrlFor(qrState);
    const kind = btn.dataset.qr === 'copy-url' ? 'copy' : btn.dataset.qr;
    const fb = kind === 'copy' ? dialog.querySelector('[data-qr="copy"]') : btn;
    const label = fb.querySelector('.qr-action-label');
    const flash = (ok, text) => {
      if (!label) return;
      const prev = label.dataset.rest || label.textContent;
      label.dataset.rest = prev;
      const svg = fb.querySelector('svg');
      const prevIcon = (svg.getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('fa-'));
      setIcon(svg, ok ? 'fa-check' : 'fa-triangle-exclamation');
      label.textContent = text;
      label.classList.remove('is-flash');
      void label.offsetWidth;
      label.classList.add('is-flash');
      clearTimeout(fb._qrFlash);
      fb._qrFlash = setTimeout(() => {
        if (!fb.isConnected) return;
        setIcon(svg, prevIcon === 'fa-check' || prevIcon === 'fa-triangle-exclamation' ? fb.dataset.icon : prevIcon);
        label.textContent = prev;
        label.classList.remove('is-flash');
      }, 1400);
    };
    if (!fb.dataset.icon) fb.dataset.icon = (fb.querySelector('svg').getAttribute('class') || '').split(/\s+/).find((c) => c.startsWith('fa-'));
    const name = qrFileBase(qrState.app ? qrState.app.id : 'linkexpress');
    const v = qrState.view;
    const caption = e.altKey ? null : { title: v.full, host: v.host };
    if (kind === 'copy') {
      copyToClipboard(url).then((ok) => { sfx.click(); flash(ok, ok ? t('linkCopied') : t('copyFailed')); });
    } else if (kind === 'png' || kind === 'image') {
      const svg = qrExportSvg(url, qrState.hex, 1024, v.full);
      if (!svg) return;
      const png = qrPngBlob(svg, 1024, caption).then((b) => (b ? b : Promise.reject(new Error('png'))));
      if (kind === 'png') png.then((b) => { downloadBlob(b, `${name}.png`); flash(true, t('qrSaved')); }, () => flash(false, t('copyFailed')));
      else navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]).then(() => { sfx.click(); flash(true, t('qrImageCopied')); }, () => flash(false, t('copyFailed')));
    } else if (kind === 'svg') {
      const svg = qrExportSvg(url, qrState.hex, undefined, v.full);
      if (!svg) return;
      downloadBlob(new Blob([svg], { type: 'image/svg+xml' }), `${name}.svg`);
      flash(true, t('qrSaved'));
    } else if (kind === 'share') {
      navigator.share({ title: v.full, url }).catch(() => {});
    }
  });
  dialog.addEventListener('keydown', (e) => {
    const vb = e.target.closest && e.target.closest('[data-qr-variant]');
    if (vb && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      const all = [...dialog.querySelectorAll('[data-qr-variant]')];
      const fwd = (e.key === 'ArrowRight') !== (document.documentElement.dir === 'rtl');
      const next = all[(all.indexOf(vb) + (fwd ? 1 : all.length - 1)) % all.length];
      e.preventDefault();
      next.click();
      next.focus({ preventScroll: true });
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey || !qrState) return;
    const kind = { c: 'copy', s: 'svg', p: 'png', i: 'image' }[String(e.key).toLowerCase()];
    if (!kind) return;
    const b = dialog.querySelector(`[data-qr="${kind}"]`);
    if (b && !b.hidden && !b.disabled) {
      e.preventDefault();
      b.click();
    }
  });
};

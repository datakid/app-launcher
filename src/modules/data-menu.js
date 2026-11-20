import { LX_DEBUG, escapeHtml } from './util.js';
import { IMPORT_ERRORS, LIMITS, USER_CAT_ID, USER_LINKS_KEY, baseCatalog, categories, cleanCatalog, cleanUserLinks, composeCategories, fail, fmt, isObj, readUserLinks, rebuildCatalogUI } from './catalogue.js';
import { sfx } from './audio.js';
import { icon } from './marks.js';
import { assignLang, lang, t } from './i18n.js';
import { OPEN_MODES, setOpenMode } from './open.js';
import { Motion } from './motion.js';
import { getSelectedVariantIndex } from './card.js';
import { assignPointerFieldDirty } from './pointer-field.js';
import { buildContextMenu, closeContextMenu, contextMenuAC, contextMenuEl, placeContextMenu, showContextMenu } from './context-menu.js';
import { invalidateGridCache } from './grid.js';
import { CORNERS, PALETTES, VIEWS, applyTheme, setCornersMode, setPaletteMode, setViewMode } from './theme.js';
import { setSoundEnabled } from './controls.js';
import { applyI18n } from './i18n-apply.js';
import { setZenMode } from './zen.js';
import { showToast } from './toast.js';

const applyImportedPrefs = (p) => {
  if (!isObj(p)) return;
  invalidateGridCache();
  try {
    if (p.sound === '0' || p.sound === '1') {
      localStorage.setItem('lx-sound', p.sound);
      setSoundEnabled(p.sound === '1');
      if (sfx.enabled) sfx.resume();
    }
    if (isObj(p.variants)) {
      categories.forEach(c => c.apps.forEach((a) => {
        if (!a.variants || !Object.prototype.hasOwnProperty.call(p.variants, a.id)) return;
        const i = p.variants[a.id];
        if (Number.isInteger(i) && a.variants[i]) localStorage.setItem('lx-variant-' + a.id, String(i));
      }));
    }
    if (p.theme === 'light' || p.theme === 'dark') applyTheme(p.theme);
    if (PALETTES.includes(p.palette)) setPaletteMode(p.palette, { silent: true });
    if (CORNERS.includes(p.corners)) setCornersMode(p.corners, { silent: true });
    const importedView = p.view;
    if (VIEWS.includes(importedView) && !document.documentElement.dataset.viewLocked) setViewMode(importedView, { silent: true });
    if (OPEN_MODES.includes(p.open)) setOpenMode(p.open);
    if (p.zen === '0' || p.zen === '1') {
      localStorage.setItem('lx-zen', p.zen);
      setZenMode(p.zen === '1');
    }
    if ((p.lang === 'ar' || p.lang === 'en') && p.lang !== lang) {
      assignLang(p.lang);
      localStorage.setItem('lx-lang', lang);
      applyI18n({ rebuild: false });
    }
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

const pickFile = () => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.hidden = true;
  const done = (file) => { input.remove(); resolve(file); };
  input.addEventListener('change', () => done(input.files && input.files[0] ? input.files[0] : null), { once: true });
  input.addEventListener('cancel', () => done(null), { once: true });
  document.body.appendChild(input);
  input.click();
});

export let confirmationPending = false;
const confirmDialog = ({ title, body, confirmLabel, cancelLabel = t('confirmCancel'), danger = false }) => {
  if (confirmationPending) return Promise.resolve(false);
  confirmationPending = true;
  const previousFocus = document.activeElement;
  const dialog = document.createElement('dialog');
  dialog.id = 'lx-confirm';
  dialog.setAttribute('aria-labelledby', 'lx-confirm-title');
  dialog.setAttribute('aria-describedby', 'lx-confirm-body');
  const heading = document.createElement('h2');
  heading.id = 'lx-confirm-title';
  heading.textContent = title;
  const description = document.createElement('p');
  description.id = 'lx-confirm-body';
  description.textContent = body;
  const actions = document.createElement('div');
  actions.className = 'confirm-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.dataset.confirmAction = 'cancel';
  cancel.textContent = cancelLabel;
  cancel.autofocus = true;
  const confirm = document.createElement('button');
  confirm.type = 'button';
  confirm.dataset.confirmAction = 'confirm';
  confirm.className = danger ? 'is-danger' : 'is-primary';
  confirm.textContent = confirmLabel;
  actions.append(cancel, confirm);
  dialog.append(heading, description, actions);
  document.body.appendChild(dialog);
  return new Promise(resolve => {
    let accepted = false;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      confirmationPending = false;
      dialog.remove();
      assignPointerFieldDirty(true);
      Motion.wake();
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(accepted);
    };
    const close = value => { if (!dialog.open) return; accepted = value; dialog.close(); };
    cancel.addEventListener('click', () => close(false));
    confirm.addEventListener('click', () => close(true));
    dialog.addEventListener('cancel', e => { e.preventDefault(); close(false); });
    dialog.addEventListener('close', finish, { once: true });
    dialog.addEventListener('keydown', e => {
      e.stopPropagation();
      if (e.key !== 'Tab') return;
      const stops = [cancel, confirm];
      const at = stops.indexOf(document.activeElement);
      const next = at === -1 ? 0 : (at + (e.shiftKey ? stops.length - 1 : 1)) % stops.length;
      e.preventDefault();
      stops[next].focus({ preventScroll: true });
    });
    const outside = e => {
      const r = dialog.getBoundingClientRect();
      return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
    };
    let backdropPress = false;
    dialog.addEventListener('pointerdown', e => { backdropPress = e.target === dialog && outside(e); });
    dialog.addEventListener('click', e => { if (backdropPress && e.target === dialog && outside(e)) close(false); backdropPress = false; });
    try {
      dialog.showModal();
      cancel.focus({ preventScroll: true });
      Motion.wake();
    } catch (e) {
      if (LX_DEBUG) console.warn(e);
      finish();
    }
  });
};

export const importUserLinks = async () => {
  const file = await pickFile();
  if (!file) return;
  try {
    if (file.size > LIMITS.fileBytes) fail('importTooLarge');
    let raw;
    try { raw = JSON.parse((await file.text()).replace(/^\ufeff/, '')); } catch (e) { fail('importInvalid'); }
    const { links, skipped } = cleanUserLinks(raw);
    const prefs = isObj(raw) && isObj(raw.prefs) ? raw.prefs : null;
    if (!links.length && !prefs) fail('importEmpty');
    if (links.length) {
      const beforeConfirm = localStorage.getItem(USER_LINKS_KEY);
      const current = readUserLinks().length;
      const question = current
        ? fmt('importConfirm', { n: links.length, m: current })
        : fmt('importConfirmNew', { n: links.length });
      if (!await confirmDialog({ title: t('dataImport'), body: question, confirmLabel: t('confirmImport') })) return;
      if (localStorage.getItem(USER_LINKS_KEY) !== beforeConfirm) { showToast(t('dataChanged'), true); return; }
      try { localStorage.setItem(USER_LINKS_KEY, JSON.stringify(links)); } catch (e) { fail('storageFailed'); }
    }
    if (prefs) applyImportedPrefs(prefs);
    composeCategories();
    rebuildCatalogUI(links.length ? USER_CAT_ID : undefined);
    const note = skipped ? ` ${fmt('importSkipped', { n: skipped })}` : '';
    showToast((links.length ? fmt('importDone', { n: links.length }) : t('importPrefsDone')) + note);
    sfx.arpUp();
  } catch (e) {
    const key = IMPORT_ERRORS.includes(e && e.message) ? e.message : 'importInvalid';
    const n = { importTooLarge: LIMITS.fileBytes / 1024, importTooMany: LIMITS.userLinks }[key] ?? '';
    showToast(fmt(key, { n }), true);
  }
};

export const exportUserData = () => {
  const prefs = { variants: {} };
  try {
    ['theme', 'lang', 'sound', 'zen', 'palette', 'corners', 'view', 'open'].forEach((k) => { const v = localStorage.getItem('lx-' + k); if (v !== null) prefs[k] = v; });
  } catch (e) { if (LX_DEBUG) console.warn(e); }
  categories.forEach(c => c.apps.forEach((a) => {
    if (!a.variants) return;
    let stored = null;
    try { stored = localStorage.getItem('lx-variant-' + a.id); } catch (e) { if (LX_DEBUG) console.warn(e); }
    if (stored !== null) prefs.variants[a.id] = getSelectedVariantIndex(a);
  }));
  const links = readUserLinks().map(({ title, url, icon: ic, gradient }) => ({ title, url, icon: ic, color: gradient[0] }));
  const base = { app: 'linkexpress', version: 1, exportedAt: new Date().toISOString(), links, prefs };
  let body = JSON.stringify(base, null, 2);
  let catalog = null;
  try { catalog = cleanCatalog({ categories: baseCatalog }); } catch (e) { if (LX_DEBUG) console.warn(e); }
  if (catalog) {
    const withCatalog = JSON.stringify({ ...base, catalog }, null, 2);
    if (new Blob([withCatalog]).size <= LIMITS.fileBytes) body = withCatalog;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([body], { type: 'application/json' }));
  a.download = `linkexpress-${new Date().toISOString().slice(0, 10)}.json`;
  a.hidden = true;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  showToast(t('exportDone'));
};

const resetUserLinks = async () => {
  let beforeConfirm;
  try { beforeConfirm = localStorage.getItem(USER_LINKS_KEY); } catch (e) { showToast(t('storageFailed'), true); return; }
  if (!await confirmDialog({ title: t('dataReset'), body: t('resetConfirm'), confirmLabel: t('confirmRemove'), danger: true })) return;
  try {
    if (localStorage.getItem(USER_LINKS_KEY) !== beforeConfirm) { showToast(t('dataChanged'), true); return; }
  } catch (e) { showToast(t('storageFailed'), true); return; }
  try { localStorage.removeItem(USER_LINKS_KEY); } catch (e) { showToast(t('storageFailed'), true); return; }
  composeCategories();
  rebuildCatalogUI();
  showToast(t('resetDone'));
};

export const updateDataButtonLabel = () => {
  const btn = document.getElementById('dataToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', t('dataMenu'));
  btn.title = t('dataMenu');
};

const openDataMenu = (btn, focusFirst) => {
  closeContextMenu();
  const menu = buildContextMenu();
  const items = [['import', 'fa-box-open', 'dataImport'], ['export', 'fa-file-lines', 'dataExport']];
  if (categories.some(c => c.id === USER_CAT_ID)) items.push(['reset', 'fa-triangle-exclamation', 'dataReset']);
  menu.innerHTML = items.map(([id, ic, key]) =>
    `<button type="button" role="menuitem" data-data-action="${id}">${icon(ic)}${escapeHtml(t(key))}</button>`).join('');
  const run = { import: importUserLinks, export: exportUserData, reset: resetUserLinks };
  menu.dataset.owner = 'data';
  btn.setAttribute('aria-expanded', 'true');
  const pad = 8;
  const r = btn.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const rtl = document.documentElement.dir === 'rtl';
  const x = rtl ? r.right - w : r.left;
  const y = r.bottom + pad + h <= window.innerHeight - pad ? r.bottom + pad : r.top - h - pad;
  placeContextMenu(menu, x, y);
  showContextMenu(menu, { anchor: btn, returnTo: btn, focusFirst });
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-data-action]');
    if (!b || !run[b.dataset.dataAction]) return;
    sfx.click();
    closeContextMenu();
    run[b.dataset.dataAction]();
  }, { signal: contextMenuAC.signal });
};

export const initDataMenu = () => {
  const btn = document.getElementById('dataToggle');
  if (!btn) return;
  let viaKeyboard = false;
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') viaKeyboard = true;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); sfx.click(); openDataMenu(btn, true); }
  });
  btn.addEventListener('click', (e) => {
    const kb = viaKeyboard || e.detail === 0;
    viaKeyboard = false;
    if (contextMenuEl && contextMenuEl.classList.contains('is-open') && contextMenuEl.dataset.owner === 'data') {
      closeContextMenu();
      return;
    }
    sfx.click();
    openDataMenu(btn, kb);
  });
  window.addEventListener('storage', (e) => {
    if (e.key !== USER_LINKS_KEY && e.key !== null) return;
    composeCategories();
    rebuildCatalogUI();
  });
};

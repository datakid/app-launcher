import { cycle, escapeHtml } from '../util.js';
import { categories, hardRefreshCatalog } from '../catalogue.js';
import { sfx } from '../audio.js';
import { STRINGS, lang } from '../i18n.js';
import { openModeIcon, otherOpenMode, setOpenMode } from '../open.js';
import { CORNERS, PALETTES, PALETTE_SWATCHES, VIEWS, VIEW_ICONS, cornersMode, isLightTheme, paletteMode, setCornersMode, setPaletteMode, setViewMode, viewMode } from '../theme.js';
import { isMacPlatform } from '../i18n-apply.js';
import { activateTab, currentTabId } from '../tabs.js';
import { closePaletteImmediate, paletteBusy, requestClosePalette } from './view.js';
import { openQrForSite } from '../qr-dialog.js';
import { exportUserData, importUserLinks } from '../data-menu.js';

const CMD_CAT = { id: '_cmd', label: STRINGS.commandsGroup };

export const commandEntries = () => {
  const zen = document.body.classList.contains('is-zen');
  const cmd = (id, title, iconName, accent, run, kbd = '') => ({
    app: { id: 'cmd-' + id, title, icon: iconName, gradient: [accent], command: true, run, kbd },
    cat: CMD_CAT
  });
  const press = (id) => () => document.getElementById(id)?.click();
  const list = [
    cmd('theme', isLightTheme ? STRINGS.themeToDark : STRINGS.themeToLight, isLightTheme ? 'fa-moon' : 'fa-sun', '#c6a04e', press('themeToggle')),
    cmd('lang', lang === 'ar' ? STRINGS.langSwitchToEn : STRINGS.langSwitchToAr, 'fa-language', '#3ea88d', press('langToggle')),
    cmd('zen', zen ? STRINGS.zenExit : STRINGS.zenEnter, zen ? 'fa-compress' : 'fa-expand', '#8f7ae8', press('zenToggle'), 'Alt+Z'),
    cmd('sound', sfx.enabled ? STRINGS.soundMute : STRINGS.soundEnable, sfx.enabled ? 'fa-volume-mute' : 'fa-volume-up', '#5e8df0', press('soundToggle')),
  ];
  const nextOpen = otherOpenMode();
  list.push(cmd('open-mode', {
    ar: STRINGS.cmdOpenMode.ar.replace('{m}', STRINGS['openMode_' + nextOpen].ar),
    en: STRINGS.cmdOpenMode.en.replace('{m}', STRINGS['openMode_' + nextOpen].en)
  }, openModeIcon(nextOpen), '#5aa9a0', () => setOpenMode(nextOpen, { silent: false }), 'Alt+O'));
  const curP = paletteMode(), curC = cornersMode(), curV = viewMode();
  PALETTES.forEach((p) => {
    if (p === curP) return;
    list.push(cmd('palette-' + p, {
      ar: `${STRINGS.lookColors.ar}: ${STRINGS['palette_' + p].ar}`,
      en: `${STRINGS.lookColors.en}: ${STRINGS['palette_' + p].en}`
    }, 'fa-sliders', PALETTE_SWATCHES[p][0], () => setPaletteMode(p), p === cycle(PALETTES, curP) ? 'Alt+P' : ''));
  });
  CORNERS.forEach((c) => {
    if (c === curC) return;
    list.push(cmd('corners-' + c, {
      ar: `${STRINGS.lookCorners.ar}: ${STRINGS['corners_' + c].ar}`,
      en: `${STRINGS.lookCorners.en}: ${STRINGS['corners_' + c].en}`
    }, 'fa-clone', '#8a93a6', () => setCornersMode(c), c === cycle(CORNERS, curC) ? 'Alt+R' : ''));
  });
  const nextView = cycle(VIEWS, curV);
  list.push(cmd('view', STRINGS.cmdSwitchView, VIEW_ICONS[nextView], '#8a93a6', () => setViewMode(nextView, { silent: false }), 'Alt+V'));
  categories.forEach((c) => {
    if (c.id === currentTabId) return;
    const label = c.label || {};
    list.push(cmd('tab-' + c.id, {
      ar: `${STRINGS.cmdGoTo.ar} ${label.ar ?? label.en ?? ''}`,
      en: `${STRINGS.cmdGoTo.en} ${label.en ?? label.ar ?? ''}`
    }, c.icon, c.accent || '#7c9bff', () => activateTab(c.id)));
  });
  list.push(cmd('share-site', STRINGS.cmdShareSite, 'fa-qrcode', '#6d8cff', () => openQrForSite(), 'Alt+Q'));
  list.push(cmd('refresh', STRINGS.refreshCatalog, 'fa-rotate-right', '#22c1a4', () => hardRefreshCatalog()));
  list.push(cmd('import', STRINGS.dataImport, 'fa-box-open', '#cf8350', () => importUserLinks()));
  list.push(cmd('export', STRINGS.dataExport, 'fa-file-lines', '#4aa5c5', () => exportUserData()));
  return list;
};

const keyGlyph = (k) => {
  const mac = isMacPlatform();
  if (k === 'Enter') return '↵';
  if (k === 'Shift') return mac ? '⇧' : 'Shift';
  if (k === 'Alt') return mac ? '⌥' : 'Alt';
  if (k === 'Ctrl/Cmd') return mac ? '⌘' : 'Ctrl';
  return k;
};

export const keycapsHtml = (combo) => combo ? combo.split('+').map((k) => `<kbd>${escapeHtml(keyGlyph(k))}</kbd>`).join('') : '';

export const runCommand = (entry) => {
  const dialog = document.getElementById('lx-palette');
  const go = () => requestAnimationFrame(() => entry.app.run());
  if (!dialog.open) { go(); return; }
  dialog.addEventListener('close', go, { once: true });
  if (paletteBusy) closePaletteImmediate(); else requestClosePalette();
};

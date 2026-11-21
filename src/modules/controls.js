import { LX_DEBUG } from './util.js';
import { hardRefreshCatalog } from './catalogue.js';
import { sfx } from './audio.js';
import { setIcon } from './marks.js';
import { assignLang, lang, t } from './i18n.js';
import { isLightTheme, withCrossfade } from './theme.js';
import { applyI18n } from './i18n-apply.js';
import { toggleZenMode } from './zen.js';

const getStoredSound = () => {
  try { return localStorage.getItem('lx-sound'); } catch (e) { return null; }
};

export const applyStoredSoundPref = () => {
  if (getStoredSound() !== '1') return;
  sfx.enabled = true;
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', 'true');
  setIcon(btn.querySelector('svg'), 'fa-volume-up');
  updateSoundButtonLabel();
};
export const updateThemeButtonLabel = () => {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  const label = isLightTheme ? t('themeToDark') : t('themeToLight');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
};

export const updateSoundButtonLabel = () => {
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  const label = sfx.enabled ? t('soundMute') : t('soundEnable');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
};

export const updateLangButtonLabel = () => {
  const btn = document.getElementById('langToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(lang === 'en'));
  const label = lang === 'ar' ? t('langSwitchToEn') : t('langSwitchToAr');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
};

export const updateZenButtonLabel = () => {
  const btn = document.getElementById('zenToggle');
  if (!btn) return;
  const zen = document.body.classList.contains('is-zen');
  btn.setAttribute('aria-pressed', String(zen));
  const label = zen ? t('zenExit') : t('zenEnter');
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  setIcon(btn.querySelector('svg'), zen ? 'fa-compress' : 'fa-expand');
};
export const updateRefreshButtonLabel = () => {
  const btn = document.getElementById('refreshToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', t('refreshCatalog'));
  btn.title = t('refreshCatalog');
};

export const setSoundEnabled = (on) => {
  sfx.enabled = on;
  const btn = document.getElementById('soundToggle');
  if (!btn) return;
  btn.setAttribute('aria-pressed', String(on));
  setIcon(btn.querySelector('svg'), on ? 'fa-volume-up' : 'fa-volume-mute');
  updateSoundButtonLabel();
};
export const initRefreshButton = () => {
  const btn = document.getElementById('refreshToggle');
  if (!btn) return;
  updateRefreshButtonLabel();
  btn.addEventListener('click', () => { sfx.click(); hardRefreshCatalog(); });
};

export const initSoundResume = () => {
  if (sfx.enabled) {
    const resumeOnGesture = () => { sfx.resume(); };
    ['pointerdown', 'keydown'].forEach(evt => document.addEventListener(evt, resumeOnGesture, { once: true, capture: true }));
  }
};

export const initControlToggles = () => {
  const soundBtn = document.getElementById('soundToggle');
  soundBtn.addEventListener('click', async () => {
    await sfx.resume();
    sfx.enabled = !sfx.enabled;
    try { localStorage.setItem('lx-sound', sfx.enabled ? '1' : '0'); } catch (e) { if (LX_DEBUG) console.warn(e); }
    soundBtn.setAttribute('aria-pressed', String(sfx.enabled));
    updateSoundButtonLabel();
    setIcon(soundBtn.querySelector('svg'), sfx.enabled ? 'fa-volume-up' : 'fa-volume-mute');
    if (sfx.enabled) sfx.arpUp();
  });

  const langBtn = document.getElementById('langToggle');
  langBtn.addEventListener('click', () => {
    assignLang(lang === 'ar' ? 'en' : 'ar');
    try { localStorage.setItem('lx-lang', lang); } catch (e) { if (LX_DEBUG) console.warn(e); }
    sfx.click();
    withCrossfade(() => applyI18n());
  });

  const zenBtn = document.getElementById('zenToggle');
  zenBtn.addEventListener('click', () => {
    sfx.click();
    toggleZenMode();
  });
};

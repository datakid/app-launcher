import { LX_DEBUG } from './util.js';
import { paletteActiveIndex, paletteItems } from './palette/view.js';

const warmedOrigins = new Set();
const MAX_WARMED_ORIGINS = 6;

const warmOrigin = (url) => {
  if (!url || warmedOrigins.size >= MAX_WARMED_ORIGINS) return;
  let origin;
  try {
    origin = new URL(url, window.location.href).origin;
  } catch (e) {
    return;
  }
  if (warmedOrigins.has(origin)) return;
  warmedOrigins.add(origin);
  try {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = origin;
    document.head.appendChild(link);
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

export const attachDestinationWarming = (linkEl) => {
  if (!linkEl) return;
  let warmDwellTimer = null;
  linkEl.addEventListener('pointerenter', (e) => {
    if (e.pointerType === 'touch') return;
    warmDwellTimer = setTimeout(() => warmOrigin(linkEl.href), 120);
  });
  linkEl.addEventListener('pointerleave', () => { clearTimeout(warmDwellTimer); });
  linkEl.addEventListener('focusin', () => warmOrigin(linkEl.href));
};

let paletteWarmTimer = null;
export const scheduleWarmActiveEntry = () => {
  clearTimeout(paletteWarmTimer);
  const entry = paletteItems[paletteActiveIndex];
  if (!entry) return;
  paletteWarmTimer = setTimeout(() => warmOrigin(entry.app.url), 120);
};

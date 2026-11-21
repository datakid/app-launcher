import { LX_DEBUG } from './util.js';

const SCHEMA = 2;
const LEGACY_IDS = {
  'خارجي 2': 'ledger-form',
  'خارجي 0': 'parser',
  'مجموعات دوائية': 'workspace',
  'لستة الادوية': 'drug-list',
  'المنفذ والتحمل': 'paid-calculator',
  'بروتوكولات الصرف': 'protocols',
  'فهرس الادوية': 'index-builder',
  'الرقم القومي والتاريخ': 'id-dates',
  'عائد الاستثمار': 'roi',
  'تحليل البيانات': 'data-analysis',
  'بيان جهات متعاقدة': 'entity-tracker',
  'تقارير': 'to-do',
  'دفتر الحركة': 'dafter',
  'قسمة العوائد': 'qisma-mizan'
};

(function migrate() {
  try {
    if (Number(localStorage.getItem('lx-schema')) >= SCHEMA) return;
    for (const [ar, id] of Object.entries(LEGACY_IDS)) {
      const v = localStorage.getItem('lx-variant-' + ar);
      if (v !== null) {
        localStorage.setItem('lx-variant-' + id, v);
        localStorage.removeItem('lx-variant-' + ar);
      }
    }
    const recents = JSON.parse(localStorage.getItem('lx-recents') || '[]');
    if (Array.isArray(recents)) {
      localStorage.setItem('lx-recents',
        JSON.stringify(recents.map(tt => LEGACY_IDS[tt] || tt).filter(x => typeof x === 'string')));
    }
    localStorage.setItem('lx-schema', String(SCHEMA));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
})();
try { localStorage.removeItem('lx-unlocked-secrets'); } catch (e) { if (LX_DEBUG) console.warn(e); }
const RECENTS_KEY = 'lx-recents';
const RECENTS_CAP = 8;
const FREQ_KEY = 'lx-freq';
const FREQ_CAP = 10;

const getRecentIds = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(RECENTS_KEY) || '[]');
    return Array.isArray(stored) ? stored : [];
  } catch (e) { return []; }
};

export const pushRecent = (id) => {
  try {
    const list = getRecentIds().filter(x => x !== id);
    list.unshift(id);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(list.slice(0, RECENTS_CAP)));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

export const getFreqMap = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(FREQ_KEY) || '{}');
    return stored && typeof stored === 'object' ? stored : {};
  } catch (e) { return {}; }
};

export const bumpFreq = (id) => {
  try {
    const map = getFreqMap();
    map[id] = (map[id] || 0) + 1;
    localStorage.setItem(FREQ_KEY, JSON.stringify(map));
  } catch (e) { if (LX_DEBUG) console.warn(e); }
};

export const recentScores = () => {
  const ids = getRecentIds();
  const freq = getFreqMap();
  const scores = new Map();
  new Set([...ids, ...Object.keys(freq)]).forEach(id => {
    const pos = ids.indexOf(id);
    const recencyScore = pos === -1 ? 0 : (RECENTS_CAP - pos) / RECENTS_CAP;
    const freqScore = Math.min(freq[id] || 0, FREQ_CAP) / FREQ_CAP;
    scores.set(id, recencyScore * 0.6 + freqScore * 0.4);
  });
  return scores;
};

export const getRecentEntries = (allEntries, limit) => {
  const byId = new Map();
  allEntries.forEach(e => { if (!byId.has(e.app.id)) byId.set(e.app.id, e); });
  allEntries.forEach(e => { if (e.app.parentId && !byId.has(e.app.parentId)) byId.set(e.app.parentId, e); });

  const scored = [];
  recentScores().forEach((score, id) => {
    const e = byId.get(id);
    if (e) scored.push({ entry: e, score });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(s => s.entry);
};

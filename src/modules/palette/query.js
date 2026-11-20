import { buildIndex, flattenCatalogue, search } from '../../search.js';
import { escapeHtml } from '../util.js';
import { categories, paletteGroups } from '../catalogue.js';
import { isFresh } from '../card.js';

export const normalizeAr = (s) => s.toLowerCase()
  .replace(/[\u200c\u200f\u202b\u202c]/g, '')
  .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
  .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي')
  .replace(/[ةه]/g, 'ه').replace(/[ؤئ]/g, 'ء')
  .replace(/\s+/g, ' ').trim();

export const normMap = (s) => {
  let out = '', map = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i].toLowerCase();
    if (/[\u200c\u200f\u202b\u202c\u064B-\u0652\u0670\u0640]/.test(c)) continue;
    c = c.replace(/[أإآٱ]/, 'ا').replace(/ى/, 'ي').replace(/[ةه]/, 'ه').replace(/[ؤئ]/, 'ء');
    out += c; map.push(i);
  }
  return { out, map };
};

export const highlightTitle = (title, query) => {
  const nq = normalizeAr(query);
  if (!nq) return escapeHtml(title);
  const { out, map } = normMap(title);
  const hits = new Set();

  const i = out.indexOf(nq);
  if (i >= 0) {
    for (let k = i; k < i + nq.length; k++) hits.add(map[k]);
  } else {
    let qi = 0;
    for (let k = 0; k < out.length && qi < nq.length; k++) {
      if (out[k] === nq[qi]) { hits.add(map[k]); qi++; }
    }
    if (qi < nq.length) return escapeHtml(title);
  }

  let out2 = '';
  let i2 = 0;
  while (i2 < title.length) {
    if (hits.has(i2)) {
      let j = i2;
      while (j < title.length && hits.has(j)) j++;
      out2 += `<mark>${escapeHtml(title.slice(i2, j))}</mark>`;
      i2 = j;
    } else {
      let j = i2;
      while (j < title.length && !hits.has(j)) j++;
      out2 += escapeHtml(title.slice(i2, j));
      i2 = j;
    }
  }
  return out2;
};
let paletteEntriesCache = null;
let paletteIndexCache = null;

export const invalidateSearchIndex = () => {
  paletteEntriesCache = null;
  paletteIndexCache = null;
};

export const allPaletteEntries = () => {
  if (!paletteEntriesCache) paletteEntriesCache = flattenCatalogue([...categories, ...paletteGroups]);
  return paletteEntriesCache;
};

export const paletteSearchIndex = () => {
  if (!paletteIndexCache) paletteIndexCache = buildIndex(allPaletteEntries(), { isFresh });
  return paletteIndexCache;
};
let commandIndexCache = null;

export const searchCommands = (commands, q) => {
  const key = commands.map(e => `${e.app.title.en}\u0001${e.app.title.ar}`).join('\u0002');
  if (!commandIndexCache || commandIndexCache.key !== key) commandIndexCache = { key, index: buildIndex(commands, { titlesOnly: true }) };
  return search(commandIndexCache.index, q, {}).map(h => ({ app: commands[h.index].app, cat: commands[h.index].cat, score: h.score, hit: h }));
};

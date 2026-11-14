import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { flattenCatalogue, buildIndex, search, normalize, layoutSwap } from '../src/search.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'links.json'), 'utf8')).categories;
const entries = flattenCatalogue(catalogue);
const index = buildIndex(entries, { isFresh: (app) => !!app.isNew });

const mulberry = (seed) => () => {
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const rnd = mulberry(20261114);
const pick = (list) => list[Math.floor(rnd() * list.length)];

const NEIGHBOURS = {};
for (const row of ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']) {
  for (let i = 0; i < row.length; i++) NEIGHBOURS[row[i]] = (row[i - 1] || '') + (row[i + 1] || '');
}
const LATIN = 'abcdefghijklmnopqrstuvwxyz';
const ARABIC = 'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
const isArabic = (w) => /[؀-ۿ]/.test(w);
const alphabetOf = (w) => (isArabic(w) ? ARABIC : LATIN);
const otherChar = (w, c) => {
  if (!isArabic(w) && NEIGHBOURS[c] && rnd() < 0.7) return pick(NEIGHBOURS[c]);
  let x = pick(alphabetOf(w));
  while (x === c) x = pick(alphabetOf(w));
  return x;
};

const mutate = {
  sub: (w) => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + otherChar(w, w[i]) + w.slice(i + 1); },
  sub0: (w) => otherChar(w, w[0]) + w.slice(1),
  del: (w) => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + w.slice(i + 1); },
  ins: (w) => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + pick(alphabetOf(w)) + w.slice(i); },
  trn: (w) => {
    const spots = [];
    for (let i = 1; i < w.length - 1; i++) if (w[i] !== w[i + 1]) spots.push(i);
    if (!spots.length) return null;
    const i = pick(spots);
    return w.slice(0, i) + w[i + 1] + w[i] + w.slice(i + 2);
  },
  dbl: (w) => { const i = 1 + Math.floor(rnd() * (w.length - 1)); return w.slice(0, i) + w[i] + w.slice(i); },
  two: (w) => {
    if (w.length < 6) return null;
    const a = mutate.sub(w);
    const half = Math.ceil(a.length / 2);
    const tail = mutate.del(a.slice(half - 1));
    return a.slice(0, half - 1) + tail;
  }
};

const norm = (s) => normalize(s);
const wordsOf = (s) => norm(s).split(' ').filter(Boolean);
const tokenOwners = new Map();
entries.forEach((e, i) => {
  const texts = [e.app.title.en, e.app.title.ar];
  if (e.app.parentTitle) texts.push(e.app.parentTitle.en, e.app.parentTitle.ar);
  if (e.app.variantLabel) texts.push(e.app.variantLabel.en, e.app.variantLabel.ar);
  for (const t of texts) for (const w of wordsOf(t)) {
    if (!tokenOwners.has(w)) tokenOwners.set(w, new Set());
    tokenOwners.get(w).add(i);
  }
});
const ownersOfWord = (w) => tokenOwners.get(w) || new Set();

const cases = [];
const add = (fam, sub, q, ok, extra = {}) => {
  if (!q || !q.trim() || ok.size === 0) return;
  cases.push({ fam, sub, q, ok, ...extra });
};
const bucket = (len) => (len <= 3 ? '3' : len === 4 ? '4' : len <= 7 ? '5-7' : '8+');

entries.forEach((e, i) => {
  const self = new Set([i]);
  for (const lang of ['en', 'ar']) {
    const title = e.app.title[lang];
    add('exact', lang, title, self);
    add('exact', lang + ' lower', title.toLowerCase(), self);
    const words = wordsOf(title);
    for (const w of new Set(words)) {
      if (w.length < 3 || w === '460') continue;
      const ok = ownersOfWord(w);
      for (const [kind, fn] of Object.entries(mutate)) {
        const m = fn(w);
        if (!m || m === w) continue;
        add('typo word', `${kind} len ${bucket(w.length)}`, m, ok, { word: w });
      }
    }
    if (words.length >= 2) {
      const longWords = words.filter((w) => w.length >= 4);
      for (const kind of ['sub', 'del', 'trn', 'ins']) {
        if (!longWords.length) break;
        const w = pick(longWords);
        const m = mutate[kind](w);
        if (!m || m === w) continue;
        add('typo title', kind, words.map((x) => (x === w ? m : x)).join(' '), self);
        add('typo title joined', kind, words.map((x) => (x === w ? m : x)).join(''), self);
        add('typo title reversed', kind, words.map((x) => (x === w ? m : x)).reverse().join(' '), self);
      }
      add('joined', lang, words.join(''), self);
      add('reversed', lang, words.slice().reverse().join(' '), self);
      add('reversed joined', lang, words.slice().reverse().join(''), self);
      add('word starts', lang, words.map((w) => w.slice(0, Math.max(2, Math.min(3, w.length - 1)))).join(' '), self);
      add('first letters', lang, words.map((w) => w[0]).join(''), self);
    }
    if (words.length === 1 && words[0].length >= 6) {
      add('prefix', lang, words[0].slice(0, Math.ceil(words[0].length * 0.6)), self);
    }
  }
  if (e.app.variantLabel) {
    const parts = [e.app.parentTitle.en, e.app.variantLabel.en].map(norm);
    add('parent + variant', 'swapped', parts.reverse().join(' '), self);
  }
  if (e.app.url) {
    let u;
    try { u = new URL(e.app.url); } catch (err) { u = null; }
    if (u) {
      const host = u.hostname.replace(/^www\./, '');
      const core = host.replace(/\.(vercel\.app|netlify\.app|github\.io|pages\.dev|web\.app)$/, '');
      add('url', 'full', e.app.url, self);
      add('url', 'no scheme', host + u.pathname.replace(/\/$/, ''), self);
      add('url', 'host only', host, self);
      add('url', 'www', 'https://www.' + host + '/', self);
      add('url', 'http', 'http://' + host + '/', self);
      add('url', 'upper', e.app.url.toUpperCase(), self);
      add('url', 'extra path', 'https://' + host + '/some/page?x=1#top', self);
      add('url', 'core', core, self);
      add('url', 'core with spaces', core.replace(/-/g, ' '), self);
      add('url', 'host spaced', host.replace(/[.-]/g, ' '), self);
      if (core.length >= 6) {
        add('url typo', 'core sub', mutate.sub(core), self);
        add('url typo', 'core del', mutate.del(core), self);
        add('url typo', 'host sub', mutate.sub(core) + host.slice(core.length), self);
        add('url typo', 'full url sub', 'https://' + mutate.sub(core) + host.slice(core.length) + '/', self);
        add('url typo', 'core trn', mutate.trn(core) || core, self);
      }
      const parts = core.split('-').filter((p) => p.length >= 4);
      if (parts.length) add('url fragment', 'longest part', parts.sort((a, b) => b.length - a.length)[0], self);
      if (core.length >= 8) add('url fragment', 'start 6', core.slice(0, 6), self);
      if (core.length >= 10) add('url fragment', 'middle 6', core.slice(3, 9), self);
    }
  }
  const id = e.app.id.replace('::', ' ');
  add('id', 'full', e.app.id, self);
  add('id', 'spaced', id, self);
  const lat = e.app.title.en;
  const swappedAr = layoutSwap(e.app.title.ar.replace(/ · /g, ' '));
  add('layout swap', 'arabic typed on english keys', swappedAr, self);
  const swappedEn = layoutSwap(lat.replace(/ · /g, ' ').toLowerCase());
  add('layout swap', 'english typed on arabic keys', swappedEn, self);
});

const catCases = [];
for (const c of catalogue) {
  if (c.id === 'palette') continue;
  const members = new Set();
  entries.forEach((e, i) => { if (e.cat.id === c.id) members.add(i); });
  const forms = [['label en', c.label.en], ['label en lower', c.label.en.toLowerCase()], ['id', c.id], ['label ar', c.label.ar]];
  const en = c.label.en.toLowerCase();
  if (en.length >= 5) {
    forms.push(['typo sub', mutate.sub(en)], ['typo del', mutate.del(en)], ['typo trn', mutate.trn(en) || en]);
    forms.push(['prefix 4', en.slice(0, 4)]);
  }
  if (en.length >= 8) forms.push(['two typos', mutate.two(en)]);
  const ar = norm(c.label.ar);
  if (ar.length >= 5) forms.push(['ar typo', mutate.sub(ar)]);
  for (const [sub, q] of forms) catCases.push({ fam: 'category', sub, q, members, cat: c.id });
  for (const [i, e] of entries.entries()) {
    if (e.cat.id !== c.id) continue;
    const w = wordsOf(e.app.title.en).sort((a, b) => b.length - a.length)[0];
    if (!w || w.length < 4) continue;
    const owners = new Set([...ownersOfWord(w)].filter((j) => entries[j].cat.id === c.id));
    cases.push({ fam: 'category + word', sub: 'label word', q: `${c.label.en.toLowerCase()} ${w}`, ok: owners });
    cases.push({ fam: 'category + word', sub: 'id word', q: `${c.id} ${w}`, ok: owners });
    cases.push({ fam: 'category + word', sub: 'word label', q: `${w} ${c.label.en.toLowerCase()}`, ok: owners });
    if (c.label.en.length >= 5) cases.push({ fam: 'category + word', sub: 'typo label word', q: `${mutate.sub(c.label.en.toLowerCase())} ${w}`, ok: owners });
  }
}

const junk = [];
for (let n = 0; n < 300; n++) {
  const len = 5 + Math.floor(rnd() * 9);
  let s = '';
  for (let k = 0; k < len; k++) s += pick(LATIN);
  junk.push(s);
}
const realWords = ['banana', 'weather', 'password', 'facebook', 'whatsapp', 'translate', 'spreadsheet', 'notepad', 'download', 'wikipedia', 'amazon', 'youtube', 'mailbox', 'umbrella', 'elephant', 'chocolate', 'internet', 'browser'];

const ranksOf = (q) => {
  index.last = null;
  return search(index, q, {}).map((h) => h.index);
};

const stats = new Map();
const failures = new Map();
const note = (key, ok1, ok3, okAny, q) => {
  const [fam] = key.split('|');
  let s = stats.get(key);
  if (!s) { s = { n: 0, at1: 0, at3: 0, any: 0 }; stats.set(key, s); }
  s.n++;
  if (ok1) s.at1++;
  if (ok3) s.at3++;
  if (okAny) s.any++;
  if (!ok1) {
    if (!failures.has(key)) failures.set(key, []);
    failures.get(key).push(q);
  }
};

const times = [];
for (const c of cases) {
  const t0 = performance.now();
  const r = ranksOf(c.q);
  times.push(performance.now() - t0);
  const ok1 = r.length > 0 && c.ok.has(r[0]);
  const ok3 = r.slice(0, 3).some((i) => c.ok.has(i));
  const okAny = r.some((i) => c.ok.has(i));
  note(`${c.fam}|${c.sub}`, ok1, ok3, okAny, c.q);
}

const catStats = new Map();
for (const c of catCases) {
  const r = ranksOf(c.q);
  const n = c.members.size;
  const got = new Set(r);
  let all = true;
  for (const m of c.members) if (!got.has(m)) all = false;
  let prec = 0;
  for (const i of r.slice(0, n)) if (c.members.has(i)) prec++;
  const key = `${c.fam}|${c.sub}`;
  let s = catStats.get(key);
  if (!s) { s = { n: 0, all: 0, prec: 0, bad: [] }; catStats.set(key, s); }
  s.n++;
  if (all) s.all++;
  s.prec += prec / n;
  if (!all || prec / n < 0.7) s.bad.push(`${c.q} (${c.cat}: ${[...c.members].filter((m) => !got.has(m)).length} missing, top${n} precision ${Math.round((100 * prec) / n)}%)`);
}

const junkHits = [];
for (const q of [...junk, ...realWords]) if (ranksOf(q).length) junkHits.push(q);

const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : 0);
const byFam = new Map();
for (const [key, s] of stats) {
  const [fam] = key.split('|');
  const f = byFam.get(fam) || { n: 0, at1: 0, at3: 0, any: 0 };
  f.n += s.n; f.at1 += s.at1; f.at3 += s.at3; f.any += s.any;
  byFam.set(fam, f);
}
console.log('family'.padEnd(24), 'n'.padStart(5), 'top1%'.padStart(7), 'top3%'.padStart(7), 'found%'.padStart(7));
for (const [fam, f] of byFam) console.log(fam.padEnd(24), String(f.n).padStart(5), String(pct(f.at1, f.n)).padStart(7), String(pct(f.at3, f.n)).padStart(7), String(pct(f.any, f.n)).padStart(7));
const total = [...byFam.values()].reduce((a, f) => ({ n: a.n + f.n, at1: a.at1 + f.at1, at3: a.at3 + f.at3, any: a.any + f.any }), { n: 0, at1: 0, at3: 0, any: 0 });
console.log('ALL'.padEnd(24), String(total.n).padStart(5), String(pct(total.at1, total.n)).padStart(7), String(pct(total.at3, total.n)).padStart(7), String(pct(total.any, total.n)).padStart(7));

console.log('\ncategory queries (every member of the tab is in the results / mean precision in the first N):');
for (const [key, s] of catStats) console.log(' ', key.padEnd(34), `${s.all}/${s.n} complete`, `precision ${pct(s.prec, s.n)}%`);

console.log(`\njunk and unrelated words returning something: ${junkHits.length} of ${junk.length + realWords.length}`, junkHits.slice(0, 8).join(' '));
times.sort((a, b) => a - b);
console.log(`speed over ${times.length} queries on the real catalogue: median ${times[Math.floor(times.length / 2)].toFixed(3)} ms, p95 ${times[Math.floor(times.length * 0.95)].toFixed(3)} ms, max ${times[times.length - 1].toFixed(3)} ms`);

if (verbose) {
  console.log('\nweakest groups (top1 under 90%):');
  const rows = [...stats].filter(([, s]) => s.at1 / s.n < 0.9).sort((a, b) => a[1].at1 / a[1].n - b[1].at1 / b[1].n);
  for (const [key, s] of rows) console.log(`  ${key.padEnd(40)} n=${String(s.n).padStart(3)} top1 ${String(pct(s.at1, s.n)).padStart(5)}%  e.g. ${(failures.get(key) || []).slice(0, 4).join(' | ')}`);
  for (const [key, s] of catStats) if (s.bad.length) console.log(`  ${key}: ${s.bad.slice(0, 3).join(' | ')}`);
}

const floors = { top1: 95.5, top3: 97.5, found: 97.5 };
const problems = [];
if (pct(total.at1, total.n) < floors.top1) problems.push(`top1 ${pct(total.at1, total.n)}% under ${floors.top1}%`);
if (pct(total.at3, total.n) < floors.top3) problems.push(`top3 ${pct(total.at3, total.n)}% under ${floors.top3}%`);
if (pct(total.any, total.n) < floors.found) problems.push(`found ${pct(total.any, total.n)}% under ${floors.found}%`);
for (const [key, s] of catStats) if (s.all < s.n) problems.push(`${key}: ${s.n - s.all} category queries missing members`);
if (junkHits.length) problems.push(`${junkHits.length} junk queries returned results: ${junkHits.slice(0, 5).join(' ')}`);
if (problems.length) {
  console.log(`\nFAIL ${problems.join('; ')}`);
  process.exit(1);
}
console.log('\nsearch bench: ok');

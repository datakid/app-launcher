import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { flattenCatalogue, buildIndex, search, normalize, layoutSwap } from '../src/search.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'links.json'), 'utf8')).categories;
const entries = flattenCatalogue(catalogue);
const buildOpts = { isFresh: (app) => !!app.isNew };
const index = buildIndex(entries, buildOpts);

const failures = [];
let checks = 0;
const check = (name, ok, detail) => {
  checks++;
  if (!ok) failures.push(detail ? `${name}: ${detail}` : name);
};

const titleOf = (h) => entries[h.index].app.title.en;
const run = (q, opts = {}) => {
  index.last = null;
  return search(index, q, opts);
};
const top = (q, n) => run(q).slice(0, n).map(titleOf);
const describe = (q) => JSON.stringify(top(q, 4));

const first = (q, title) => check(`"${q}" -> ${title} first`, top(q, 1)[0] === title, describe(q));
const within = (q, n, title) => check(`"${q}" -> ${title} in top ${n}`, top(q, n).includes(title), describe(q));

first('parser', 'Parser');
within('parsre', 3, 'Parser');
within('prsr', 3, 'Parser');
first('حشقسثق', 'Parser');
first('hglpgg', 'Parser');
first('المحلل', 'Parser');
const drugs = top('الادويه', 2);
check('"الادويه" -> Drug List entries first', drugs.length === 2 && drugs.every((t) => t.startsWith('Drug List')), JSON.stringify(drugs));
const drugs3 = top('ادوية', 3);
check('"ادوية" -> Drug List in top 3', drugs3.some((t) => t.startsWith('Drug List')), JSON.stringify(drugs3));
first('ib', 'Index Builder');
first('indx bldr', 'Index Builder');
first('https://lx-index.vercel.app/', 'Index Builder');
first('lx-index.vercel.app', 'Index Builder');
first('lx-index', 'Index Builder');
first('snickerdoodle', 'Protocols');
first('netlify', 'Protocols');
first('460', 'Paid · Daleel 460');
first('duck', 'Data Prep · DuckBench');
first('pillbug', 'Pharmacy Tools · Pillbug');
first('draw', 'Draw');
const fullTop = top('full', 3);
check('"full" -> first 3 are Full variants', fullTop.length === 3 && fullTop.every((t) => t.endsWith('· Full')), JSON.stringify(fullTop));
first('core parser', 'Parser');
for (const q of ['closed', 'مغلق']) {
  const t = top(q, 2);
  check(`"${q}" -> Tally and Folio first`, t.length === 2 && t.includes('Form · Tally') && t.includes('Form · Folio'), JSON.stringify(t));
}
first('harvest', 'Harvest');
first('الحصاد', 'Harvest');
const pills = run('pills').map(titleOf);
check('"pills" -> Workspace and Pharmacy Tools', pills.includes('Workspace') && pills.some((t) => t.startsWith('Pharmacy Tools')), JSON.stringify(pills));
const vercel = run('vercel');
check('"vercel" -> at least 20 results', vercel.length >= 20, String(vercel.length));
const vercelSig = JSON.stringify(vercel.map((h) => [h.index, h.score]));
let stable = true;
for (let i = 0; i < 100; i++) {
  if (JSON.stringify(run('vercel').map((h) => [h.index, h.score])) !== vercelSig) stable = false;
}
check('"vercel" -> deterministic over 100 runs', stable);
check('"zzzzqqq" -> no results', run('zzzzqqq').length === 0);
first('٤٦٠', 'Paid · Daleel 460');

for (const q of ['', '   ', '(.*', '[\\', 'a'.repeat(300), '\u0000', '😀', '\\', '+++', '$^', 'a b c d e f g h i j k l m n']) {
  let threw = false;
  let res = null;
  try { res = run(q); } catch (e) { threw = true; }
  check(`no throw for ${JSON.stringify(q).slice(0, 24)}`, !threw && Array.isArray(res));
}
check('empty query lists every entry', run('').length === entries.length);
check('whitespace query lists every entry', run('   ').length === entries.length);

const ind = run('ind').find((h) => titleOf(h) === 'Index Builder');
check('"ind" ranges on Index Builder', !!ind && ind.field === 'title' && JSON.stringify(ind.ranges) === '[[0,3]]', ind ? JSON.stringify(ind) : 'missing');

const arCat = { id: 'c', label: { ar: 'ق', en: 'C' } };
const arEntry = { app: { id: 'meds', title: { ar: 'قائمة الأدوية', en: 'Meds' }, url: 'https://meds.example.com/' }, cat: arCat };
const arIndex = buildIndex([arEntry], {});
const arHit = search(arIndex, 'اد', {})[0];
check('"اد" highlights the hamza form in the original string', !!arHit && arHit.field === 'title' && arHit.text === 'قائمة الأدوية' && JSON.stringify(arHit.ranges) === '[[8,10]]', arHit ? JSON.stringify(arHit) : 'missing');
const arHit2 = search(arIndex, 'الادويه', {})[0];
check('"الادويه" highlights the whole word with hamza and teh marbuta', !!arHit2 && JSON.stringify(arHit2.ranges) === '[[6,13]]', arHit2 ? JSON.stringify(arHit2.ranges) : 'missing');

check('normalize folds Arabic-Indic digits', normalize('٤٦٠') === '460');
check('normalize folds Persian digits', normalize('۴۶۰') === '460');
check('normalize strips harakat and tatweel', normalize('الْأَدْوِيَـة') === normalize('الادويه'));
check('normalize folds separators', normalize('Lx-Index.vercel.app/') === 'lx index vercel app');
check('normalize strips Latin diacritics', normalize('Café') === 'cafe');
check('layoutSwap Latin to Arabic', layoutSwap('hglpgg') === 'المحلل');
check('layoutSwap Arabic to Latin', layoutSwap('المحلل') === 'hglpgg');
check('layoutSwap lam-alef', layoutSwap('b') === 'لا' && layoutSwap('لا') === 'b');

const sameHits = (a, b) => a.length === b.length && a.every((h, i) => h.index === b[i].index && h.score === b[i].score && h.tier === b[i].tier && h.field === b[i].field);
const narrowingQueries = ['parser', 'indx bldr', 'الادويه', 'lx-index.vercel.app', 'vercel app', 'pillbug', 'daleel 460', 'duckbench', 'core parser', 'snickerdoodle', 'harvest', 'ledger form', 'full', 'ar', 'sol'];
for (const q of narrowingQueries) {
  index.last = null;
  for (let n = 1; n <= q.length; n++) {
    const prefix = q.slice(0, n);
    const incremental = search(index, prefix, {});
    const saved = index.last;
    index.last = null;
    const cold = search(index, prefix, {});
    index.last = saved;
    check(`incremental narrowing equals cold search for "${prefix}"`, sameHits(incremental, cold), `${incremental.length} vs ${cold.length}`);
  }
}

const mulberry = (seed) => () => {
  seed |= 0;
  seed = (seed + 0x6D2B79F5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const SYLLABLES = ['ta', 'ri', 'mo', 'ven', 'dex', 'lu', 'pha', 'qui', 'zen', 'bor', 'ka', 'lin', 'sol', 'ver', 'nu', 'ex', 'pro', 'tex', 'dat', 'wik', 'mar', 'cel', 'tri', 'bu', 'gan', 'flo', 'sky', 'ion', 'dra', 'pix'];
const AR_WORDS = ['قائمة', 'الأدوية', 'حاسبة', 'المحلل', 'مفكرة', 'جدول', 'أدوات', 'الصيدلة', 'بيانات', 'نموذج', 'مراجعة', 'تقرير', 'مخطط', 'فهرس', 'بروتوكول', 'مساحة', 'عمل', 'رسم', 'تحويل', 'نصوص', 'سجل', 'إدارة', 'تجربة', 'منشئ', 'معايير'];
const ICONS = ['fa-pills', 'fa-book-medical', 'fa-calculator', 'fa-chart-line', 'fa-table', 'fa-file-lines', 'fa-bolt', 'fa-gear', 'fa-user-doctor', 'fa-database', 'fa-pen-ruler', 'fa-list-check'];
const HOSTS = ['vercel.app', 'netlify.app', 'github.io', 'pages.dev', 'web.app', 'example.com', 'tools.dev'];

const synthetic = (seed, total) => {
  const rnd = mulberry(seed);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const word = () => {
    const n = 2 + Math.floor(rnd() * 2);
    let w = '';
    for (let i = 0; i < n; i++) w += pick(SYLLABLES);
    return w;
  };
  const cap = (w) => w[0].toUpperCase() + w.slice(1);
  const cats = [];
  for (let c = 0; c < 8; c++) cats.push({ id: `cat-${c}`, label: { en: cap(word()), ar: pick(AR_WORDS) }, apps: [] });
  let produced = 0;
  let id = 0;
  while (produced < total) {
    const words = 1 + Math.floor(rnd() * 3);
    const en = Array.from({ length: words }, () => cap(word())).join(' ');
    const ar = Array.from({ length: words }, () => pick(AR_WORDS)).join(' ');
    const slug = en.toLowerCase().replace(/ /g, '-');
    const app = { id: `${slug}-${id++}`, title: { en, ar }, url: `https://${slug}.${pick(HOSTS)}/${rnd() < 0.3 ? word() : ''}`, icon: pick(ICONS), gradient: ['#111', '#222', '#333'] };
    if (rnd() < 0.05) app.closed = true;
    let count = 1;
    if (rnd() < 0.25) {
      app.variants = [0, 1].map((n) => ({ id: `v${n}`, label: { en: cap(word()), ar: pick(AR_WORDS) }, url: `https://${slug}-v${n}.${pick(HOSTS)}/`, icon: pick(ICONS) }));
      count = 2;
    }
    pick(cats).apps.push(app);
    produced += count;
  }
  return { cats, rnd, pick };
};

const percentile = (values, p) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
};
const median = (values) => percentile(values, 0.5);
const timeIt = (fn) => {
  const t = performance.now();
  fn();
  return performance.now() - t;
};

const LIMITS = { buildReal: 2, searchReal: 0.3, searchSynthMedian: 6, searchSynthP95: 12 };

for (let i = 0; i < 20; i++) buildIndex(entries, buildOpts);
const buildTimes = [];
for (let i = 0; i < 50; i++) buildTimes.push(timeIt(() => buildIndex(entries, buildOpts)));
const buildReal = median(buildTimes);

const realQueries = ['parser', 'parsre', 'prsr', 'حشقسثق', 'hglpgg', 'المحلل', 'الادويه', 'ادوية', 'ib', 'indx bldr', 'https://lx-index.vercel.app/', 'lx-index.vercel.app', 'lx-index', 'snickerdoodle', 'netlify', '460', 'duck', 'pillbug', 'draw', 'full', 'core parser', 'closed', 'مغلق', 'harvest', 'الحصاد', 'pills', 'vercel', 'zzzzqqq', '٤٦٠', 'a', 'ab'];
const realTimes = [];
for (let round = 0; round < 30; round++) {
  for (const q of realQueries) {
    index.last = null;
    const t = performance.now();
    search(index, q, {});
    if (round >= 5) realTimes.push(performance.now() - t);
  }
}
const searchReal = median(realTimes);

const synth = synthetic(20260101, 5000);
const bigEntries = flattenCatalogue(synth.cats).slice(0, 5000);
const bigBuild = timeIt(() => buildIndex(bigEntries, {}));
const bigIndex = buildIndex(bigEntries, {});

const samples = [];
const known = bigEntries.filter((e, i) => i % 97 === 0).slice(0, 40);
const synthQueries = [];
for (const e of known) {
  const en = e.app.title.en.toLowerCase();
  synthQueries.push(en);
  synthQueries.push(en.slice(0, Math.max(3, en.length - 2)) + en.slice(-1));
  synthQueries.push(en.split(' ').map((w) => w.slice(0, 3)).join(' '));
  synthQueries.push(e.app.title.ar.split(' ')[0]);
  synthQueries.push(new URL(e.app.url).hostname.split('.')[0]);
}
synthQueries.push('vercel', 'app', 'a', 'zz', 'ta ri', 'netlify tex');

const typed = [];
const cold = [];
for (let round = 0; round < 3; round++) {
  for (const q of synthQueries) {
    bigIndex.last = null;
    const t0 = performance.now();
    search(bigIndex, q, {});
    const dt = performance.now() - t0;
    if (round > 0) cold.push(dt);
    bigIndex.last = null;
    for (let n = 1; n <= q.length; n++) {
      const t1 = performance.now();
      search(bigIndex, q.slice(0, n), {});
      const d = performance.now() - t1;
      if (round > 0) typed.push(d);
    }
  }
}
samples.push(...cold, ...typed);
const synthMedian = median(samples);
const synthP95 = percentile(samples, 0.95);
const coldMedian = median(cold);
const coldP95 = percentile(cold, 0.95);
const r2 = (v) => Math.round(v * 1000) / 1000;

console.log(`catalogue entries ${entries.length}, checks ${checks}`);
console.log(`buildIndex real median ${r2(buildReal)} ms (limit ${LIMITS.buildReal})`);
console.log(`search real median ${r2(searchReal)} ms over ${realTimes.length} calls (limit ${LIMITS.searchReal})`);
console.log(`buildIndex synthetic 5000 ${r2(bigBuild)} ms`);
console.log(`search synthetic 5000 all median ${r2(synthMedian)} p95 ${r2(synthP95)} ms over ${samples.length} calls (limits ${LIMITS.searchSynthMedian} / ${LIMITS.searchSynthP95})`);
console.log(`search synthetic 5000 cold median ${r2(coldMedian)} p95 ${r2(coldP95)} ms over ${cold.length} calls`);

check(`buildIndex median ${r2(buildReal)} ms under ${LIMITS.buildReal}`, buildReal < LIMITS.buildReal);
check(`search real median ${r2(searchReal)} ms under ${LIMITS.searchReal}`, searchReal < LIMITS.searchReal);
check(`search synthetic median ${r2(synthMedian)} ms under ${LIMITS.searchSynthMedian}`, synthMedian < LIMITS.searchSynthMedian);
check(`search synthetic p95 ${r2(synthP95)} ms under ${LIMITS.searchSynthP95}`, synthP95 < LIMITS.searchSynthP95);
check(`search synthetic cold median ${r2(coldMedian)} ms under ${LIMITS.searchSynthMedian}`, coldMedian < LIMITS.searchSynthMedian);
check(`search synthetic cold p95 ${r2(coldP95)} ms under ${LIMITS.searchSynthP95}`, coldP95 < LIMITS.searchSynthP95);

const incrementalChecked = [];
for (const q of synthQueries.slice(0, 40)) {
  bigIndex.last = null;
  for (let n = 1; n <= q.length; n++) {
    const prefix = q.slice(0, n);
    const inc = search(bigIndex, prefix, {});
    const saved = bigIndex.last;
    bigIndex.last = null;
    const full = search(bigIndex, prefix, {});
    bigIndex.last = saved;
    if (!sameHits(inc, full)) incrementalChecked.push(prefix);
  }
}
check('incremental narrowing equals cold search on the synthetic catalogue', incrementalChecked.length === 0, incrementalChecked.slice(0, 5).join(', '));

if (failures.length) {
  failures.forEach((f) => console.log('FAIL', f));
  console.log(`${failures.length} of ${checks} checks failed`);
  process.exit(1);
}
console.log(`all ${checks} checks passed`);

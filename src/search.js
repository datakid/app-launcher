export const KIND = { title: 0, variant: 1, parent: 2, acronym: 3, host: 4, url: 5, category: 6, id: 7, icon: 8, status: 9, badge: 10 };
export const KIND_NAMES = ['title', 'variant', 'parent', 'acronym', 'host', 'url', 'category', 'id', 'icon', 'status', 'badge'];
export const TIER = { split: 1, typo: 2, subsequence: 3, substring: 4, acronym: 5, wordStart: 6, prefix: 7, exact: 8 };

const WEIGHT = [1, 0.95, 0.9, 0.85, 0.7, 0.55, 0.5, 0.5, 0.3, 0.4, 0.4];
const ALT_FACTOR = 0.97;
const AGREE = 0.1;
const MAX_TOKENS = 8;
const MAX_TOKEN_LEN = 48;
const MAX_QUERY_LEN = 256;
const TYPO_CAP = 5;
const RANGE_LIMIT = 60;
const SPLIT_CHUNK = 3;
const SPLIT_MIN_QUERY = SPLIT_CHUNK * 2;
const SPLIT_MAX_QUERY = 32;
const SPLIT_BASE = 360;
const SPLIT_STEP = 30;
const SPLIT_ALIGNED = 40;
const PLATFORM_SUFFIXES = ['vercel.app', 'netlify.app', 'github.io', 'pages.dev', 'web.app'];
const ARTICLE_PREFIXES = ['بال', 'وال', 'فال', 'كال', 'لل', 'ال'];
const LETTER = /[\p{L}\p{N}]/u;

const wideCache = new Map();

const computeWide = (ch) => {
  const code = ch.charCodeAt(0);
  if (code === 0x0640 || (code >= 0x064B && code <= 0x065F) || code === 0x0670) return '';
  if ((code >= 0x200B && code <= 0x200F) || (code >= 0x202A && code <= 0x202E) || (code >= 0x2066 && code <= 0x2069) || code === 0xFEFF) return '';
  if (code >= 0x0660 && code <= 0x0669) return String.fromCharCode(48 + code - 0x0660);
  if (code >= 0x06F0 && code <= 0x06F9) return String.fromCharCode(48 + code - 0x06F0);
  if (ch === 'أ' || ch === 'إ' || ch === 'آ' || ch === 'ٱ') return 'ا';
  if (ch === 'ى') return 'ي';
  if (ch === 'ة') return 'ه';
  if (ch === 'ؤ' || ch === 'ئ') return 'ء';
  if ((code >= 0x0621 && code <= 0x064A) || (code >= 0x0671 && code <= 0x06D3)) return ch;
  const decomposed = ch.toLowerCase().normalize('NFKD');
  let out = '';
  for (const c of decomposed) {
    const cc = c.charCodeAt(0);
    if (cc >= 0x0300 && cc <= 0x036F) continue;
    if (cc < 128) out += (cc >= 97 && cc <= 122) || (cc >= 48 && cc <= 57) ? c : ' ';
    else if (c === ch) out += LETTER.test(c) ? c : ' ';
    else out += computeWide(c);
  }
  return out;
};

const foldWide = (ch) => {
  let r = wideCache.get(ch);
  if (r === undefined) {
    r = computeWide(ch);
    wideCache.set(ch, r);
  }
  return r;
};

const fold = (s, wantMap) => {
  let out = '';
  const map = wantMap ? [] : null;
  let prevSpace = true;
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    let r;
    if (code < 128) {
      if ((code >= 97 && code <= 122) || (code >= 48 && code <= 57)) r = s[i];
      else if (code >= 65 && code <= 90) r = String.fromCharCode(code + 32);
      else r = ' ';
    } else {
      r = foldWide(s[i]);
    }
    for (let j = 0; j < r.length; j++) {
      const c = r[j];
      if (c === ' ') {
        if (prevSpace) continue;
        prevSpace = true;
      } else {
        prevSpace = false;
      }
      out += c;
      if (map) map.push(i);
    }
  }
  if (out.length && out.charCodeAt(out.length - 1) === 32) {
    out = out.slice(0, -1);
    if (map) map.pop();
  }
  return { out, map };
};

export const normalize = (s) => fold(String(s == null ? '' : s)).out;

const LATIN_KEYS = "`qwertyuiop[]asdfghjkl;'zxcvbnm,./";
const ARABIC_KEYS = 'ذضصثقفغعهخحجدشسيبلاتنمكطئءؤر*ىةوزظ';
const LATIN_TO_ARABIC = {};
const ARABIC_TO_LATIN = {};
for (let i = 0; i < LATIN_KEYS.length; i++) {
  const arabic = ARABIC_KEYS[i];
  LATIN_TO_ARABIC[LATIN_KEYS[i]] = arabic === '*' ? 'لا' : arabic;
  if (arabic !== '*') ARABIC_TO_LATIN[arabic] = LATIN_KEYS[i];
}

export const layoutSwap = (s) => {
  const str = String(s == null ? '' : s);
  let arabic = 0;
  let latin = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0x0600 && c <= 0x06FF) arabic++;
    else if ((c >= 65 && c <= 90) || (c >= 97 && c <= 122)) latin++;
  }
  let out = '';
  if (arabic > latin) {
    for (let i = 0; i < str.length; i++) {
      if (str[i] === 'ل' && str[i + 1] === 'ا') { out += 'b'; i++; continue; }
      const m = ARABIC_TO_LATIN[str[i]];
      out += m === undefined ? str[i] : m;
    }
  } else if (latin > 0) {
    for (let i = 0; i < str.length; i++) {
      const m = LATIN_TO_ARABIC[str[i].toLowerCase()];
      out += m === undefined ? str[i] : m;
    }
  } else {
    return str;
  }
  return out;
};

const popcount = (v) => {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0F0F0F0F) * 0x01010101) >>> 24;
};

const masks = { a: 0, b: 0 };
const maskOf = (str) => {
  let a = 0;
  let b = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c === 32) continue;
    if (c >= 97 && c <= 122) a |= 1 << (c - 97);
    else if (c >= 48 && c <= 57) a |= 1 << (26 + ((c - 48) % 6));
    else b |= 1 << (c % 32);
  }
  masks.a = a;
  masks.b = b;
};

const tokenize = (str, withAlt) => {
  const toks = [];
  const pos = [];
  const wt = [];
  const wi = [];
  let i = 0;
  let w = 0;
  const n = str.length;
  while (i < n) {
    let j = str.indexOf(' ', i);
    if (j < 0) j = n;
    const t = str.slice(i, j);
    toks.push(t);
    pos.push(i);
    wt.push(1);
    wi.push(w);
    if (withAlt) {
      const c0 = t.charCodeAt(0);
      if (c0 >= 0x0600 && c0 <= 0x06FF) {
        for (const p of ARTICLE_PREFIXES) {
          if (t.length - p.length >= 2 && t.startsWith(p)) {
            toks.push(t.slice(p.length));
            pos.push(i + p.length);
            wt.push(ALT_FACTOR);
            wi.push(w);
            break;
          }
        }
      }
    }
    i = j + 1;
    w++;
  }
  return { toks, pos, wt, wi };
};

let activeVocab = null;

const makeField = (kind, raw) => {
  const text = String(raw);
  const { out } = fold(text, false);
  if (!out) return null;
  const tk = tokenize(out, kind !== KIND.acronym);
  maskOf(out);
  const ma = masks.a;
  const mb = masks.b;
  const tid = [];
  for (let i = 0; i < tk.toks.length; i++) {
    const t = tk.toks[i];
    let id = activeVocab.map.get(t);
    if (id === undefined) {
      id = activeVocab.list.length;
      activeVocab.map.set(t, id);
      activeVocab.list.push(t);
      maskOf(t);
      activeVocab.ma.push(masks.a);
      activeVocab.mb.push(masks.b);
    }
    tid.push(id);
  }
  return { kind, w: WEIGHT[kind], text, str: out, map: null, toks: tk.toks, pos: tk.pos, tw: tk.wt, wi: tk.wi, ma, mb, tid };
};

const acronymOf = (title) => {
  const words = String(title).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length < 2) return '';
  let out = '';
  for (const w of words) out += w[0];
  return out;
};

const hostOf = (url) => {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    return { host, path: u.pathname.replace(/\/+$/, ''), search: u.search, ok: true };
  } catch (e) {
    return { host: '', path: '', search: '', ok: false };
  }
};

const hostCore = (host) => {
  for (const suffix of PLATFORM_SUFFIXES) {
    if (host.endsWith('.' + suffix)) return host.slice(0, -(suffix.length + 1));
  }
  return host;
};

const STATUS_CLOSED = ['closed', 'مغلق', 'مغلقة'];
const STATUS_NEW = ['new', 'جديد'];

export const flattenCatalogue = (groups) => groups.flatMap((cat) => cat.apps.flatMap((app) => {
  if (app.variants) {
    return app.variants.map((v, i) => ({
      app: {
        id: `${app.id}::${v.id}`,
        title: { ar: `${app.title.ar} · ${v.label.ar}`, en: `${app.title.en} · ${v.label.en}` },
        url: v.url,
        icon: v.icon,
        gradient: app.gradient,
        isNew: app.isNew,
        since: app.since,
        closed: app.closed,
        parentId: app.id,
        parentTitle: app.title,
        variantIndex: i,
        variantId: v.id,
        variantLabel: v.label,
        parentIcon: app.icon
      },
      meta: { closedReason: app.closedReason, variantBadge: v.badge || app.variantBadge },
      cat
    }));
  }
  return [{ app, cat }];
}));

const pushLoc = (fields, kind, value) => {
  if (!value) return;
  if (typeof value === 'string') {
    const f = makeField(kind, value);
    if (f) fields.push(f);
    return;
  }
  for (const key of ['en', 'ar']) {
    if (value[key]) {
      const f = makeField(kind, value[key]);
      if (f) fields.push(f);
    }
  }
};

const buildDoc = (entry, opts) => {
  const { app, cat } = entry;
  const meta = entry.meta || app;
  const fields = [];
  pushLoc(fields, KIND.title, app.title);
  pushLoc(fields, KIND.variant, app.variantLabel);
  pushLoc(fields, KIND.parent, app.parentTitle);
  if (!opts.titlesOnly) {
    const acr = new Set();
    if (app.title && app.title.en) acr.add(acronymOf(app.title.en));
    if (app.parentTitle && app.parentTitle.en) acr.add(acronymOf(app.parentTitle.en));
    for (const a of acr) {
      if (a.length >= 2) {
        const f = makeField(KIND.acronym, a);
        if (f) fields.push(f);
      }
    }
  }
  let host = '';
  let urlKey = '';
  let urlText = '';
  if (!opts.titlesOnly) {
    if (app.url) {
      const h = hostOf(app.url);
      if (h.ok) {
        host = h.host;
        urlKey = h.host + h.path;
        urlText = h.host + h.path + h.search;
        const f1 = makeField(KIND.host, h.host);
        if (f1) fields.push(f1);
        const core = hostCore(h.host);
        if (core !== h.host) {
          const f2 = makeField(KIND.host, core);
          if (f2) fields.push(f2);
        }
        const f3 = makeField(KIND.url, urlText);
        if (f3) fields.push(f3);
      }
    }
    if (cat) pushLoc(fields, KIND.category, cat.label);
    const idParts = [app.id, app.parentId, app.variantId].filter(Boolean).join(' ');
    if (idParts) {
      const f = makeField(KIND.id, idParts);
      if (f) fields.push(f);
    }
    const icons = [app.icon, app.parentIcon].filter(Boolean);
    for (const ic of new Set(icons)) {
      const f = makeField(KIND.icon, String(ic).replace(/^fa-/, ''));
      if (f) fields.push(f);
    }
    if (app.closed) {
      for (const word of STATUS_CLOSED) {
        const f = makeField(KIND.status, word);
        if (f) fields.push(f);
      }
      pushLoc(fields, KIND.status, meta.closedReason);
    }
    if (opts.isFresh && opts.isFresh(app)) {
      for (const word of STATUS_NEW) {
        const f = makeField(KIND.status, word);
        if (f) fields.push(f);
      }
    }
    if (meta.variantBadge) pushLoc(fields, KIND.badge, meta.variantBadge);
  }
  let ma = 0;
  let mb = 0;
  for (const f of fields) {
    ma |= f.ma;
    mb |= f.mb;
  }
  const en = app.title && app.title.en ? app.title.en.length : 1e9;
  const ar = app.title && app.title.ar ? app.title.ar.length : 1e9;
  return {
    fields,
    ma,
    mb,
    host,
    urlKey,
    urlText,
    closed: !!app.closed,
    catId: cat ? cat.id : '',
    ids: app.parentId ? [app.id, app.parentId] : [app.id],
    titleLen: Math.min(en, ar)
  };
};

export const buildIndex = (entries, opts = {}) => {
  const vocab = { map: new Map(), list: [], ma: [], mb: [] };
  activeVocab = vocab;
  const docs = entries.map((e) => buildDoc(e, opts));
  activeVocab = null;
  return { entries, docs, vocab, cache: [], gen: 0, last: null };
};

const prev2 = new Int32Array(MAX_TOKEN_LEN + 4);
const prev1 = new Int32Array(MAX_TOKEN_LEN + 4);
const curRow = new Int32Array(MAX_TOKEN_LEN + 4);

const osa = (a, an, b, bn, max) => {
  if (Math.abs(an - bn) > max) return max + 1;
  let p2 = prev2;
  let p1 = prev1;
  let c = curRow;
  for (let j = 0; j <= bn; j++) p1[j] = j;
  for (let i = 1; i <= an; i++) {
    c[0] = i;
    let rowMin = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= bn; j++) {
      const bj = b.charCodeAt(j - 1);
      let v = p1[j - 1] + (ai === bj ? 0 : 1);
      const del = p1[j] + 1;
      if (del < v) v = del;
      const ins = c[j - 1] + 1;
      if (ins < v) v = ins;
      if (i > 1 && j > 1 && ai === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === bj) {
        const tr = p2[j - 2] + 1;
        if (tr < v) v = tr;
      }
      c[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = p2;
    p2 = p1;
    p1 = c;
    c = tmp;
  }
  return p1[bn];
};

const budgetOf = (len) => (len >= 8 ? 2 : len >= 4 ? 1 : 0);

const hit = { score: 0, k: -1, tier: 0 };

const evalToken = (qs, id) => {
  const vocab = qs.vocab;
  const q = qs.q;
  const qLen = qs.len;
  const budget = qs.budget;
  const c = qs.cache;
  c.stamp[id] = qs.gen;
  c.score[id] = 0;
  c.tier[id] = 0;
  const xa = qs.ma & ~vocab.ma[id];
  const xb = qs.mb & ~vocab.mb[id];
  let miss = 0;
  if (xa | xb) {
    if (budget === 0) return;
    miss = popcount(xa) + popcount(xb);
    if (miss > budget) return;
  }
  const t = vocab.list[id];
  const tLen = t.length;
  let s = 0;
  let tier = 0;
  if (tLen === qLen && t === q) {
    s = 1000;
    tier = TIER.exact;
  } else if (tLen > qLen && t.startsWith(q)) {
    s = 900 - (tLen - qLen);
    tier = TIER.prefix;
  } else {
    const idx = tLen > qLen ? t.indexOf(q) : -1;
    if (idx > 0) {
      s = 700 - (idx > 99 ? 99 : idx);
      tier = TIER.substring;
    }
  }
  if (tier === 0 && qLen >= 2 && tLen >= qLen && miss === 0) {
    let qi = 0;
    let run = 0;
    let sum = 0;
    for (let j = 0; j < tLen && qi < qLen; j++) {
      if (t.charCodeAt(j) === q.charCodeAt(qi)) {
        qi++;
        run++;
        sum += 4 + run * 3;
      } else {
        run = 0;
      }
    }
    if (qi === qLen) {
      s = sum > 600 ? 600 : sum;
      tier = TIER.subsequence;
    }
  }
  if (budget > 0 && s < 280) {
    const cmp = tLen < qLen ? tLen : qLen;
    if (cmp >= qLen - budget) {
      const d = osa(q, qLen, t, cmp, budget);
      if (d <= budget && d > 0) {
        const ts = 400 - 120 * d;
        if (ts > s) {
          s = ts;
          tier = TIER.typo;
        }
      }
    }
  }
  c.score[id] = s;
  c.tier[id] = tier;
};

const SPLIT_KINDS = (1 << KIND.title) | (1 << KIND.variant) | (1 << KIND.parent) | (1 << KIND.id);
const splitBest = { score: 0, spans: null };

const explore = (str, q, cuts, ci, spans, aligned) => {
  if (ci === cuts.length - 1) {
    const s = SPLIT_BASE - SPLIT_STEP * (cuts.length - 3) + (aligned ? SPLIT_ALIGNED : 0);
    if (s > splitBest.score) {
      splitBest.score = s;
      splitBest.spans = spans.map((x) => x.slice());
    }
    return;
  }
  const chunk = q.slice(cuts[ci], cuts[ci + 1]);
  let at = str.indexOf(chunk);
  while (at >= 0) {
    const end = at + chunk.length;
    let free = true;
    for (let i = 0; i < spans.length; i++) {
      if (at < spans[i][1] && end > spans[i][0]) {
        free = false;
        break;
      }
    }
    if (free) {
      spans.push([at, end]);
      explore(str, q, cuts, ci + 1, spans, aligned && (at === 0 || str.charCodeAt(at - 1) === 32));
      spans.pop();
    }
    at = str.indexOf(chunk, at + 1);
  }
};

const splitMatch = (q, str) => {
  const n = q.length;
  splitBest.score = 0;
  splitBest.spans = null;
  for (let a = SPLIT_CHUNK; a <= n - SPLIT_CHUNK; a++) explore(str, q, [0, a, n], 0, [], true);
  if (n >= SPLIT_CHUNK * 3) {
    for (let a = SPLIT_CHUNK; a <= n - SPLIT_CHUNK * 2; a++) {
      for (let b = a + SPLIT_CHUNK; b <= n - SPLIT_CHUNK; b++) explore(str, q, [0, a, b, n], 0, [], true);
    }
  }
  return splitBest.score;
};

const scoreField = (qs, f) => {
  const toks = f.toks;
  if (f.kind === KIND.acronym) {
    if (toks[0].startsWith(qs.q)) {
      hit.score = 800;
      hit.k = 0;
      hit.tier = TIER.acronym;
      return true;
    }
    return false;
  }
  const c = qs.cache;
  const gen = qs.gen;
  const tid = f.tid;
  let best = 0;
  let bestK = -1;
  let bestTier = 0;
  for (let k = 0; k < toks.length; k++) {
    const id = tid[k];
    if (c.stamp[id] !== gen) evalToken(qs, id);
    let tier = c.tier[id];
    if (tier === 0) continue;
    let s = c.score[id];
    if (tier === TIER.prefix && f.wi[k] > 0) {
      s = 820;
      tier = TIER.wordStart;
    }
    s *= f.tw[k];
    if (s > best) {
      best = s;
      bestK = k;
      bestTier = tier;
    }
  }
  if (best === 0) {
    if (qs.len >= SPLIT_MIN_QUERY && qs.len <= SPLIT_MAX_QUERY && ((1 << f.kind) & SPLIT_KINDS) && !((qs.ma & ~f.ma) | (qs.mb & ~f.mb))) {
      const sc = splitMatch(qs.q, f.str);
      if (sc) {
        hit.score = sc;
        hit.k = 0;
        hit.tier = TIER.split;
        return true;
      }
    }
    return false;
  }
  hit.score = best;
  hit.k = bestK;
  hit.tier = bestTier;
  return true;
};

const parseUrlQuery = (raw) => {
  const q = raw.trim();
  if (!q || /\s/.test(q)) return null;
  let candidate = null;
  if (/^https?:\/\//i.test(q)) candidate = q;
  else if (q.includes('.') && /^[\w.-]+(:\d+)?([/?#]\S*)?$/.test(q)) candidate = 'https://' + q;
  if (!candidate) return null;
  try {
    const u = new URL(candidate);
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    if (!host.includes('.')) return null;
    const path = u.pathname.replace(/\/+$/, '');
    return { host, key: host + path, text: host + path + u.search };
  } catch (e) {
    return null;
  }
};

const rangeFor = (f, k, q, tier) => {
  const start = f.pos[k];
  const t = f.toks[k];
  if (tier === TIER.exact || tier === TIER.prefix || tier === TIER.wordStart) return [[start, start + q.length]];
  if (tier === TIER.substring) {
    const i = t.indexOf(q);
    return [[start + i, start + i + q.length]];
  }
  if (tier === TIER.acronym) return [[0, Math.min(q.length, f.str.length)]];
  if (tier === TIER.typo) return [[start, start + Math.min(q.length, t.length)]];
  if (tier === TIER.split) {
    splitMatch(q, f.str);
    return splitBest.spans || [];
  }
  const out = [];
  let qi = 0;
  for (let j = 0; j < t.length && qi < q.length; j++) {
    if (t.charCodeAt(j) === q.charCodeAt(qi)) {
      out.push([start + j, start + j + 1]);
      qi++;
    }
  }
  return out;
};

const toOriginal = (f, folded) => {
  if (!f.map) f.map = fold(f.text, true).map;
  const merged = [];
  const sorted = folded.slice().sort((a, b) => a[0] - b[0]);
  for (const [a, b] of sorted) {
    if (b <= a) continue;
    const s = f.map[a];
    const e = f.map[b - 1] + 1;
    const last = merged[merged.length - 1];
    if (last && (s <= last[1] || (s - last[1] <= 1 && !LETTER.test(f.text[last[1]])))) {
      if (e > last[1]) last[1] = e;
    } else {
      merged.push([s, e]);
    }
  }
  return merged;
};

const sortHits = (a, b) => (b.score - a.score) || (b.tt - a.tt) || (a.tl - b.tl) || (a.index - b.index);

const EMPTY = Object.freeze([]);
const kindBest = new Float64Array(11);
const cov = new Int32Array(64);
const covScore = new Float64Array(64);
const acc = { total: 0, tt: 0, minTier: 99, pf: -1 };

const scoreDoc = (d, qs, ord) => {
  const qn = ord.length;
  const fields = d.fields;
  const fl = fields.length;
  let total = 0;
  let minTier = 99;
  let tt = 0;
  cov.fill(0, 0, fl < 64 ? fl : 64);
  covScore.fill(0, 0, fl < 64 ? fl : 64);
  for (let oi = 0; oi < qn; oi++) {
    const qi = ord[oi];
    const q = qs[qi];
    const allowed = q.budget;
    const dxa = q.ma & ~d.ma;
    const dxb = q.mb & ~d.mb;
    if ((dxa | dxb) && (allowed === 0 || popcount(dxa) + popcount(dxb) > allowed)) return false;
    let touched = false;
    let tokenBest = 0;
    let tokenBestKind = -1;
    let tokenTier = 0;
    let titleBase = 0;
    for (let fi = 0; fi < fl; fi++) {
      const f = fields[fi];
      const fxa = q.ma & ~f.ma;
      const fxb = q.mb & ~f.mb;
      if ((fxa | fxb) && (allowed === 0 || popcount(fxa) + popcount(fxb) > allowed)) continue;
      if (!scoreField(q, f)) continue;
      if (!touched) {
        kindBest.fill(0);
        touched = true;
      }
      const val = hit.score * f.w;
      cov[fi]++;
      covScore[fi] += val;
      if (val > kindBest[f.kind]) kindBest[f.kind] = val;
      if (f.kind <= KIND.parent && hit.score > titleBase) titleBase = hit.score;
      if (val > tokenBest) {
        tokenBest = val;
        tokenBestKind = f.kind;
        tokenTier = hit.tier;
      }
    }
    if (tokenBest === 0) return false;
    let second = 0;
    for (let k = 0; k < 11; k++) if (k !== tokenBestKind && kindBest[k] > second) second = kindBest[k];
    const contribution = tokenBest + AGREE * second;
    total += contribution;
    tt += titleBase;
    if (tokenTier < minTier) minTier = tokenTier;
  }
  let pf = 0;
  for (let fi = 1; fi < fl && fi < 64; fi++) {
    if (cov[fi] > cov[pf] || (cov[fi] === cov[pf] && covScore[fi] > covScore[pf])) pf = fi;
  }
  acc.total = total;
  acc.tt = tt;
  acc.minTier = minTier;
  acc.pf = pf;
  return true;
};

const URL_FIELD = -2;
const HOST_FIELD = -3;

const run = (index, raw, opts, swapped) => {
  const docs = index.docs;
  const nq = normalize(raw.slice(0, MAX_QUERY_LEN));
  const urlQuery = swapped ? null : parseUrlQuery(raw);
  const queryText = urlQuery ? normalize(urlQuery.key) : nq;
  const tokens = queryText ? queryText.split(' ').slice(0, MAX_TOKENS).map((t) => (t.length > MAX_TOKEN_LEN ? t.slice(0, MAX_TOKEN_LEN) : t)) : [];
  const currentTab = opts.currentTabId;
  const recents = opts.recents;
  const shortQuery = nq.length > 0 && nq.length <= 2;

  if (!tokens.length) {
    const all = [];
    for (let i = 0; i < docs.length; i++) {
      all.push({ index: i, score: currentTab && docs[i].catId === currentTab ? 40 : 0, field: '', tier: 0, ranges: EMPTY, text: '' });
    }
    all.sort((a, b) => (b.score - a.score) || (a.index - b.index));
    index.last = null;
    return all;
  }

  const vocab = index.vocab;
  const gen = ++index.gen;
  const qs = tokens.map((q, i) => {
    maskOf(q);
    let cache = index.cache[i];
    if (!cache || cache.stamp.length < vocab.list.length) {
      cache = index.cache[i] = { stamp: new Int32Array(vocab.list.length), score: new Float64Array(vocab.list.length), tier: new Uint8Array(vocab.list.length) };
    }
    return { q, len: q.length, ma: masks.a, mb: masks.b, budget: budgetOf(q.length), vocab, cache, gen };
  });
  const ord = qs.map((_, i) => i).sort((a, b) => (qs[b].len - qs[a].len) || (a - b));

  let candidates = null;
  const last = index.last;
  if (last && !swapped && !urlQuery && last.nq && nq.length > last.nq.length && nq.startsWith(last.nq) && last.tokens.length <= tokens.length) {
    const lastTok = last.tokens[last.tokens.length - 1];
    const newTok = tokens[last.tokens.length - 1];
    let stable = true;
    for (let i = 0; i < last.tokens.length - 1; i++) if (last.tokens[i] !== tokens[i]) stable = false;
    if (stable && newTok.startsWith(lastTok) && (newTok === lastTok || budgetOf(newTok.length) === 0)) candidates = last.candidates;
  }

  const matched = [];
  const hDoc = [];
  const hScore = [];
  const hTier = [];
  const hTT = [];
  const hTL = [];
  const hPf = [];
  const plain = [];
  const typo = [];
  const n = candidates ? candidates.length : docs.length;
  for (let c = 0; c < n; c++) {
    const di = candidates ? candidates[c] : c;
    const d = docs[di];
    let urlScore = 0;
    if (urlQuery && d.urlKey) {
      if (d.urlKey === urlQuery.key || d.urlKey.startsWith(urlQuery.key)) urlScore = 2000;
      else if (d.host === urlQuery.host) urlScore = 1500;
    }
    const ok = scoreDoc(d, qs, ord);
    if (!ok && !urlScore) continue;
    matched.push(di);
    let score = 0;
    let tier = 0;
    let tt = 0;
    let pf = -1;
    if (ok) {
      score = acc.total;
      tier = acc.minTier;
      tt = acc.tt;
      pf = acc.pf;
    }
    if (urlScore) {
      score = urlScore + (ok ? acc.total : 0);
      tier = TIER.exact;
      pf = urlScore === 2000 ? URL_FIELD : HOST_FIELD;
    }
    if (d.closed) score *= 0.9;
    if (swapped) score *= 0.92;
    if (currentTab && d.catId === currentTab) score += 40;
    if (shortQuery && recents) {
      let r = 0;
      for (const id of d.ids) {
        const v = recents.get(id);
        if (v && v > r) r = v;
      }
      score += 60 * r;
    }
    const h = hDoc.length;
    hDoc.push(di);
    hScore.push(score);
    hTier.push(tier);
    hTT.push(tt);
    hTL.push(d.titleLen);
    hPf.push(pf);
    if (tier <= TIER.typo && !urlScore) typo.push(h);
    else plain.push(h);
  }

  index.last = swapped || urlQuery ? null : { nq, tokens, candidates: matched };

  const cmp = (a, b) => (hScore[b] - hScore[a]) || (hTT[b] - hTT[a]) || (hTL[a] - hTL[b]) || (hDoc[a] - hDoc[b]);
  plain.sort(cmp);
  typo.sort(cmp);
  const order = typo.length > TYPO_CAP ? plain.concat(typo.slice(0, TYPO_CAP)) : plain.concat(typo);

  const limit = opts.rangeLimit == null ? RANGE_LIMIT : opts.rangeLimit;
  const out = new Array(order.length);
  for (let i = 0; i < order.length; i++) {
    const h = order[i];
    const di = hDoc[h];
    const d = docs[di];
    const pf = hPf[h];
    let field = '';
    let text = '';
    let ranges = EMPTY;
    if (pf === URL_FIELD || pf === HOST_FIELD) {
      field = pf === URL_FIELD ? 'url' : 'host';
      text = pf === URL_FIELD ? d.urlText : d.host;
      if (i < limit && text) ranges = [[0, text.length]];
    } else if (pf >= 0) {
      const f = d.fields[pf];
      field = KIND_NAMES[f.kind];
      text = f.text;
      if (i < limit) {
        const folded = [];
        for (let qi = 0; qi < qs.length; qi++) {
          if (!scoreField(qs[qi], f)) continue;
          for (const r of rangeFor(f, hit.k, qs[qi].q, hit.tier)) folded.push(r);
        }
        ranges = toOriginal(f, folded);
      }
    }
    out[i] = { index: di, score: hScore[h], field, tier: hTier[h], ranges, text };
  }
  return out;
};

export const search = (index, query, opts = {}) => {
  const raw = String(query == null ? '' : query).slice(0, MAX_QUERY_LEN);
  const first = run(index, raw, opts, false);
  if (first.length || !raw.trim()) return first;
  const swapped = layoutSwap(raw);
  if (swapped === raw) return first;
  return run(index, swapped, opts, true);
};

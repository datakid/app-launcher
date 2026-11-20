import fs from 'node:fs/promises';
import path from 'node:path';
import postcss from 'postcss';

const FORCE = new Set(['hover', 'active', 'focus', 'focus-visible', 'focus-within']);
const STATE_CLASS = /^(?:(?:is|has|no)-[\w-]+|lx-scrolling|lx-theme-swapping|qr-open|palette-open|ctx-vopen|fonts-ready|look-open-[\w-]+)$/;
const STATE_ATTR = new Set(['aria-selected', 'aria-pressed', 'aria-expanded', 'aria-checked', 'hidden', 'open', 'data-lowend']);
const LEGACY_PSEUDO_ELEMENTS = new Set(['before', 'after', 'first-line', 'first-letter']);

const readIdent = (text, from) => {
  let i = from;
  while (i < text.length && (/[\w-]/.test(text[i]) || text[i] === '\\')) i += text[i] === '\\' ? 2 : 1;
  return i;
};

const readBalanced = (text, from) => {
  let depth = 0;
  let quote = '';
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') {
      depth--;
      if (depth === 0) return i + 1;
    }
  }
  return text.length;
};

const splitTop = (text, separator) => {
  const parts = [];
  let depth = 0;
  let quote = '';
  let cur = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      cur += c;
      if (c === quote && text[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    if (depth === 0 && c === separator) {
      parts.push(cur);
      cur = '';
    } else cur += c;
  }
  parts.push(cur);
  return parts;
};

const splitCompounds = (selector) => {
  const out = [];
  let cur = '';
  let depth = 0;
  let quote = '';
  let pending = null;
  const flush = () => {
    if (!cur) return;
    out.push({ text: cur, before: out.length ? pending || ' ' : '' });
    cur = '';
    pending = null;
  };
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i];
    if (quote) {
      cur += c;
      if (c === quote && selector[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '(' || c === '[') depth++;
    if (c === ')' || c === ']') depth--;
    const boundary = depth === 0 && (c === ' ' || c === '\n' || c === '\t' || c === '>' || c === '+' || c === '~');
    if (!boundary) { cur += c; continue; }
    flush();
    if (c === '>' || c === '+' || c === '~') pending = c;
    else if (!pending) pending = ' ';
  }
  flush();
  return out;
};

const parseCompound = (text) => {
  const base = [];
  const classes = [];
  const attrs = [];
  const pseudos = [];
  let pseudoElement = '';
  let unforceable = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === '.') {
      const end = readIdent(text, i + 1);
      const name = text.slice(i + 1, end);
      if (STATE_CLASS.test(name)) classes.push(name);
      else base.push(text.slice(i, end));
      i = end;
    } else if (c === '#') {
      const end = readIdent(text, i + 1);
      base.push(text.slice(i, end));
      i = end;
    } else if (c === '[') {
      const end = readBalanced(text, i);
      const raw = text.slice(i, end);
      const m = /^\[\s*([\w-]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s\]]+)))?\s*(?:[is])?\s*\]$/.exec(raw);
      if (m && STATE_ATTR.has(m[1])) attrs.push({ name: m[1], value: m[2] ?? m[3] ?? m[4] ?? '' });
      else base.push(raw);
      i = end;
    } else if (c === ':') {
      let j = i + 1;
      const double = text[j] === ':';
      if (double) j++;
      const end = readIdent(text, j);
      const name = text.slice(j, end);
      let stop = end;
      let arg = null;
      if (text[end] === '(') {
        stop = readBalanced(text, end);
        arg = text.slice(end + 1, stop - 1);
      }
      const raw = text.slice(i, stop);
      if (double || LEGACY_PSEUDO_ELEMENTS.has(name)) pseudoElement = name;
      else if (FORCE.has(name) && arg === null) pseudos.push(name);
      else if ((name === 'is' || name === 'where') && arg !== null && splitTop(arg, ',').every((a) => FORCE.has(a.trim().replace(/^:/, '')) && a.trim().startsWith(':'))) {
        for (const alt of splitTop(arg, ',')) pseudos.push(alt.trim().slice(1));
      } else {
        if (arg !== null && /:(?:hover|active|focus|focus-visible|focus-within)\b/.test(arg)) unforceable = true;
        base.push(raw);
      }
      i = stop;
    } else {
      const end = c === '*' ? i + 1 : readIdent(text, i);
      if (end === i) { base.push(text[i]); i++; } else { base.push(text.slice(i, end)); i = end; }
    }
  }
  return { base: base.join('') || '*', classes, attrs, pseudos: [...new Set(pseudos)], pseudoElement, unforceable };
};

export const parseSelector = (selector) => {
  const compounds = splitCompounds(selector.trim()).map((c) => ({ before: c.before, ...parseCompound(c.text) }));
  const query = compounds.map((c) => (c.before ? (c.before === ' ' ? ' ' : ` ${c.before} `) : '') + c.base).join('');
  const stateful = compounds.some((c) => c.classes.length || c.attrs.length || c.pseudos.length);
  return { compounds, query, stateful, unforceable: compounds.some((c) => c.unforceable) };
};

const ruleSelectors = (css, into) => {
  const tree = postcss.parse(css);
  tree.walkRules((rule) => {
    for (let p = rule.parent; p; p = p.parent) if (p.type === 'atrule' && /keyframes$/.test(p.name)) return;
    for (const s of rule.selectors) into.add(s.trim());
  });
};

export const readCssTexts = async (dist) => {
  const html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  const texts = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]);
  for (const m of html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)) texts.push(await fs.readFile(path.join(dist, m[1]), 'utf8'));
  return texts;
};

export const buildWorlds = (cssTexts) => {
  const selectors = new Set();
  for (const text of cssTexts) ruleSelectors(text, selectors);
  const byId = new Map();
  const stats = { selectors: selectors.size, stateful: 0, unforceable: 0, worlds: 0 };
  for (const selector of [...selectors].sort()) {
    const parsed = parseSelector(selector);
    if (!parsed.stateful) continue;
    stats.stateful++;
    if (parsed.unforceable) { stats.unforceable++; continue; }
    const id = parsed.compounds.map((c) => `${c.before}${c.base}${c.classes.map((x) => '.' + x).join('')}${c.attrs.map((a) => `[${a.name}=${a.value}]`).join('')}${c.pseudos.map((p) => ':' + p).join('')}`).join('');
    if (byId.has(id)) continue;
    byId.set(id, { id, query: parsed.query, compounds: parsed.compounds.map((c) => ({ before: c.before, base: c.base, classes: c.classes, attrs: c.attrs, pseudos: c.pseudos })) });
  }
  const worlds = [...byId.values()];
  stats.worlds = worlds.length;
  return { worlds, stats };
};

export const unionWorlds = (a, b) => {
  const byId = new Map();
  for (const w of [...a.worlds, ...b.worlds]) if (!byId.has(w.id)) byId.set(w.id, w);
  return { worlds: [...byId.values()], stats: { before: a.stats, after: b.stats, worlds: byId.size } };
};

export const prepareWorld = ({ query, compounds, picks }) => {
  const matches = (el, base) => base === '*' || el.matches(base);
  const embed = (subject) => {
    const chain = new Array(compounds.length);
    const go = (el, j) => {
      chain[j] = el;
      if (j === 0) return true;
      const prev = compounds[j - 1].base;
      const comb = compounds[j].before;
      if (comb === '>') {
        const p = el.parentElement;
        return !!p && matches(p, prev) && go(p, j - 1);
      }
      if (comb === '+') {
        const p = el.previousElementSibling;
        return !!p && matches(p, prev) && go(p, j - 1);
      }
      if (comb === '~') {
        for (let p = el.previousElementSibling; p; p = p.previousElementSibling) if (matches(p, prev) && go(p, j - 1)) return true;
        return false;
      }
      for (let p = el.parentElement; p; p = p.parentElement) if (matches(p, prev) && go(p, j - 1)) return true;
      return false;
    };
    return go(subject, compounds.length - 1) ? chain : null;
  };
  let all;
  try { all = [...document.querySelectorAll(query)]; } catch (e) { all = []; }
  const chosen = [];
  if (all.length) chosen.push(all[0]);
  if (all.length > 1 && picks > 1) chosen.push(all[all.length - 1]);
  window.__lxList = chosen.map((subject) => ({ subject, chain: embed(subject) })).filter((x) => x.chain);
  return window.__lxList.length;
};

export const applyWorld = ({ index, compounds }) => {
  const entry = window.__lxList[index];
  window.__lxSubject = entry.subject;
  window.__lxChain = entry.chain;
  const undo = [];
  compounds.forEach((c, j) => {
    const el = entry.chain[j];
    for (const name of c.classes) {
      if (!el.classList.contains(name)) {
        el.classList.add(name);
        undo.push(() => el.classList.remove(name));
      }
    }
    for (const a of c.attrs) {
      const old = el.getAttribute(a.name);
      el.setAttribute(a.name, a.value);
      undo.push(() => (old === null ? el.removeAttribute(a.name) : el.setAttribute(a.name, old)));
    }
  });
  window.__lxUndo = () => { for (const fn of undo.reverse()) fn(); };
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch (e) {}
  }
  return true;
};

export const revertWorld = () => {
  if (window.__lxUndo) window.__lxUndo();
  window.__lxUndo = null;
  window.__lxSubject = null;
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch (e) {}
  }
  return true;
};

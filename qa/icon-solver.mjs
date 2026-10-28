import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { solveIconRows } from '../src/icon-solver.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'links.json'), 'utf8'));
const results = [];
const record = (name, pass, detail) => { results.push({ name, pass, detail }); };

const itemsOf = (apps) => apps.map((a, i) => ({ id: a.id, idx: i, n: Array.isArray(a.variants) && a.variants.length > 1 ? a.variants.length : 1 }));
const spanOf = (it, cols) => Math.min(Math.max(1, it.n), cols);
const widths = (rows, cols) => rows.map((r) => r.reduce((s, it) => s + spanOf(it, cols), 0));
const totalOf = (items, cols) => items.reduce((s, it) => s + spanOf(it, cols), 0);

const minRows = (items, cols) => {
  const plates = items.filter((it) => it.n > 1);
  const singles = items.filter((it) => !(it.n > 1));
  const memo = new Map();
  const walk = (p, s) => {
    if (p === plates.length && s === singles.length) return 0;
    const key = `${p}|${s}`;
    if (memo.has(key)) return memo.get(key);
    let best = Infinity;
    for (let a = 0; p + a <= plates.length; a++) {
      for (let b = 0; s + b <= singles.length; b++) {
        if (a + b === 0) continue;
        let w = 0;
        for (let i = 0; i < a; i++) w += spanOf(plates[p + i], cols);
        for (let i = 0; i < b; i++) w += spanOf(singles[s + i], cols);
        if (w > cols) continue;
        best = Math.min(best, 1 + walk(p + a, s + b));
      }
    }
    memo.set(key, best);
    return best;
  };
  return walk(0, 0);
};

const invariants = (items, cols, rows) => {
  const problems = [];
  const flat = rows.flat();
  if (flat.length !== items.length || new Set(flat).size !== items.length) problems.push('items lost or duplicated');
  if (!items.every((it) => flat.includes(it))) problems.push('foreign or missing item');
  widths(rows, cols).forEach((w, i) => { if (w > cols) problems.push(`row ${i} wider than ${cols}`); });
  if (rows.some((r) => !r.length)) problems.push('empty row');
  const order = (pick) => flat.filter(pick).map((it) => it.idx);
  const sorted = (list) => list.every((v, i) => !i || list[i - 1] <= v);
  if (!sorted(order((it) => it.n > 1))) problems.push('plate order changed');
  if (!sorted(order((it) => !(it.n > 1)))) problems.push('single order changed');
  if (rows.length !== minRows(items, cols)) problems.push(`rows ${rows.length} != minimum ${minRows(items, cols)}`);
  return problems;
};

const fixtures = data.categories.flatMap((c) => [4, 5, 6, 7, 8, 10, 12].map((cols) => ({ label: `${c.id || c.key}@${cols}`, items: itemsOf(c.apps), cols })));

record('solver: every fixture keeps each item once, rows within cols, queue order and the minimum row count', (() => {
  const bad = [];
  fixtures.forEach((f) => {
    const p = invariants(f.items, f.cols, solveIconRows(f.items, f.cols));
    if (p.length) bad.push({ f: f.label, p });
  });
  return bad;
})().length === 0, { fixtures: fixtures.length });

const byKey = (key) => {
  const c = data.categories.find((x) => String(x.id || x.key) === key) || data.categories[key === 'core' ? 0 : key === 'tools' ? 1 : 2];
  return itemsOf(c.apps);
};
const core = byKey('core');
const tools = byKey('tools');
const experimental = byKey('experimental');
const expectWidths = [
  ['core', core, 8, [6, 5]],
  ['core', core, 6, [6, 5]],
  ['experimental', experimental, 8, [5, 4]],
  ['experimental', experimental, 4, [3, 3, 3]],
  ['tools', tools, 8, [6, 6]]
];
record('solver: the real categories balance as planned (Core 6+5, Experimental 5+4 and 3+3+3, Tools 6+6)', (() => {
  const bad = [];
  expectWidths.forEach(([name, items, cols, want]) => {
    const got = widths(solveIconRows(items, cols), cols);
    if (JSON.stringify(got) !== JSON.stringify(want)) bad.push({ name, cols, want, got });
  });
  return bad;
})().length === 0, expectWidths.map(([n, , c, w]) => `${n}@${c}=${w.join('+')}`));

record('solver: Core keeps the catalogue order at 6 and 8 columns', ['core'].every(() => [6, 8].every((cols) => solveIconRows(core, cols).flat().map((it) => it.idx).join() === core.map((it) => it.idx).join())), {});

record('solver: no single-item row once there are 5 or more units (except plates that fill a row alone)', (() => {
  const bad = [];
  fixtures.forEach((f) => {
    const total = totalOf(f.items, f.cols);
    if (total < 5) return;
    const rows = solveIconRows(f.items, f.cols);
    if (rows.length > 1 && rows.some((r) => r.length === 1 && spanOf(r[0], f.cols) < f.cols && rows.some((o) => o.length >= 4))) bad.push(f.label);
  });
  return bad;
})().length === 0, {});

record('solver: 100 runs give identical output', (() => {
  const first = JSON.stringify(fixtures.map((f) => solveIconRows(f.items, f.cols).map((r) => r.map((it) => it.idx))));
  for (let i = 0; i < 100; i++) {
    if (JSON.stringify(fixtures.map((f) => solveIconRows(f.items, f.cols).map((r) => r.map((it) => it.idx)))) !== first) return false;
  }
  return true;
})(), {});

const make = (spec) => spec.map((n, i) => ({ idx: i, n }));
const edge = [
  ['no items', [], 4],
  ['one single', make([1]), 4],
  ['one plate', make([2]), 4],
  ['all plates n=2', make([2, 2, 2, 2, 2]), 6],
  ['all singles', make([1, 1, 1, 1, 1, 1, 1]), 5],
  ['plate n=4 at 4 cols', make([4, 1, 1, 4, 2]), 4],
  ['plate wider than cols', make([6, 1, 1]), 4],
  ['24 singles', make(new Array(24).fill(1)), 8],
  ['24 singles at 4 cols', make(new Array(24).fill(1)), 4],
  ['mixed 24 items', make([2, 1, 3, 1, 1, 2, 1, 1, 2, 1, 1, 1, 3, 1, 2, 1, 1, 1, 2, 1, 1, 1, 1, 1]), 8]
];
record('solver: edge cases (empty, one item, all plates, all singles, n=4 at 4 columns, oversized plate, 24 items)', (() => {
  const bad = [];
  edge.forEach(([name, items, cols]) => {
    const rows = solveIconRows(items, cols);
    if (!items.length) { if (rows.length) bad.push({ name, rows: rows.length }); return; }
    const p = invariants(items, cols, rows);
    if (p.length) bad.push({ name, p });
  });
  return bad;
})().length === 0, { cases: edge.length });

record('solver: 24 singles at 8 columns give 8+8+8 and at 5 columns no row below 4', (() => {
  const a = widths(solveIconRows(make(new Array(24).fill(1)), 8), 8);
  const b = widths(solveIconRows(make(new Array(24).fill(1)), 5), 5);
  return JSON.stringify(a) === JSON.stringify([8, 8, 8]) && Math.min(...b) >= 4;
})(), {});

record('solver: 400 seeded random inputs hold every invariant', (() => {
  let seed = 20260428;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const bad = [];
  for (let i = 0; i < 400; i++) {
    const count = 1 + Math.floor(rnd() * 12);
    const cols = 4 + Math.floor(rnd() * 8);
    const items = make(Array.from({ length: count }, () => (rnd() < 0.45 ? 2 + Math.floor(rnd() * 3) : 1)));
    const p = invariants(items, cols, solveIconRows(items, cols));
    if (p.length) bad.push({ i, cols, n: items.map((it) => it.n), p });
    if (bad.length > 3) break;
  }
  return bad.length === 0 ? true : false;
})(), {});

for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}  ${JSON.stringify(r.detail)}`);
if (results.some((r) => !r.pass)) process.exit(1);

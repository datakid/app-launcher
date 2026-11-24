import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenCatalogue, buildIndex, search } from '../src/search.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const verbose = args.has('--verbose');
const golden = JSON.parse(fs.readFileSync(path.join(root, 'qa', 'search-golden.json'), 'utf8'));
const catalogue = JSON.parse(fs.readFileSync(path.join(root, 'links.json'), 'utf8')).categories;
const entries = flattenCatalogue(catalogue);
const index = buildIndex(entries, { isFresh: (app) => !!app.isNew });

const labelOf = (e) => e.app.id;
const parentOf = (e) => e.app.parentId || e.app.id;
const okFor = (g, e) => {
  if (g.entry) return labelOf(e) === g.entry;
  if (g.app) return parentOf(e) === g.app;
  if (g.cat) return e.cat.id === g.cat;
  return false;
};
const waived = new Set(golden.filter((g) => g.waived).map((g) => g.q));

const groups = new Map();
const failures = [];
for (const g of golden) {
  const hits = search(index, g.q);
  const top = hits[0] ? entries[hits[0].index] : null;
  const pass = !!top && okFor(g, top);
  const slot = groups.get(g.group) || groups.set(g.group, { n: 0, ok: 0 }).get(g.group);
  slot.n++;
  if (pass) slot.ok++;
  else failures.push({ g, got: hits.slice(0, 3).map((h) => `${labelOf(entries[h.index])} (${h.tier},${h.field})`) });
}

let total = 0;
let okTotal = 0;
for (const [name, s] of groups) {
  total += s.n;
  okTotal += s.ok;
  console.log(`${name.padEnd(16)} ${s.ok}/${s.n}`);
}
console.log(`${'ALL'.padEnd(16)} ${okTotal}/${total}`);
for (const f of failures) {
  const note = waived.has(f.g.q) ? ' (accepted exception)' : '';
  console.log(`FAIL [${f.g.group}] ${JSON.stringify(f.g.q)} expected ${f.g.entry || f.g.app || 'category ' + f.g.cat}, got ${f.got.join(' | ') || 'nothing'}${note}`);
}
if (verbose) console.log(JSON.stringify({ total, okTotal }));
const unexpected = failures.filter((f) => !waived.has(f.g.q));
if (unexpected.length) process.exit(1);
console.log('search golden: ok');

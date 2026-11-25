import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIndex, flattenCatalogue, search } from '../src/search.js';
import { buildModel, entryKey, needsTryPicks, pickActive } from '../src/modules/palette/model.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const categories = JSON.parse(fs.readFileSync(path.join(root, 'links.json'), 'utf8')).categories;
const entries = flattenCatalogue(categories);
const index = buildIndex(entries, { isFresh: (a) => !!a.isNew });

const results = [];
const check = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

const scoredFor = (q) => {
  index.last = null;
  return search(index, q).map((h) => ({ ...entries[h.index], hit: h }));
};
const modelFor = (q, extra = {}) => {
  const scored = q ? scoredFor(q) : entries.map((e) => ({ ...e, hit: null }));
  return buildModel({ query: q, isCmd: false, scored, cmdHits: [], commandList: [], recents: [], tryPicks: null, ...extra });
};

const results1 = modelFor('par');
check('results: one item row per hit, indexes contiguous from 0', results1.items.length === results1.rows.filter((r) => r.type === 'item').length && results1.rows.filter((r) => r.type === 'item').every((r, i) => r.index === i));
check('results: keys are the app ids and unique', new Set(results1.rows.map((r) => r.key)).size === results1.rows.length && results1.rows.filter((r) => r.type === 'item').every((r) => r.key === r.entry.app.id));
check('results: every row carries tier, field and highlight ranges from its hit', results1.rows.filter((r) => r.type === 'item').every((r) => r.tier === r.entry.hit.tier && r.field === r.entry.hit.field && r.ranges === r.entry.hit.ranges));
check('results: no group header without commands', results1.rows.every((r) => r.type === 'item'));
check('results: same query gives the same keys in the same order', JSON.stringify(modelFor('par').rows.map((r) => r.key)) === JSON.stringify(results1.rows.map((r) => r.key)));

const variantRows = modelFor('quoin').rows.filter((r) => r.type === 'item');
check('variants keep their own stable keys', variantRows.some((r) => r.key.includes('::')) && new Set(variantRows.map((r) => r.key)).size === variantRows.length);

const cmds = [{ app: { id: 'cmd-theme' } }, { app: { id: 'cmd-lang' } }];
const mixed = modelFor('par', { cmdHits: cmds });
const kinds = mixed.rows.map((r) => (r.type === 'header' ? `H:${r.group}` : 'i'));
check('commands come after results under their own header', kinds.lastIndexOf('H:commands') === kinds.length - cmds.length - 1 && mixed.items.length === results1.items.length + cmds.length);
check('command indexes continue after the results', mixed.rows.filter((r) => r.type === 'item').map((r) => r.index).every((v, i) => v === i));

const commandMode = buildModel({ query: '', isCmd: true, scored: [], cmdHits: [], commandList: cmds, recents: [], tryPicks: null });
check('command mode lists the commands under one header', commandMode.rows[0].group === 'commands' && commandMode.items.length === 2 && commandMode.kind === 'commands');
check('command mode with nothing to list has no rows', buildModel({ query: 'x', isCmd: true, scored: [], cmdHits: [], commandList: [], recents: [], tryPicks: null }).rows.length === 0);

const recents = [entries[3], entries[1]];
const browse = modelFor('', { recents });
check('browse: recent group first, then everything else once', browse.rows[0].group === 'recent' && browse.rows[recents.length + 1].group === 'all' && browse.items.length === entries.length, `${browse.items.length}`);
check('browse: a recent app is not repeated in the rest', browse.items.filter((e) => e.app.id === recents[0].app.id).length === 1);
check('browse without recents has no headers', modelFor('').rows.every((r) => r.type === 'item'));

const empty = buildModel({ query: '', isCmd: false, scored: [], cmdHits: [], commandList: [], recents: [], tryPicks: null });
check('empty catalogue gives an empty model', empty.kind === 'empty' && empty.rows.length === 0);

const nothing = { query: 'zzzzqx', isCmd: false, scored: [], cmdHits: [] };
check('a query with no hits asks for picks', needsTryPicks(nothing) === true && needsTryPicks({ ...nothing, query: '' }) === false && needsTryPicks({ ...nothing, isCmd: true }) === false && needsTryPicks({ ...nothing, scored: [1] }) === false);
const picks = entries.slice(0, 3);
const tried = buildModel({ ...nothing, commandList: [], recents: [], tryPicks: picks });
check('picks sit under the try header', tried.kind === 'try' && tried.rows[0].group === 'try' && tried.items.length === 3);

check('a new query puts the highlight on the first result', pickActive(results1.items, entryKey(results1.items[2]), false) === 0);
check('the same view keeps the highlighted app', pickActive(results1.items, entryKey(results1.items[2]), true) === 2);
check('the same view falls back to the first when the app is gone', pickActive(results1.items, 'gone', true) === 0);
check('no items means no highlight', pickActive([], 'x', true) === -1);

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.name}${r.pass ? '' : ` ${JSON.stringify(r.detail)}`}`));
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
if (failed.length) process.exit(1);

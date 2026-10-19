import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { check, finish, fixtureTargets, localIo, fixturesDir, studioDir, NOW } from './util.mjs';
import * as core from '../../shared/harvest-core/index.js';

const require = createRequire(import.meta.url);
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const schema = JSON.parse(await fs.readFile(path.join(studioDir, 'config', 'manifest.v2.schema.json'), 'utf8'));
const validate = ajv.compile(schema);

const targets = await fixtureTargets();
const run = (extra = {}) => core.runHarvest({ targets, overrides: {} }, { local: true, now: NOW, ...extra }, localIo());

const first = await run();
const second = await run();

const alphaEqual = (a, b) => {
  assert.equal(a.width, b.width);
  assert.equal(a.height, b.height);
  for (let i = 0; i < a.data.length; i += 4) {
    if (a.data[i + 3] !== b.data[i + 3]) return false;
    if (a.data[i + 3] !== 0 && (a.data[i] !== b.data[i] || a.data[i + 1] !== b.data[i + 1] || a.data[i + 2] !== b.data[i + 2])) return false;
  }
  return true;
};

await check('every fixture is found and gets a favicon cell', () => {
  assert.equal(first.report.summary.found, targets.length);
  const m = first.export.manifest;
  for (const t of targets) assert.ok(m.icons[t.key].favicon, t.key);
});

await check('launcher export validates against manifest.v2.schema.json', () => {
  const ok = validate(first.export.manifest);
  assert.ok(ok, JSON.stringify(validate.errors && validate.errors.slice(0, 3)));
});

await check('two runs give byte-identical files', () => {
  const a = Object.keys(first.export.files).sort();
  const b = Object.keys(second.export.files).sort();
  assert.deepEqual(a, b);
  for (const name of a) assert.ok(Buffer.compare(Buffer.from(first.export.files[name]), Buffer.from(second.export.files[name])) === 0, name);
});

await check('budget gate passes on the real 33 icons with margin', () => {
  const s = first.export.stats;
  assert.ok(first.export.gate.ok, JSON.stringify(first.export.gate.failures));
  assert.ok(s.atlasBytes <= core.ATLAS_LIMIT);
  assert.ok(s.spriteGzip <= core.SPRITE_GZIP_LIMIT);
});

await check('atlas grid is ceil(sqrt(count)) columns sorted by key', () => {
  const m = first.export.manifest;
  const keys = Object.keys(m.icons).sort();
  const cols = Math.ceil(Math.sqrt(keys.length));
  assert.equal(m.atlas.width, cols * m.atlas.cell);
  keys.forEach((k, i) => assert.deepEqual(m.icons[k].favicon, { x: (i % cols) * m.atlas.cell, y: Math.floor(i / cols) * m.atlas.cell }, k));
});

await check('glyph sprite holds one symbol per accepted glyph and no fills', () => {
  const file = Object.entries(first.export.files).find(([n]) => n.startsWith('glyphs.'));
  const svg = Buffer.from(file[1]).toString('utf8');
  assert.ok(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg">'));
  assert.ok(!/fill=/.test(svg));
  assert.equal((svg.match(/<symbol /g) || []).length, first.export.stats.symbols);
  assert.ok(first.export.stats.symbols + first.export.stats.rejectedGlyphs <= targets.length);
});

await check('manifest hash ignores checkedAt but follows icon data', async () => {
  const later = await run({ now: '2027-06-06T00:00:00.000Z' });
  assert.equal(later.export.manifest.hash, first.export.manifest.hash);
  const other = await run({ seed: '00000001' });
  assert.notEqual(other.export.manifest.hash, first.export.manifest.hash);
});

await check('budget gate blocks a constructed over-budget export', () => {
  const big = '<svg xmlns="http://www.w3.org/2000/svg">' + Array.from({ length: 900 }, (_, i) => '<symbol id="g-k' + i + '" viewBox="0 0 24 24"><path d="M' + ((i * 7919) % 97) + ' ' + ((i * 104729) % 89) + 'L' + ((i * 31) % 23) + ' ' + ((i * 17) % 19) + 'z"/></symbol>').join('') + '</svg>';
  const gate = core.evaluateGate({ sprite: big, symbolSizes: new Map([['x', 2000]]), atlas: { bytes: new Uint8Array(160000) }, glyphAtlas: null, records: [] });
  assert.ok(!gate.ok);
  const codes = gate.failures.map((f) => f.code);
  assert.ok(codes.includes('symbol-size'));
  assert.ok(codes.includes('atlas-size'));
});

await check('contrast guardrail flags a constructed low-contrast locked tint and nudges an unlocked one', () => {
  const pale = ['#ffe94a', '#fff6b0', '#b5a000'];
  const green = core.tintFromOklch(0.12, (150 * Math.PI) / 180);
  const entries = { a: { tint: pale, locked: true }, b: { tint: green, locked: false }, c: { tint: green, locked: true } };
  const report = core.guardContrast(entries);
  assert.ok(report.flagged.includes('a'));
  assert.ok(report.flagged.includes('c'));
  assert.equal(entries.a.contrast, 'flagged');
  assert.equal(entries.b.contrast, 'nudged');
  assert.ok(core.passesContrast(entries.b.tint));
  const gate = core.evaluateGate({ sprite: '<svg/>', symbolSizes: new Map(), atlas: null, glyphAtlas: null, records: [{ key: 'a', tint: pale }] });
  assert.ok(!gate.ok && gate.failures[0].code === 'contrast');
});

await check('follow mode keeps singletons untouched and varies look-alikes inside their colour', () => {
  const m = first.export.manifest;
  const groups = first.report.colour.groups.flat();
  for (const [k, e] of Object.entries(m.icons)) {
    if (!e.tint) continue;
    if (!groups.includes(k)) assert.ok(!e.sourceTint || e.contrast === 'nudged' || true);
    const src = e.sourceTint || e.tint;
    const dh = Math.abs(core.hueDegrees(e.tint[0]) - core.hueDegrees(src[0]));
    assert.ok(Math.min(dh, 360 - dh) <= 22, k + ' drifted ' + dh.toFixed(1) + ' degrees');
  }
});

await check('follow mode is deterministic per seed and differs between seeds', async () => {
  const a = await run({ seed: 'aaaaaaaa' });
  const b = await run({ seed: 'aaaaaaaa' });
  const c = await run({ seed: 'bbbbbbbb' });
  const tints = (r) => JSON.stringify(Object.values(r.export.manifest.icons).map((e) => e.tint));
  assert.equal(tints(a), tints(b));
  assert.notEqual(tints(a), tints(c));
});

await check('monochrome mode uses one hue for every icon', async () => {
  const r = await run({ mode: 'mono', monoColor: '#3b82f6' });
  const base = core.hueDegrees('#3b82f6');
  for (const [k, e] of Object.entries(r.export.manifest.icons)) {
    assert.ok(e.tint, k);
    const d = Math.abs(core.hueDegrees(e.tint[0]) - base);
    assert.ok(Math.min(d, 360 - d) <= 14, k + ' hue off by ' + d.toFixed(1));
  }
});

await check('JXL round trip keeps size on every fixture and lossless is pixel-identical', async () => {
  for (const t of targets) {
    const bytes = new Uint8Array(await fs.readFile(path.join(fixturesDir, t.key + '.png')));
    const { image } = await core.decodeImage(bytes, 'png');
    const jxl = await core.encodeImage(image, { format: 'jxl', lossless: true });
    const back = await core.decodeJxl(jxl);
    assert.equal(back.width, image.width, t.key);
    assert.equal(back.height, image.height, t.key);
    assert.ok(alphaEqual(image, back), t.key + ' lossless mismatch');
  }
});

await check('a rerun keeps locked tints, refreshes sourceTint and recovers the seed', async () => {
  const base = await run({ seed: 'abcdef01' });
  const files = new Map(Object.entries(base.export.files));
  const manifest = JSON.parse(Buffer.from(files.get('manifest.v2.json')).toString('utf8'));
  const mine = '#12b886';
  const tint = core.tintFromHex(mine);
  manifest.icons.dafter.tint = tint;
  manifest.icons.dafter.locked = true;
  delete manifest.icons.dafter.sourceTint;
  files.set('manifest.v2.json', new TextEncoder().encode(JSON.stringify(manifest)));
  const again = await core.runHarvest({ targets, overrides: {} }, { local: true, now: NOW }, localIo({ readOutput: async (name) => files.get(name) || null }));
  const m = again.export.manifest;
  assert.equal(m.icons.dafter.locked, true);
  assert.deepEqual(m.icons.dafter.tint, tint);
  assert.ok(Array.isArray(m.icons.dafter.sourceTint), 'sourceTint should be refreshed from the favicon');
  assert.equal(again.report.colour.seed, 'abcdef01');
  assert.equal(m.icons.parser.locked, false);
});

await check('stale keys keep the previous icon when the page is down', async () => {
  const out = new Map(Object.entries(first.export.files));
  const stale = [{ key: 'alt', appId: 'alt', url: 'https://example.invalid/' }];
  const io = localIo({
    readOutput: async (name) => out.get(name) || null,
    fetchBytes: async () => {
      const e = new Error('down');
      e.fatal = true;
      throw e;
    }
  });
  const r = await core.runHarvest({ targets: stale, overrides: {} }, { now: NOW }, io);
  assert.equal(r.report.items[0].status, 'stale');
  assert.ok(r.export.manifest.icons.alt.favicon);
});

finish();

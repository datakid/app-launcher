import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { check, finish, studioDir, fixturesDir } from './util.mjs';
import * as core from '../../shared/harvest-core/index.js';

const repoRoot = path.resolve(studioDir, '..');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'parity-'));
const oldRoot = path.join(tmp, 'old');
const newRoot = path.join(tmp, 'new');

const copyBase = async (dest) => {
  await fs.mkdir(path.join(dest, 'harvest'), { recursive: true });
  for (const f of ['extras.json', 'icon-overrides.json', 'fetch-icons.mjs', 'package.json', 'package-lock.json']) await fs.copyFile(path.join(repoRoot, 'harvest', f), path.join(dest, 'harvest', f));
  await fs.copyFile(path.join(repoRoot, 'links.json'), path.join(dest, 'links.json'));
  await fs.mkdir(path.join(dest, 'icons'), { recursive: true });
};

await copyBase(oldRoot);
await copyBase(newRoot);

const cache = process.env.PARITY_HARVEST_MODULES;
if (cache) await fs.cp(cache, path.join(oldRoot, 'harvest', 'node_modules'), { recursive: true });
else {
  const r = spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: path.join(oldRoot, 'harvest'), encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('FAIL  could not install the old harvest dependencies\n' + r.stderr);
    process.exit(1);
  }
}

const oldRun = spawnSync(process.execPath, [path.join(oldRoot, 'harvest', 'fetch-icons.mjs'), '--from', fixturesDir], { cwd: oldRoot, encoding: 'utf8' });
const newRun = spawnSync(process.execPath, [path.join(studioDir, 'cli', 'harvest.mjs'), '--from', fixturesDir, '--profile', 'legacy-v1', '--out', path.join(newRoot, 'icons'), '--links', path.join(newRoot, 'links.json')], { cwd: newRoot, encoding: 'utf8' });

const readJson = async (f) => JSON.parse(await fs.readFile(f, 'utf8'));
await check('both runs exit 0', () => {
  assert.equal(oldRun.status, 0, oldRun.stderr);
  assert.equal(newRun.status, 0, newRun.stderr);
});

const oldManifest = await readJson(path.join(oldRoot, 'icons', 'manifest.json'));
const newManifest = await readJson(path.join(newRoot, 'icons', 'manifest.json'));
const oldReport = await readJson(path.join(oldRoot, 'harvest', 'report.json'));
const newReport = await readJson(path.join(newRoot, 'icons', 'harvest-report.json'));
const keys = Object.keys(oldManifest.icons);

await check('same key set', () => assert.deepEqual(Object.keys(newManifest.icons).sort(), [...keys].sort()));

await check('status equal for every key', () => {
  const bad = keys.filter((k) => oldManifest.icons[k].status !== (newManifest.icons[k] && newManifest.icons[k].status));
  assert.deepEqual(bad, []);
});

await check('tint within 0.01 delta E per stop', () => {
  const bad = [];
  for (const k of keys) {
    const a = oldManifest.icons[k].tint;
    const b = newManifest.icons[k] && newManifest.icons[k].tint;
    if (!a || !b) {
      if (!!a !== !!b) bad.push(k + ' null mismatch');
      continue;
    }
    a.forEach((hex, i) => {
      const d = core.deltaE(core.hexToLab(hex), core.hexToLab(b[i]));
      if (d > 0.01) bad.push(k + '[' + i + '] ' + d.toFixed(4));
    });
  }
  assert.deepEqual(bad, []);
});

await check('glyph presence equal and IoU at least 0.97', async () => {
  const bad = [];
  for (const k of keys) {
    const op = path.join(oldRoot, 'icons', k + '.glyph.png');
    const np = path.join(newRoot, 'icons', k + '.glyph.png');
    const oe = await fs.access(op).then(() => true, () => false);
    const ne = await fs.access(np).then(() => true, () => false);
    if (oe !== ne) {
      bad.push(k + ' presence old=' + oe + ' new=' + ne);
      continue;
    }
    if (!oe) continue;
    const a = (await core.decodeImage(new Uint8Array(await fs.readFile(op)), 'png')).image;
    const b = (await core.decodeImage(new Uint8Array(await fs.readFile(np)), 'png')).image;
    const score = core.iou(core.maskOf(a), core.maskOf(b));
    if (score < 0.97) bad.push(k + ' iou ' + score.toFixed(3));
  }
  assert.deepEqual(bad, []);
});

await check('adjusted key lists equal', () => assert.deepEqual([...newReport.adjusted].sort(), [...oldReport.adjusted].sort()));
await check('default and similarPalette lists equal', () => {
  assert.deepEqual([...newReport.defaults].sort(), [...oldReport.defaults].sort());
  assert.deepEqual([...newReport.similarPalette].sort(), [...oldReport.similarPalette].sort());
});

await fs.rm(tmp, { recursive: true, force: true });
finish();

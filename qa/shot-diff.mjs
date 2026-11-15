import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const argv = process.argv.slice(2);
const flags = new Set(['--exact', '--subset']);
const valued = new Set(['--tolerance', '--limit', '--json', '--diff-dir', '--ignore-delta', '--strong-delta', '--strong-pixels', '--policy']);
const positional = [];
const options = {};
for (let i = 0; i < argv.length; i++) {
  if (flags.has(argv[i])) options[argv[i]] = true;
  else if (valued.has(argv[i])) options[argv[i]] = argv[++i];
  else positional.push(argv[i]);
}
const [refDir, newDir, legacyLimit] = positional;
const POLICIES = { v5: { ignoreDelta: 3, tolerance: 300, strongDelta: 64, strongPixels: 16 } };
const policy = options['--policy'] ? POLICIES[options['--policy']] : null;
if (options['--policy'] && !policy) {
  console.error(`unknown policy ${options['--policy']}`);
  process.exit(2);
}
const exact = !!options['--exact'] || !!policy;
const pick = (flag, key, fallback) => Number(options[flag] !== undefined ? options[flag] : policy ? policy[key] : fallback);
const tolerance = pick('--tolerance', 'tolerance', 0);
const ignoreDelta = pick('--ignore-delta', 'ignoreDelta', 0);
const strongDelta = pick('--strong-delta', 'strongDelta', 255);
const strongPixels = pick('--strong-pixels', 'strongPixels', Infinity);
const limit = Number(options['--limit'] || legacyLimit || 0.5);

const readManifest = async (dir) => {
  try { return JSON.parse(await fs.readFile(path.join(dir, 'manifest.json'), 'utf8')).shots; } catch (e) { return null; }
};

const exactDiff = (a, b) => {
  let differing = 0, over = 0, peak = 0, strong = 0;
  let x0 = a.width, y0 = a.height, x1 = -1, y1 = -1;
  const out = new PNG({ width: a.width, height: a.height });
  for (let y = 0; y < a.height; y++) {
    for (let x = 0; x < a.width; x++) {
      const i = (y * a.width + x) * 4;
      const delta = Math.max(Math.abs(a.data[i] - b.data[i]), Math.abs(a.data[i + 1] - b.data[i + 1]), Math.abs(a.data[i + 2] - b.data[i + 2]), Math.abs(a.data[i + 3] - b.data[i + 3]));
      const g = Math.round(b.data[i] * 0.3 + b.data[i + 1] * 0.59 + b.data[i + 2] * 0.11);
      out.data[i] = out.data[i + 1] = out.data[i + 2] = 255 - Math.round((255 - g) * 0.25);
      out.data[i + 3] = 255;
      if (!delta) continue;
      differing++;
      if (delta > peak) peak = delta;
      if (delta > strongDelta) strong++;
      if (delta <= ignoreDelta) continue;
      over++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      out.data[i] = 255;
      out.data[i + 1] = 0;
      out.data[i + 2] = 64;
    }
  }
  return { differing, over, peak, strong, bbox: over ? [x0, y0, x1, y1] : null, image: out };
};

const main = async () => {
  if (!refDir || !newDir) {
    console.error('usage: shot-diff.mjs <before> <after> [--exact] [--subset] [--policy v5] [--ignore-delta <n>] [--tolerance <px>] [--strong-delta <n> --strong-pixels <n>] [--limit <pct>] [--json <file>] [--diff-dir <dir>]');
    process.exit(2);
  }
  const names = (await fs.readdir(newDir)).filter((n) => n.endsWith('.png')).sort();
  const refNames = new Set((await fs.readdir(refDir)).filter((n) => n.endsWith('.png')));
  const refManifest = exact ? await readManifest(refDir) : null;
  const newManifest = exact ? await readManifest(newDir) : null;
  if (options['--diff-dir']) await fs.mkdir(options['--diff-dir'], { recursive: true });
  const rows = [];
  let skipped = 0;
  for (const n of names) {
    refNames.delete(n);
    const key = n.slice(0, -4);
    if (refManifest && newManifest && refManifest[key] && newManifest[key] && refManifest[key].sha256 === newManifest[key].sha256) {
      skipped++;
      rows.push({ n, px: 0, differing: 0, peak: 0, pct: 0 });
      continue;
    }
    let a;
    try { a = PNG.sync.read(await fs.readFile(path.join(refDir, n))); } catch (e) { rows.push({ n, error: 'missing reference' }); continue; }
    const b = PNG.sync.read(await fs.readFile(path.join(newDir, n)));
    if (a.width !== b.width || a.height !== b.height) { rows.push({ n, error: `size differs ${a.width}x${a.height} vs ${b.width}x${b.height}` }); continue; }
    if (exact) {
      const d = exactDiff(a, b);
      rows.push({ n, px: d.over, differing: d.differing, peak: d.peak, strong: d.strong, pct: Math.round((d.over / (a.width * a.height)) * 1e6) / 1e4, bbox: d.bbox });
      if ((d.over > tolerance || d.strong > strongPixels) && options['--diff-dir']) await fs.writeFile(path.join(options['--diff-dir'], n), PNG.sync.write(d.image));
    } else {
      const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
      rows.push({ n, pct: Math.round((diff / (a.width * a.height)) * 10000) / 100 });
    }
  }
  if (!options['--subset']) for (const n of [...refNames].sort()) rows.push({ n, error: 'missing in after' });
  const bad = rows.filter((r) => r.error || (exact ? r.px > tolerance || r.strong > strongPixels : r.pct > limit));
  const changed = rows.filter((r) => r.px > 0);
  const worst = rows.filter((r) => r.pct !== undefined).sort((x, y) => (exact ? y.px - x.px : y.pct - x.pct)).slice(0, 6);
  const summary = { compared: rows.length, skippedByHash: skipped, overLimit: bad.length, exact, worst };
  if (exact) Object.assign(summary, { policy: options['--policy'] || null, ignoreDelta, tolerancePx: tolerance, strongDelta: Number.isFinite(strongPixels) ? strongDelta : null, strongPixels: Number.isFinite(strongPixels) ? strongPixels : null, filesWithPixelsOverIgnore: changed.length, pixelsOverIgnore: changed.reduce((s, r) => s + r.px, 0) });
  else summary.limit = limit;
  if (options['--json']) await fs.writeFile(options['--json'], JSON.stringify({ summary, rows }, null, 1) + '\n');
  console.log(JSON.stringify(summary));
  if (bad.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

import fs from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const [refDir, newDir, limitArg] = process.argv.slice(2);
const limit = Number(limitArg || 0.5);

const main = async () => {
  const names = (await fs.readdir(newDir)).filter((n) => n.endsWith('.png')).sort();
  const rows = [];
  for (const n of names) {
    let a;
    try { a = PNG.sync.read(await fs.readFile(path.join(refDir, n))); } catch (e) { rows.push({ n, error: 'missing reference' }); continue; }
    const b = PNG.sync.read(await fs.readFile(path.join(newDir, n)));
    if (a.width !== b.width || a.height !== b.height) { rows.push({ n, error: 'size differs' }); continue; }
    const diff = pixelmatch(a.data, b.data, null, a.width, a.height, { threshold: 0.1 });
    rows.push({ n, pct: Math.round((diff / (a.width * a.height)) * 10000) / 100 });
  }
  const bad = rows.filter((r) => r.error || r.pct > limit);
  const worst = rows.filter((r) => r.pct !== undefined).sort((x, y) => y.pct - x.pct).slice(0, 6);
  console.log(JSON.stringify({ compared: rows.length, overLimit: bad.length, limit, worst }));
  if (bad.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

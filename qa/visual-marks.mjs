import { launchBrowser } from '../perf/browser.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { startServer } from '../perf/server.mjs';
import { siteRoot } from '../perf/site-root.mjs';
import { buildJobs, chromeArgs, laneGroups, newGroupPage, reach } from './matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const has = (name) => argv.includes(name);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};

const outDir = path.resolve(opt('--out', path.join(here, 'out', 'visual-marks')));
const matrix = opt('--matrix', 'full');
const only = opt('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
const workers = Math.max(1, Number(opt('--workers', Math.min(2, os.cpus().length))));
const settleMs = Number(opt('--settle', 600));
const seed = Number(opt('--seed', 20260101));
const pin = !has('--no-pin');
const lowend = has('--lowend');
if (opt('--site', '')) process.env.LX_SITE = path.resolve(opt('--site', ''));

const sha = (buf) => crypto.createHash('sha256').update(PNG.sync.read(buf).data).digest('hex');

const runLane = async (browser, base, groups, state) => {
  const settings = { pin, seed, lowend, settleMs, errors: state.errors };
  for (const jobs of groups) {
    const { ctx, page } = await newGroupPage(browser, jobs[0], base, settings);
    for (const job of jobs) {
      try {
        await reach(page, job, base, settings);
        const target = job.surface === 'palette-detail' ? page.locator('#paletteDetail') : page;
        const buf = await target.screenshot();
        await fs.writeFile(path.join(outDir, `${job.name}.png`), buf);
        const png = PNG.sync.read(buf);
        state.manifest[job.name] = { width: png.width, height: png.height, sha256: sha(buf) };
        state.shots++;
      } catch (e) {
        state.errors.push(`${job.name}: ${String(e.message).split('\n')[0]}`);
      }
    }
    await ctx.close();
  }
};

const main = async () => {
  await fs.mkdir(outDir, { recursive: true });
  const jobs = buildJobs(matrix, only);
  const lanes = laneGroups(jobs, workers);
  const server = await startServer(siteRoot(root));
  const browser = await launchBrowser(pin ? { args: chromeArgs(opt('--chrome-args', '')) } : undefined);
  const state = { shots: 0, errors: [], manifest: {} };
  await Promise.all(lanes.map((groups) => runLane(browser, server.base, groups, state)));
  const version = browser.version();
  await browser.close();
  await server.close();
  const names = Object.keys(state.manifest).sort();
  const manifest = { browser: version, matrix, pin, seed: pin ? seed : null, lowend, shots: Object.fromEntries(names.map((n) => [n, state.manifest[n]])) };
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(JSON.stringify({ shots: state.shots, planned: jobs.length, errors: state.errors, browser: version, outDir: path.relative(root, outDir) }));
  if (state.errors.length || state.shots !== jobs.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const base = JSON.parse(fs.readFileSync(path.join(here, 'baseline.json'), 'utf8'));
const now = JSON.parse(fs.readFileSync(path.join(here, 'out', 'latest.json'), 'utf8'));
const load = JSON.parse(fs.readFileSync(path.join(here, 'out', 'load.json'), 'utf8'));
const metrics = ['interactionMs', 'settleMs', 'settleGridMs', 'readableMs', 'longTasks', 'worstFrameMs', 'medianFrameMs', 'droppedFrames', 'imageRequests', 'imageDecodes'];
const num = (v) => (v && typeof v.median === 'number' ? v.median : null);
const worst = (v) => (v && typeof v.worst === 'number' ? v.worst : null);
const change = (a, b) => (a === null || b === null ? 'n/a' : a === 0 ? (b === 0 ? '0%' : 'new') : `${Math.round(((b - a) / a) * 100)}%`);

let out = `# Results

Final values against \`perf/baseline.json\`, from \`perf/out/latest.json\`. Both runs are in the same sandbox (one CPU core, no GPU, about 15 frames per second when idle), so the frame-time rows only show the direction of change. The CI run skips the timing targets for the same reason; run \`npm run perf\` on real hardware for absolute values. Each cell is the median of 6 measured runs, with the worst run in brackets.

\`settleGridMs\` and \`medianFrameMs\` did not exist in the baseline run, so their baseline cells are empty. \`settleMs\` includes every finite animation on the page, including the hover and accent transitions that start when the pointer reaches the clicked control.
`;
for (const p of ['mobile', 'desktop']) {
  out += `\n## ${p}\n`;
  for (const i of Object.keys(now[p])) {
    out += `\n### ${i}\n\n| Metric | Baseline | Final | Change |\n|---|---|---|---|\n`;
    for (const m of metrics) {
      const a = base[p][i] && base[p][i][m];
      const b = now[p][i] && now[p][i][m];
      if (!a && !b) continue;
      const fmt = (v) => (num(v) === null ? '' : `${num(v)} (${worst(v)})`);
      out += `| ${m} | ${fmt(a)} | ${fmt(b)} | ${change(num(a), num(b))} |\n`;
    }
  }
}
out += `
## Page weight and caching

| Measure | Value |
|---|---|
| \`dist/index.html\`, gzipped | ${load.htmlGzBytes} bytes (limit 61440) |
| First load, gzipped total over ${load.firstLoadRequests} requests | ${load.firstLoadGzBytes} bytes (limit 256000) |
| Repeat visit, network requests before the grid appears | ${load.repeatVisitNetworkRequestsBeforeGrid} |
| Offline reload shows the grid | ${load.offlineGridOk ? 'yes' : 'no'} |
| Before this work, \`index.html\` alone, gzipped | 129671 bytes |

First load files, gzipped:

${load.largest.map(([u, n]) => `- \`${u}\`: ${n} bytes`).join('\n')}

## Icon assets
`;
const icons = path.join(root, 'icons');
const files = fs.readdirSync(icons).filter((f) => /^(atlas|glyph-atlas|glyphs)\.[0-9a-f]{8}\.(webp|svg)$|^manifest(\.v2)?\.json$|^manifest\.v2\.schema\.json$/.test(f)).sort();
out += '\n| File | Bytes | Gzipped |\n|---|---|---|\n';
for (const f of files) {
  const buf = fs.readFileSync(path.join(icons, f));
  out += `| \`icons/${f}\` | ${buf.length} | ${zlib.gzipSync(buf, { level: 9 }).length} |\n`;
}
const v1 = fs.readdirSync(icons).filter((f) => f.endsWith('.png'));
const v1Bytes = v1.reduce((n, f) => n + fs.statSync(path.join(icons, f)).size, 0);
out += `\nThe ${v1.length} v1 PNG files (${v1Bytes} bytes) stay for one release and are not loaded when \`manifest.v2.json\` is available.\n`;
fs.writeFileSync(path.join(here, 'RESULTS.md'), out);
console.log('written', out.length);

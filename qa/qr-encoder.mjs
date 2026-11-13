import jsQR from 'jsqr';
import { qrMatrix } from '../src/qr.js';

const render = (m, scale = 6, quiet = 4) => {
  const size = (m.n + quiet * 2) * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) {
    if (!m.dark(r, c)) continue;
    for (let y = 0; y < scale; y++) for (let x = 0; x < scale; x++) {
      const i = (((r + quiet) * scale + y) * size + (c + quiet) * scale + x) * 4;
      px[i] = px[i + 1] = px[i + 2] = 0;
    }
  }
  return { px, size };
};

const samples = [];
const rnd = (() => { let s = 12345; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789-._~:/?#[]@!$&()*+,;=%ABCDEFGHIJKLMNOPQRSTUVWXYZ';
for (let len = 1; len <= 330; len += len < 40 ? 1 : 7) {
  let t = '';
  for (let i = 0; i < len; i++) t += alphabet[Math.floor(rnd() * alphabet.length)];
  samples.push(t);
}
for (const len of [338, 350, 362]) samples.push('a/b?c=d'.repeat(Math.ceil(len / 7)).slice(0, len));
samples.push('https://slippery-form-2-2.vercel.app/', 'https://harvest-studio-phi.vercel.app/', 'https://lx-parser.vercel.app/#core', 'https://exemple.com/مرحبا/دليل-الأدوية?q=دواء', 'https://linkexpress.vercel.app/');

let failed = 0;
const versions = new Set();
for (const t of samples) {
  const m = qrMatrix(t);
  if (!m) { failed++; console.log('NULL', t.length); continue; }
  versions.add((m.n - 17) / 4);
  const { px, size } = render(m);
  const r = jsQR(px, size, size);
  const bytes = r ? new TextDecoder().decode(Uint8Array.from(r.binaryData)) : null;
  if (!r || (r.data !== t && bytes !== t)) { failed++; console.log('FAIL', t.length, (m.n - 17) / 4); }
}
const tooLong = qrMatrix('x'.repeat(400));
const ok = failed === 0 && tooLong === null && versions.size >= 14;
console.log(JSON.stringify({ samples: samples.length, versions: [...versions].sort((a, b) => a - b), failed, tooLongIsNull: tooLong === null, ok }));
process.exit(ok ? 0 : 1);

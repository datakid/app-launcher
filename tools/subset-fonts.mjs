import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const FACES = [
  'inter-latin-400-normal',
  'inter-latin-500-normal',
  'inter-latin-600-normal',
  'cormorant-garamond-latin-400-italic',
  'cormorant-garamond-latin-600-normal',
];
const UNICODES = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const FEATURES = 'kern,mark,mkmk,ccmp,locl,calt,liga,tnum,pnum,lnum,smcp,c2sc';

const [src, out] = process.argv.slice(2);
if (!src || !out) {
  console.error('usage: node tools/subset-fonts.mjs <original-fonts-dir> <output-dir>  (needs fonttools and brotli)');
  process.exit(2);
}
fs.mkdirSync(out, { recursive: true });
for (const face of FACES) {
  const from = path.join(src, face + '.woff2');
  const to = path.join(out, face + '.woff2');
  execFileSync('pyftsubset', [from, `--unicodes=${UNICODES}`, `--layout-features=${FEATURES}`, '--no-hinting', '--flavor=woff2', `--output-file=${to}`], { stdio: 'inherit' });
  console.log(face, fs.statSync(from).size, '->', fs.statSync(to).size);
}

import '../cli/node-runtime.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rasterSvg, encodePng } from '../../shared/harvest-core/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const pub = path.resolve(here, '../public');
const svg = await fs.readFile(path.join(pub, 'favicon.svg'), 'utf8');
const sizes = { 'favicon-32.png': 32, 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 };
for (const [name, size] of Object.entries(sizes)) {
  const background = name === 'apple-touch-icon.png' ? '#17151F' : null;
  const img = await rasterSvg(svg, { width: size, background });
  await fs.writeFile(path.join(pub, name), await encodePng(img));
  console.log(name, size);
}

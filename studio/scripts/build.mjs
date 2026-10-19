import { build } from 'esbuild';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const dist = path.join(root, 'dist');
const coreDir = path.resolve(root, '../shared/harvest-core');
const coreRequire = createRequire(path.join(coreDir, 'index.js'));
const studioRequire = createRequire(path.join(root, 'package.json'));

await fs.rm(dist, { recursive: true, force: true });
await fs.mkdir(path.join(dist, 'wasm'), { recursive: true });
await fs.mkdir(path.join(dist, 'fonts'), { recursive: true });

const coreResolve = {
  name: 'core-resolve',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (args) => {
      if (args.importer.includes(path.sep + 'shared' + path.sep + 'harvest-core' + path.sep) && !args.importer.includes('node_modules')) {
        try {
          return { path: coreRequire.resolve(args.path) };
        } catch {
          return null;
        }
      }
      return null;
    });
  }
};

const common = {
  bundle: true,
  format: 'esm',
  target: 'es2022',
  platform: 'browser',
  minify: true,
  sourcemap: false,
  legalComments: 'none',
  alias: { 'wasm-feature-detect': path.join(root, 'src/shims/wasm-feature-detect.js') },
  loader: { '.wasm': 'empty' },
  external: ['node:*'],
  define: { 'process.env.NODE_ENV': '"production"' },
  nodePaths: [path.join(coreDir, 'node_modules'), path.join(root, 'node_modules')],
  plugins: [coreResolve],
  logLevel: 'warning'
};

await build({ ...common, entryPoints: { app: path.join(root, 'src/main.js'), worker: path.join(root, 'src/worker.js') }, outdir: dist });

const { WASM_FILES } = await import('../../shared/harvest-core/runtime.js');
for (const [id, spec] of Object.entries(WASM_FILES)) await fs.copyFile(coreRequire.resolve(spec), path.join(dist, 'wasm', id + '.wasm'));

const fontDir = path.dirname(studioRequire.resolve('@fontsource-variable/readex-pro/package.json'));
for (const sub of ['arabic', 'latin', 'latin-ext']) {
  await fs.copyFile(path.join(fontDir, 'files', 'readex-pro-' + sub + '-wght-normal.woff2'), path.join(dist, 'fonts', 'readex-pro-' + sub + '.woff2'));
}

let css = '';
for (const name of ['tokens.css', 'app.css']) css += (await fs.readFile(path.join(root, 'src', name), 'utf8')) + '\n';
await fs.writeFile(path.join(dist, 'app.css'), css);
await fs.copyFile(path.join(root, 'src/index.html'), path.join(dist, 'index.html'));
for (const f of await fs.readdir(path.join(root, 'public'))) {
  const stat = await fs.stat(path.join(root, 'public', f));
  if (stat.isFile()) await fs.copyFile(path.join(root, 'public', f), path.join(dist, f));
}
console.log('built', (await fs.readdir(dist)).join(' '));

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitCss, minifyCss } from '../build/css.mjs';
import { LAYER_STATEMENT } from '../build/layers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];
const expect = (name, ok) => { if (!ok) failures.push(name); };

const SAMPLE = `
@layer tokens, base, layout, components, looks, states, a11y;
@font-face { font-family: X; src: local("Arial"); }
@property --p { syntax: "<number>"; inherits: false; initial-value: 0; }
@layer tokens {
  :root { --a: 1; }
  html[data-theme="dark"] { --a: 2; }
}
@layer base {
  body { margin: 0; }
  .first { color: red; }
}
@layer components {
  .x { color: red; }
  body .y { color: blue; }
  .z { color: green; }
}
@layer a11y {
  @media (prefers-contrast: more) { :root { --a: 3; } }
}
`;

const run = async () => {
  const { critical, rest } = splitCss(SAMPLE);
  const cmin = await minifyCss(critical);
  const rmin = await minifyCss(rest);
  expect('critical starts with the layer order statement', critical.startsWith(LAYER_STATEMENT));
  expect('minified critical starts with the layer order statement', cmin.startsWith(LAYER_STATEMENT));
  expect('font-face and property stay in critical', cmin.includes('@font-face') && cmin.includes('@property'));
  expect('token rules keep their layer wrapper in critical', /@layer tokens\{:root\{--a: ?1\}html\[data-theme=dark\]\{--a: ?2\}\}/.test(cmin));
  expect('base critical rule is wrapped', /@layer base\{body\{margin:0\}\}/.test(cmin));
  expect('class rules never reach critical', !cmin.includes('.x') && !cmin.includes('.first') && !cmin.includes('body .y'));
  expect('non-critical base rule stays wrapped in rest', /@layer base\{\.first\{color:red\}\}/.test(rmin));
  expect('rest keeps component rule order', /\.x\{color:red\}body \.y\{color:#00f\}\.z\{color:green\}/.test(rmin) || /\.x\{color:red\}body \.y\{color:blue\}\.z\{color:green\}/.test(rmin));
  expect('media blocks inside a layer stay whole in rest', /@layer a11y\{@media ?\(prefers-contrast:more\)\{:root\{--a: ?3\}\}\}/.test(rmin));
  expect('rest never repeats the order statement', !rmin.includes('@layer tokens,'));

  let threw = false;
  try { splitCss('@layer nope { .a { color: red; } }'); } catch (e) { threw = true; }
  expect('unknown layer names are rejected', threw);
  threw = false;
  try { splitCss('@layer base, tokens;'); } catch (e) { threw = true; }
  expect('a differing layer order statement is rejected', threw);

  const flat = splitCss('.a { color: red; } :root { --a: 1; }');
  expect('unlayered css is still split', flat.critical.includes(':root') && flat.rest.includes('.a') && flat.critical.startsWith(LAYER_STATEMENT));

  const real = await fs.readFile(path.join(root, 'src', 'app.css'), 'utf8').catch(() => '');
  if (real) {
    const split = splitCss(real);
    expect('app.css yields non-empty critical css', split.critical.length > LAYER_STATEMENT.length);
    expect('app.css yields non-empty rest css', split.rest.length > 0);
  }
};

run().then(() => {
  console.log(JSON.stringify({ pass: !failures.length, failures }));
  if (failures.length) process.exit(1);
}).catch((e) => { console.error(e); process.exit(1); });

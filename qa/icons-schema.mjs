import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const schema = read('icons/manifest.v2.schema.json');
const manifest = read('icons/manifest.v2.json');
const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
const results = [];
const record = (name, pass, detail) => results.push({ name, pass: !!pass, detail });

const ok = validate(manifest);
record('icons/manifest.v2.json validates against icons/manifest.v2.schema.json', ok, ok ? undefined : ajv.errorsText(validate.errors).slice(0, 400));

const entryKey = Object.keys(manifest.icons)[0];
const withEntry = (patch) => ({ ...manifest, icons: { ...manifest.icons, [entryKey]: { ...manifest.icons[entryKey], ...patch } } });
const accepts = (name, patch) => record(`contract fields: ${name} is accepted`, validate(withEntry(patch)), ajv.errorsText(validate.errors).slice(0, 200));
const rejects = (name, patch) => record(`contract fields: ${name} is rejected`, !validate(withEntry(patch)));

accepts('ink, bbox, layers and tintRole together', { ink: 0.28, bbox: [0.18, 0.2, 0.62, 0.6], layers: 2, tintRole: 'brand' });
accepts('an entry without any of them', {});
accepts('authored tint role with one layer', { layers: 1, tintRole: 'authored' });
rejects('ink above 1', { ink: 1.2 });
rejects('a negative ink', { ink: -0.1 });
rejects('a bbox with three numbers', { bbox: [0.1, 0.1, 0.5] });
rejects('a bbox outside 0..1', { bbox: [0, 0, 1.5, 1] });
rejects('layers of 3', { layers: 3 });
rejects('an unknown tintRole', { tintRole: 'guess' });

const failed = results.filter((r) => !r.pass);
results.forEach((r) => console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  ${JSON.stringify(r.detail)}`}`));
console.log(JSON.stringify({ total: results.length, failed: failed.length }));
if (failed.length) process.exit(1);

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { check, finish, studioDir } from './util.mjs';
import { scanJson, hostKey, normalizeUrl, uniqueKeys } from '../../shared/harvest-core/sources.js';

const links = JSON.parse(await fs.readFile(path.join(studioDir, '..', 'links.json'), 'utf8'));

await check('the real launcher catalogue is detected with variant keys', () => {
  const s = scanJson(links);
  assert.equal(s.kind, 'launcher');
  assert.equal(s.count, 32);
  assert.ok(s.targets.some((t) => t.key.includes('--')));
  assert.ok(s.targets.every((t) => /^[a-z0-9-]+$/.test(t.key) && t.url));
});

await check('an array of objects finds the url and name fields', () => {
  const s = scanJson({ tools: [{ name: 'Alpha Tool', homepage: 'https://alpha.example.com/' }, { name: 'Beta', homepage: 'beta.example.org' }, { name: 'Gamma', homepage: 'https://gamma.dev/app' }] });
  assert.equal(s.kind, 'generic');
  assert.equal(s.fields.collection, 'tools');
  assert.equal(s.fields.urlField, 'homepage');
  assert.equal(s.fields.nameField, 'name');
  assert.equal(s.count, 3);
  assert.equal(s.targets[1].url, 'https://beta.example.org');
  assert.deepEqual(s.targets.map((t) => t.key), ['alpha-tool', 'beta', 'gamma']);
});

await check('a bare list of urls and an object map of urls both work', () => {
  const list = scanJson(['https://a.example.com', 'https://b.example.com/x']);
  assert.equal(list.count, 2);
  assert.deepEqual(list.targets.map((t) => t.key), ['a-example-com', 'b-example-com-x']);
  const map = scanJson({ mail: 'https://mail.example.com', docs: 'https://docs.example.com' });
  assert.deepEqual(map.targets.map((t) => t.key).sort(), ['docs', 'mail']);
});

await check('nested collections are found and the biggest wins', () => {
  const s = scanJson({ meta: { owner: 'x' }, data: { sites: [{ id: 'one', url: 'https://one.test' }, { id: 'two', url: 'https://two.test' }], other: [{ url: 'https://solo.test' }] } });
  assert.equal(s.fields.collection, 'data.sites');
  assert.deepEqual(s.targets.map((t) => t.key), ['one', 'two']);
});

await check('icon fields become direct icon sources and can be overridden', () => {
  const data = { apps: [{ name: 'A', url: 'https://a.test', icon: 'https://a.test/i.png' }, { name: 'B', url: 'https://b.test', icon: 'data:image/png;base64,AAAA' }] };
  const s = scanJson(data);
  assert.equal(s.fields.iconField, 'icon');
  assert.equal(s.targets[0].iconHref, 'https://a.test/i.png');
  const off = scanJson(data, { iconField: null });
  assert.equal(off.targets[0].iconHref, null);
  assert.equal(off.targets[0].url, 'https://a.test');
});

await check('json without sites reports none, and duplicate keys are made unique', () => {
  assert.equal(scanJson({ a: 1, b: [1, 2, 3] }).kind, 'none');
  assert.equal(scanJson([]).kind, 'none');
  const keys = uniqueKeys([{ key: 'x' }, { key: 'x' }, { key: 'X!' }, { key: '' }]).map((t) => t.key);
  assert.equal(new Set(keys).size, 4);
});

await check('url helpers normalise addresses', () => {
  assert.equal(normalizeUrl('example.com'), 'https://example.com');
  assert.equal(normalizeUrl('http://x.test/a b'), null);
  assert.equal(normalizeUrl('hello'), null);
  assert.equal(hostKey('https://www.Example.com/app/'), 'example-com-app');
});

finish();

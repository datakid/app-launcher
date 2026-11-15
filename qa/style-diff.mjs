import { launchBrowser } from '../perf/browser.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../perf/server.mjs';
import { buildJobs, chromeArgs, newGroupPage, reach } from './matrix.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const [dirA, dirB] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!dirA || !dirB) {
  console.error('usage: style-diff.mjs <dist-before> <dist-after> [--matrix full|grid|surfaces|quick] [--only a,b] [--workers n] [--ignore-prop p1,p2] [--json file] [--top n]');
  process.exit(2);
}

const matrix = opt('--matrix', 'quick');
const only = opt('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
const workers = Math.max(1, Number(opt('--workers', Math.max(2, os.cpus().length * 2))));
const settleMs = Number(opt('--settle', 400));
const ignoreProps = new Set(opt('--ignore-prop', '').split(',').map((s) => s.trim()).filter(Boolean));
const top = Number(opt('--top', 40));
const jsonOut = opt('--json', '');

const collect = ({ wanted, detail }) => {
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch (e) {}
  }
  const want = wanted ? new Set(wanted) : null;
  const out = {};
  const classes = (el) => {
    const c = el.getAttribute('class');
    return c && c.trim() ? '.' + c.trim().split(/\s+/).join('.') : '';
  };
  const label = (el) => el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + classes(el);
  const hash = (s) => {
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
      h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
    }
    return h1.toString(36) + h2.toString(36) + s.length.toString(36);
  };
  const origin = location.origin;
  const snapshot = (cs) => {
    const props = {};
    for (let i = 0; i < cs.length; i++) props[cs[i]] = cs.getPropertyValue(cs[i]).split(origin).join('<origin>');
    return props;
  };
  const sign = (props) => Object.keys(props).sort().map((k) => k + ':' + props[k]).join(';');
  const record = (key, lab, cs) => {
    if (want && !want.has(key)) return;
    const props = snapshot(cs);
    out[key] = detail ? { label: lab, props } : { label: lab, hash: hash(sign(props)) };
  };
  const skip = new Set(['HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
  const walk = (el, key) => {
    if (skip.has(el.tagName)) return;
    const lab = label(el);
    record(key, lab, getComputedStyle(el));
    const tag = el.tagName;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue('content');
      if (content && content !== 'none' && content !== 'normal') record(key + pseudo, lab + pseudo, ps);
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') record(key + '::placeholder', lab + '::placeholder', getComputedStyle(el, '::placeholder'));
    if (tag === 'DIALOG') record(key + '::backdrop', lab + '::backdrop', getComputedStyle(el, '::backdrop'));
    let n = 0;
    for (const child of el.children) walk(child, key + '>' + child.tagName.toLowerCase() + ':' + n++);
  };
  walk(document.documentElement, 'html');
  const names = new Set();
  const scan = (rules) => {
    for (const rule of rules) {
      if (rule.style) for (let i = 0; i < rule.style.length; i++) if (rule.style[i].startsWith('--')) names.add(rule.style[i]);
      if (rule.cssRules) scan(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try { scan(sheet.cssRules); } catch (e) {}
  }
  const tokens = {};
  const rootStyle = getComputedStyle(document.documentElement);
  const bodyStyle = getComputedStyle(document.body);
  for (const n of [...names].sort()) {
    tokens[':root ' + n] = rootStyle.getPropertyValue(n).trim();
    tokens['body ' + n] = bodyStyle.getPropertyValue(n).trim();
  }
  if (detail) out['tokens'] = { label: 'custom-properties', props: tokens };
  else out['tokens'] = { label: 'custom-properties', hash: hash(sign(tokens)) };
  return out;
};

const diffProps = (a, b) => {
  const rows = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignoreProps.has(k)) continue;
    if (a[k] !== b[k]) rows.push([k, a[k] === undefined ? '(absent)' : a[k], b[k] === undefined ? '(absent)' : b[k]]);
  }
  return rows;
};

const compareJob = async (pageA, pageB, job, agg) => {
  const [ha, hb] = await Promise.all([pageA.evaluate(collect, {}), pageB.evaluate(collect, {})]);
  const keys = new Set([...Object.keys(ha), ...Object.keys(hb)]);
  const differs = () => [...keys].filter((k) => ha[k] && hb[k] && ha[k].hash !== hb[k].hash);
  let differing = differs();
  const fingerprint = () => differing.map((k) => ha[k].hash + hb[k].hash).join('|');
  let last = fingerprint();
  let steady = 0;
  for (let round = 0; differing.length && round < 12 && steady < 2; round++) {
    await pageA.waitForTimeout(300);
    const [ra, rb] = await Promise.all([pageA.evaluate(collect, { wanted: differing }), pageB.evaluate(collect, { wanted: differing })]);
    Object.assign(ha, ra);
    Object.assign(hb, rb);
    differing = differs();
    const now = fingerprint();
    steady = now === last ? steady + 1 : 0;
    last = now;
  }
  for (const k of keys) {
    if (!ha[k]) agg.structure.push({ job: job.name, key: k, side: 'only-after', label: hb[k].label });
    else if (!hb[k]) agg.structure.push({ job: job.name, key: k, side: 'only-before', label: ha[k].label });
  }
  agg.elements += keys.size;
  if (!differing.length) return;
  const [da, db] = await Promise.all([pageA.evaluate(collect, { wanted: differing, detail: true }), pageB.evaluate(collect, { wanted: differing, detail: true })]);
  for (const k of differing) {
    if (!da[k] || !db[k]) continue;
    for (const [prop, before, after] of diffProps(da[k].props, db[k].props)) {
      const id = `${da[k].label}\u0000${prop}\u0000${before}\u0000${after}`;
      let row = agg.rows.get(id);
      if (!row) agg.rows.set(id, (row = { label: da[k].label, prop, before, after, elements: 0, jobs: new Set() }));
      row.elements++;
      row.jobs.add(job.name);
    }
  }
};

const runLane = async (browser, baseA, baseB, jobs, agg) => {
  const settings = { pin: true, seed: 20260101, lowend: false, settleMs, errors: agg.errors, pointer: false };
  for (const job of jobs) {
    const a = await newGroupPage(browser, job, baseA, settings);
    const b = await newGroupPage(browser, job, baseB, settings);
    try {
      await Promise.all([reach(a.page, job, baseA, settings), reach(b.page, job, baseB, settings)]);
      await compareJob(a.page, b.page, job, agg);
      agg.jobs++;
    } catch (e) {
      agg.errors.push(`${job.name}: ${String(e.message).split('\n')[0]}`);
    }
    await a.ctx.close();
    await b.ctx.close();
  }
};

const main = async () => {
  const jobs = buildJobs(matrix, only);
  const lanes = Array.from({ length: workers }, (_, i) => jobs.filter((_, j) => j % workers === i));
  const serverA = await startServer(path.resolve(dirA));
  const serverB = await startServer(path.resolve(dirB));
  const browser = await launchBrowser({ args: chromeArgs('') });
  const agg = { jobs: 0, elements: 0, rows: new Map(), structure: [], errors: [] };
  await Promise.all(lanes.map((lane) => runLane(browser, serverA.base, serverB.base, lane, agg)));
  await browser.close();
  await serverA.close();
  await serverB.close();
  const rows = [...agg.rows.values()].map((r) => ({ ...r, jobs: r.jobs.size, sampleJobs: [...r.jobs].slice(0, 4) })).sort((x, y) => y.elements - x.elements);
  const summary = {
    before: path.relative(process.cwd(), path.resolve(dirA)),
    after: path.relative(process.cwd(), path.resolve(dirB)),
    matrix,
    jobs: agg.jobs,
    planned: jobs.length,
    elementsCompared: agg.elements,
    differingDeclarations: rows.length,
    differingElementProperties: rows.reduce((s, r) => s + r.elements, 0),
    structuralDifferences: agg.structure.length,
    errors: agg.errors
  };
  if (jsonOut) await fs.writeFile(jsonOut, JSON.stringify({ summary, rows, structure: agg.structure.slice(0, 500) }, null, 1) + '\n');
  console.log(JSON.stringify(summary));
  for (const r of rows.slice(0, top)) console.log(`${r.elements}x in ${r.jobs} jobs (${r.sampleJobs[0]})  ${r.label}  ${r.prop}: ${r.before.slice(0, 90)} -> ${r.after.slice(0, 90)}`);
  for (const s of agg.structure.slice(0, 10)) console.log(`structure ${s.side} ${s.job} ${s.key} ${s.label}`);
  if (rows.length || agg.structure.length || agg.errors.length || agg.jobs !== jobs.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

import { launchBrowser } from '../perf/browser.mjs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../perf/server.mjs';
import { buildJobs, chromeArgs, newGroupPage, reach } from './matrix.mjs';
import { applyWorld, buildWorlds, prepareWorld, readCssTexts, revertWorld, unionWorlds } from './style-worlds.mjs';

const argv = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] !== undefined && !argv[i + 1].startsWith('--') ? argv[i + 1] : fallback;
};
const [dirA, dirB] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
if (!dirA || !dirB) {
  console.error('usage: style-diff.mjs <dist-before> <dist-after> [--matrix full|grid|surfaces|quick|cascade] [--only a,b] [--workers n] [--worlds all|motion,contrast,transparency,forced,scrolling,lowend,corners,states] [--state-motion no-preference|reduce|both] [--picks 1|2] [--noise-tol n] [--ignore-prop p1,p2] [--json file] [--top n]');
  process.exit(2);
}

const MEDIA_WORLDS = {
  motion: { motion: 'no-preference' },
  contrast: { contrast: 'more' },
  transparency: { transparency: 'reduce' },
  forced: { forced: 'active' }
};
const WORLD_NAMES = [...Object.keys(MEDIA_WORLDS), 'scrolling', 'lowend', 'corners', 'states'];

const matrix = opt('--matrix', 'quick');
const only = opt('--only', '').split(',').map((s) => s.trim()).filter(Boolean);
const workers = Math.max(1, Number(opt('--workers', Math.max(2, os.cpus().length * 2))));
const settleMs = Number(opt('--settle', 400));
const ignoreProps = new Set(opt('--ignore-prop', '').split(',').map((s) => s.trim()).filter(Boolean));
const top = Number(opt('--top', 40));
const jsonOut = opt('--json', '');
const worldOpt = opt('--worlds', 'none');
const enabled = new Set(worldOpt === 'all' ? WORLD_NAMES : worldOpt.split(',').map((s) => s.trim()).filter((s) => WORLD_NAMES.includes(s)));
const stateMotion = opt('--state-motion', 'no-preference');
const picks = Number(opt('--picks', 2));
const noiseTol = Number(opt('--noise-tol', 0.002));
const NOISE_PROPS = new Set(['--hov', 'opacity', 'transform', 'translate', 'scale', 'rotate']);
const NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/gi;

const collect = ({ wanted, detail, subject }) => {
  for (const a of document.getAnimations()) {
    try { a.finish(); } catch (e) {}
  }
  const animated = new WeakMap();
  for (const a of document.getAnimations()) {
    if (a.playState !== 'running' || !a.effect || !a.effect.target) continue;
    const props = new Set();
    for (const kf of a.effect.getKeyframes()) {
      for (const k of Object.keys(kf)) {
        if (k === 'offset' || k === 'computedOffset' || k === 'easing' || k === 'composite') continue;
        props.add(k === 'cssFloat' ? 'float' : k.startsWith('--') ? k : k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()));
      }
    }
    const byPseudo = animated.get(a.effect.target) || {};
    const key = a.effect.pseudoElement || '';
    byPseudo[key] = new Set([...(byPseudo[key] || []), ...props]);
    animated.set(a.effect.target, byPseudo);
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
  const snapshot = (cs, el, pseudo) => {
    const skip = animated.has(el) ? animated.get(el)[pseudo || ''] : null;
    const props = {};
    for (let i = 0; i < cs.length; i++) {
      if (skip && skip.has(cs[i])) continue;
      props[cs[i]] = cs.getPropertyValue(cs[i]).split(origin).join('<origin>');
    }
    return props;
  };
  const sign = (props) => Object.keys(props).sort().map((k) => k + ':' + props[k]).join(';');
  const record = (key, lab, cs, el, pseudo) => {
    if (want && !want.has(key)) return;
    const props = snapshot(cs, el, pseudo);
    out[key] = detail ? { label: lab, props } : { label: lab, hash: hash(sign(props)) };
  };
  const skipTags = new Set(['HEAD', 'SCRIPT', 'STYLE', 'LINK', 'META', 'TITLE', 'NOSCRIPT', 'TEMPLATE']);
  const walk = (el, key) => {
    if (skipTags.has(el.tagName)) return;
    const lab = label(el);
    record(key, lab, getComputedStyle(el), el, '');
    const tag = el.tagName;
    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      const content = ps.getPropertyValue('content');
      if (content && content !== 'none' && content !== 'normal') record(key + pseudo, lab + pseudo, ps, el, pseudo);
    }
    if (tag === 'INPUT' || tag === 'TEXTAREA') record(key + '::placeholder', lab + '::placeholder', getComputedStyle(el, '::placeholder'), el, '::placeholder');
    if (tag === 'DIALOG') record(key + '::backdrop', lab + '::backdrop', getComputedStyle(el, '::backdrop'), el, '::backdrop');
    let n = 0;
    for (const child of el.children) walk(child, key + '>' + child.tagName.toLowerCase() + ':' + n++);
  };
  walk(subject ? window.__lxSubject : document.documentElement, subject ? 'S' : 'html');
  if (subject) return out;
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

const closeNumbers = (x, y) => {
  if (x === undefined || y === undefined) return false;
  if (x.replace(NUMBER, '#') !== y.replace(NUMBER, '#')) return false;
  const nx = x.match(NUMBER);
  const ny = y.match(NUMBER);
  if (!nx || nx.length !== ny.length) return false;
  return nx.every((v, i) => Math.abs(Number(v) - Number(ny[i])) <= noiseTol * Math.max(1, Math.abs(Number(v))));
};

const diffProps = (a, b, tolerant, agg) => {
  const rows = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (ignoreProps.has(k)) continue;
    if (a[k] === b[k]) continue;
    if (tolerant && NOISE_PROPS.has(k) && closeNumbers(a[k], b[k])) { agg.tolerated++; continue; }
    rows.push([k, a[k] === undefined ? '(absent)' : a[k], b[k] === undefined ? '(absent)' : b[k]]);
  }
  return rows;
};

const compareTree = async (pageA, pageB, job, world, agg, subject, maxRounds = 12) => {
  const [ha, hb] = await Promise.all([pageA.evaluate(collect, { subject }), pageB.evaluate(collect, { subject })]);
  const keys = new Set([...Object.keys(ha), ...Object.keys(hb)]);
  const differs = () => [...keys].filter((k) => ha[k] && hb[k] && ha[k].hash !== hb[k].hash);
  let differing = differs();
  const fingerprint = () => differing.map((k) => ha[k].hash + hb[k].hash).join('|');
  let last = fingerprint();
  let steady = 0;
  for (let round = 0; differing.length && round < maxRounds && steady < 2; round++) {
    await pageA.waitForTimeout(subject ? 120 : 300);
    const [ra, rb] = await Promise.all([pageA.evaluate(collect, { wanted: differing, subject }), pageB.evaluate(collect, { wanted: differing, subject })]);
    Object.assign(ha, ra);
    Object.assign(hb, rb);
    differing = differs();
    const now = fingerprint();
    steady = now === last ? steady + 1 : 0;
    last = now;
  }
  for (const k of keys) {
    if (!ha[k]) agg.structure.push({ job: job.name, world, key: k, side: 'only-after', label: hb[k].label });
    else if (!hb[k]) agg.structure.push({ job: job.name, world, key: k, side: 'only-before', label: ha[k].label });
  }
  agg.elements += keys.size;
  if (!differing.length) return;
  const [da, db] = await Promise.all([pageA.evaluate(collect, { wanted: differing, detail: true, subject }), pageB.evaluate(collect, { wanted: differing, detail: true, subject })]);
  for (const k of differing) {
    if (!da[k] || !db[k]) continue;
    for (const [prop, before, after] of diffProps(da[k].props, db[k].props, subject, agg)) {
      const id = `${world}\u0000${da[k].label}\u0000${prop}\u0000${before}\u0000${after}`;
      let row = agg.rows.get(id);
      if (!row) agg.rows.set(id, (row = { world, label: da[k].label, prop, before, after, elements: 0, jobs: new Set() }));
      row.elements++;
      row.jobs.add(job.name);
    }
  }
};

const openCdp = async (page) => {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  await cdp.send('DOM.getDocument', { depth: 0 });
  return cdp;
};

const setMedia = (cdp, m = {}) => cdp.send('Emulation.setEmulatedMedia', {
  features: [
    { name: 'prefers-reduced-motion', value: m.motion || 'reduce' },
    { name: 'prefers-contrast', value: m.contrast || 'no-preference' },
    { name: 'prefers-reduced-transparency', value: m.transparency || 'no-preference' },
    { name: 'forced-colors', value: m.forced || 'none' }
  ]
});

const nodeIdOf = async (cdp, expression) => {
  const { result } = await cdp.send('Runtime.evaluate', { expression });
  const { nodeId } = await cdp.send('DOM.requestNode', { objectId: result.objectId });
  return nodeId;
};

const runStateWorld = async (a, b, job, agg, world) => {
  const arg = { query: world.query, compounds: world.compounds, picks };
  const [na, nb] = await Promise.all([a.page.evaluate(prepareWorld, arg), b.page.evaluate(prepareWorld, arg)]);
  if (na !== nb) agg.structure.push({ job: job.name, world: 'states', key: world.id, side: na > nb ? 'only-before' : 'only-after', label: `world ${world.id}` });
  const forced = [];
  world.compounds.forEach((c, j) => { if (c.pseudos.length) forced.push([j, c.pseudos]); });
  for (let i = 0; i < Math.min(na, nb); i++) {
    agg.exercised.add(world.id);
    await Promise.all([a.page.evaluate(applyWorld, { index: i, compounds: world.compounds }), b.page.evaluate(applyWorld, { index: i, compounds: world.compounds })]);
    const ids = await Promise.all([a, b].map(async (side) => {
      const out = [];
      for (const [j, pseudos] of forced) {
        const nodeId = await nodeIdOf(side.cdp, `window.__lxChain[${j}]`);
        await side.cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: pseudos });
        out.push(nodeId);
      }
      return out;
    }));
    await compareTree(a.page, b.page, job, `states ${world.id}`, agg, true, 8);
    await Promise.all([a, b].map(async (side, s) => {
      for (const nodeId of ids[s]) await side.cdp.send('CSS.forcePseudoState', { nodeId, forcedPseudoClasses: [] });
    }));
    await Promise.all([a.page.evaluate(revertWorld), b.page.evaluate(revertWorld)]);
  }
};

const runWorlds = async (a, b, job, agg, stateWorlds) => {
  for (const name of Object.keys(MEDIA_WORLDS)) {
    if (!enabled.has(name)) continue;
    try {
      await Promise.all([setMedia(a.cdp, MEDIA_WORLDS[name]), setMedia(b.cdp, MEDIA_WORLDS[name])]);
      await a.page.waitForTimeout(200);
      await compareTree(a.page, b.page, job, `media ${name}`, agg, false);
    } catch (e) {
      agg.errors.push(`${job.name}: media ${name}: ${String(e.message).split('\n')[0]}`);
    }
    await Promise.all([setMedia(a.cdp), setMedia(b.cdp)]);
  }
  const both = (fn, arg) => Promise.all([a.page.evaluate(fn, arg), b.page.evaluate(fn, arg)]);
  if (enabled.has('scrolling')) {
    await both(() => document.documentElement.classList.add('lx-scrolling'));
    await compareTree(a.page, b.page, job, 'class lx-scrolling', agg, false);
    await both(() => document.documentElement.classList.remove('lx-scrolling'));
  }
  if (enabled.has('lowend')) {
    await both(() => document.documentElement.setAttribute('data-lowend', ''));
    await compareTree(a.page, b.page, job, 'attr data-lowend', agg, false);
    await both(() => document.documentElement.removeAttribute('data-lowend'));
  }
  if (enabled.has('corners')) {
    for (const corner of ['soft', 'crisp']) {
      if (corner === job.corner) continue;
      await both((c) => { document.documentElement.dataset.corners = c; }, corner);
      await compareTree(a.page, b.page, job, `corners ${corner}`, agg, false);
    }
    await both((c) => { document.documentElement.dataset.corners = c; }, job.corner);
  }
  if (enabled.has('states') && stateWorlds.length) {
    const modes = stateMotion === 'both' ? ['no-preference', 'reduce'] : [stateMotion];
    for (const mode of modes) {
      await Promise.all([setMedia(a.cdp, { motion: mode }), setMedia(b.cdp, { motion: mode })]);
      await a.page.waitForTimeout(150);
      for (const world of stateWorlds) {
        try { await runStateWorld(a, b, job, agg, world); } catch (e) { agg.errors.push(`${job.name}: ${world.id}: ${String(e.message).split('\n')[0]}`); }
      }
    }
    await Promise.all([setMedia(a.cdp), setMedia(b.cdp)]);
  }
};

const runLane = async (browser, baseA, baseB, jobs, agg, stateWorlds) => {
  const settings = { pin: true, seed: 20260101, lowend: false, settleMs, errors: agg.errors, pointer: false };
  for (const job of jobs) {
    const a = await newGroupPage(browser, job, baseA, settings);
    const b = await newGroupPage(browser, job, baseB, settings);
    try {
      await Promise.all([reach(a.page, job, baseA, settings), reach(b.page, job, baseB, settings)]);
      await compareTree(a.page, b.page, job, 'default', agg, false);
      if (enabled.size) {
        a.cdp = await openCdp(a.page);
        b.cdp = await openCdp(b.page);
        const hover = await a.page.evaluate(() => matchMedia('(hover: none)').matches);
        agg.hoverNone[hover ? 'yes' : 'no']++;
        await runWorlds(a, b, job, agg, stateWorlds);
      }
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
  let stateWorlds = [];
  let worldStats = null;
  if (enabled.has('states')) {
    const built = unionWorlds(buildWorlds(await readCssTexts(path.resolve(dirA))), buildWorlds(await readCssTexts(path.resolve(dirB))));
    stateWorlds = built.worlds;
    worldStats = built.stats;
  }
  const serverA = await startServer(path.resolve(dirA));
  const serverB = await startServer(path.resolve(dirB));
  const browser = await launchBrowser({ args: chromeArgs('') });
  const agg = { jobs: 0, elements: 0, tolerated: 0, rows: new Map(), structure: [], errors: [], exercised: new Set(), hoverNone: { yes: 0, no: 0 } };
  await Promise.all(lanes.map((lane) => runLane(browser, serverA.base, serverB.base, lane, agg, stateWorlds)));
  await browser.close();
  await serverA.close();
  await serverB.close();
  const rows = [...agg.rows.values()].map((r) => ({ ...r, jobs: r.jobs.size, sampleJobs: [...r.jobs].slice(0, 4) })).sort((x, y) => y.elements - x.elements);
  const summary = {
    before: path.relative(process.cwd(), path.resolve(dirA)),
    after: path.relative(process.cwd(), path.resolve(dirB)),
    matrix,
    worlds: [...enabled],
    jobs: agg.jobs,
    planned: jobs.length,
    elementsCompared: agg.elements,
    differingDeclarations: rows.length,
    differingElementProperties: rows.reduce((s, r) => s + r.elements, 0),
    structuralDifferences: agg.structure.length,
    errors: agg.errors,
    ...(enabled.has('states') ? { toleratedTweenNoise: agg.tolerated, noiseTolerance: noiseTol } : {}),
    ...(worldStats ? { stateWorldsDerived: stateWorlds.length, stateWorldsExercised: agg.exercised.size, stateSelectors: worldStats } : {}),
    ...(enabled.size ? { jobsWithHoverNone: agg.hoverNone.yes, jobsWithHover: agg.hoverNone.no } : {})
  };
  if (jsonOut) await fs.writeFile(jsonOut, JSON.stringify({ summary, rows, structure: agg.structure.slice(0, 500) }, null, 1) + '\n');
  console.log(JSON.stringify(summary));
  for (const r of rows.slice(0, top)) console.log(`${r.elements}x in ${r.jobs} jobs (${r.sampleJobs[0]})  [${r.world}] ${r.label}  ${r.prop}: ${r.before.slice(0, 90)} -> ${r.after.slice(0, 90)}`);
  for (const s of agg.structure.slice(0, 10)) console.log(`structure ${s.side} ${s.job} [${s.world}] ${s.key} ${s.label}`);
  if (rows.length || agg.structure.length || agg.errors.length || agg.jobs !== jobs.length) process.exit(1);
};

main().catch((e) => { console.error(e); process.exit(1); });

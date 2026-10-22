import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SWITCHES = Number(process.argv[2] || 6);
const kind = process.argv[3] || 'tab';

const main = async () => {
  const server = await startServer(root);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' });
  await ctx.addInitScript(() => {
    Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
    Object.defineProperty(Navigator.prototype, 'deviceMemory', { get: () => 8 });
  });
  const page = await ctx.newPage();
  await page.goto(server.base + '/');
  await page.waitForSelector('#appGrid .app-card');
  await page.waitForTimeout(3500);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  for (let i = 0; i < SWITCHES; i++) {
    if (kind === 'view') await page.keyboard.press('Alt+KeyV');
    else await page.evaluate(() => { const t = [...document.querySelectorAll('.tab-btn')]; const i = t.findIndex((x) => x.getAttribute('aria-selected') === 'true'); t[(i + 1) % t.length].click(); });
    await page.waitForTimeout(1500);
  }
  const { profile } = await cdp.send('Profiler.stop');
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  let layout = 0;
  let program = 0;
  let idle = 0;
  let script = 0;
  profile.samples.forEach((id, i) => {
    const n = byId.get(id);
    const dt = profile.timeDeltas[i];
    const f = n.callFrame.functionName;
    if (f === '(idle)') idle += dt;
    else if (f === '(program)') program += dt;
    else if (f === 'getBoundingClientRect') layout += dt;
    else script += dt;
  });
  const per = (v) => Math.round(v / 1000 / SWITCHES);
  console.log(JSON.stringify({ kind, switches: SWITCHES, perSwitchMs: { forcedLayoutReads: per(layout), otherScript: per(script), nativeProgram: per(program) } }));
  await browser.close();
  await server.close();
};

main().catch((e) => { console.error(e); process.exit(1); });

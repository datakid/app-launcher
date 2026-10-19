import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = 0;
for (const file of ['launcher.mjs', 'parity.mjs']) {
  console.log('== ' + file);
  const r = spawnSync(process.execPath, [path.join(here, file)], { stdio: 'inherit' });
  if (r.status !== 0) failed++;
}
process.exit(failed ? 1 : 0);

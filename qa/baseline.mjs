import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const argv = process.argv.slice(2);
const ref = argv.find((a) => !a.startsWith('--')) || 'origin/main';
const rest = argv.filter((a) => a !== ref);
const outAt = rest.indexOf('--out');
const out = path.resolve(outAt >= 0 ? rest[outAt + 1] : path.join(here, 'out', `baseline-${ref.replace(/[^\w.-]+/g, '-')}`));
const passthrough = rest.filter((a, i) => outAt < 0 || (i !== outAt && i !== outAt + 1));

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

const tree = fs.mkdtempSync(path.join(os.tmpdir(), 'lx-baseline-'));
try {
  run('git', ['worktree', 'add', '--detach', tree, ref], root);
  fs.symlinkSync(path.join(root, 'node_modules'), path.join(tree, 'node_modules'), 'dir');
  run('npm', ['run', 'build'], tree);
  run('node', [path.join(here, 'visual-marks.mjs'), '--site', path.join(tree, 'dist'), '--out', out, ...passthrough], root);
  console.log(JSON.stringify({ ref, commit: execFileSync('git', ['rev-parse', ref], { cwd: root }).toString().trim(), out: path.relative(root, out) }));
} finally {
  try { run('git', ['worktree', 'remove', '--force', tree], root); } catch (e) {}
}

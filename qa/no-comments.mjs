import { execFileSync } from 'node:child_process';

const base = process.argv[2] || 'origin/main';
const git = (args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
try {
  git(['rev-parse', '--verify', '--quiet', base + '^{commit}']);
} catch (e) {
  const remote = /^([^/]+)\/(.+)$/.exec(base);
  const fix = remote ? `Run: git fetch ${remote[1]} ${remote[2]}` : 'Pass a ref that exists as the first argument.';
  console.error(`no-comments: cannot resolve "${base}". ${fix}`);
  process.exit(1);
}
const diff = git(['diff', base, '-U0', '--', 'src', 'build', 'qa', 'tools', 'perf', 'harvest', 'compare.html', 'vercel.json']);
const bad = [];
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const code = line.slice(1);
  const stripped = code.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/https?:\/\/\S+/g, '');
  const html = new RegExp('<!' + '--(?!LX:)').test(code);
  const block = /\/\*/.test(stripped) || /^\s*\*(\s|\/|$)/.test(code);
  const lineC = /(^|[\s;{}(),])\/\/(?!\/)/.test(stripped) && !/\/[^/\n]+\/[gimsuy]*/.test(stripped.replace(/\/\/.*$/, ''));
  const hash = /\.(sh|ya?ml|toml)$/.test(file) && /^\s*#/.test(code);
  if (html || block || lineC || hash) bad.push(`${file}: ${code.trim().slice(0, 120)}`);
}
if (bad.length) {
  console.error(`no-comments: ${bad.length} added comment line(s). Remove them:`);
  for (const b of bad) console.error('  ' + b);
  process.exit(1);
}
console.log('no-comments: ok');

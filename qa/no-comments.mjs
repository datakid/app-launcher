import { execSync } from 'node:child_process';

const base = process.argv[2] || 'origin/ship/qr-views-polish';
const diff = execSync(`git diff ${base} -U0 -- src build qa tools perf harvest compare.html vercel.json`, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const bad = [];
let file = '';
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line.slice(6); continue; }
  if (!line.startsWith('+') || line.startsWith('+++')) continue;
  const code = line.slice(1);
  const stripped = code.replace(/(['"`])(?:\\.|(?!\1).)*\1/g, '""').replace(/https?:\/\/\S+/g, '');
  const html = new RegExp('<' + '!--(?!LX:)').test(code);
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

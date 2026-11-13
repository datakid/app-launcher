import fs from 'node:fs';
import path from 'node:path';

export const siteRoot = (repoRoot) => {
  if (process.env.LX_SITE) return path.resolve(process.env.LX_SITE);
  const dist = path.join(repoRoot, 'dist');
  return fs.existsSync(path.join(dist, 'index.html')) ? dist : repoRoot;
};

import fs from 'node:fs';
import path from 'node:path';

export const siteRoot = (repoRoot) => {
  const dist = path.join(repoRoot, 'dist');
  return fs.existsSync(path.join(dist, 'index.html')) ? dist : repoRoot;
};

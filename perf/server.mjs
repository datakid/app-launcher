import { createServer } from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.html': 'text/html',
  '.json': 'application/json',
  '.png': 'image/png',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jxl': 'image/jxl',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json'
};

export const startServer = async (rootDir) => {
  const root = path.resolve(rootDir);
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(root, p);
      if (!file.startsWith(root)) throw new Error('outside');
      const buf = await fs.readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    } catch (e) {
      res.writeHead(404);
      res.end('not found');
    }
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
};

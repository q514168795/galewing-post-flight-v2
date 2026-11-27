// SPDX-License-Identifier: MIT
// Local static development server for Galewing Post (Node 22 stdlib only).
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const gameRoot = resolve(fileURLToPath(new URL('./game', import.meta.url)));
const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const parsedPort = portIdx === -1 ? 8080 : Number(args[portIdx + 1]);
const port = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : 8080;

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad Request');
    return;
  }
  if (pathname.endsWith('/')) pathname += 'index.html';
  const target = resolve(join(gameRoot, normalize(pathname)));
  if (target !== gameRoot && !target.startsWith(gameRoot + sep)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  let size: number;
  try {
    const info = statSync(target);
    if (!info.isFile()) throw new Error('Not a regular file');
    size = info.size;
  } catch {
    res.writeHead(404).end('Not Found');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
    'content-length': size,
    'cache-control': 'no-store',
  });
  createReadStream(target).pipe(res);
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Galewing Post running at http://127.0.0.1:${port}`);
});

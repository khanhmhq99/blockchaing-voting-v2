// Loopback-only static export smoke server with Next.js clean-route rewrites.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('apps/voter-web/out');
const mime = { '.html': 'text/html; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.zkey': 'application/octet-stream',
  '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.png': 'image/png', '.svg': 'image/svg+xml' };
http.createServer((request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const clean = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const candidate = path.resolve(root, clean);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  const html = path.resolve(root, clean.replace(/\/$/, '') + '.html');
  const file = fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate :
    fs.existsSync(html) && fs.statSync(html).isFile() ? html : null;
  if (!file) { response.writeHead(404).end(); return; }
  response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
  fs.createReadStream(file).pipe(response);
}).listen(3000, '127.0.0.1', () => process.stdout.write('BSC static web smoke server on loopback port 3000.\n'));

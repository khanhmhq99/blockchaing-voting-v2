import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../apps/voter-web/out/', import.meta.url));
const origins = new Set(["'self'"]);
for (const value of [process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001', process.env.NEXT_PUBLIC_MACI_RPC_URL]) {
  if (!value) continue;
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Invalid public CSP connection origin');
  origins.add(url.origin);
}

async function htmlFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await htmlFiles(path));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(path);
  }
  return files;
}

const common = `default-src 'self'; connect-src ${[...origins].join(' ')}; img-src 'self' data:; font-src 'self'; style-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; script-src-attr 'none'`;
const allHashes = new Set();
const files = await htmlFiles(output);
if (!files.length) throw new Error('No exported HTML for CSP');
for (const path of files) {
  const html = await readFile(path, 'utf8');
  if (!html.includes('<head>') || html.includes('http-equiv="Content-Security-Policy"')) throw new Error(`Cannot apply CSP to ${path}`);
  const hashes = new Set();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    if (/\bsrc\s*=/.test(match[1]) || !match[2]) continue;
    const hash = `'sha256-${createHash('sha256').update(match[2]).digest('base64')}'`;
    hashes.add(hash);
    allHashes.add(hash);
  }
  const policy = `${common}; script-src 'self' ${[...hashes].join(' ')}`;
  const encoded = policy.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
  await writeFile(path, html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${encoded}"/>`));
}

// Netlify and Cloudflare Pages consume _headers. Other static hosts must apply
// the same policy as an HTTP response header for frame-ancestors enforcement.
const header = `${common}; script-src 'self' ${[...allHashes].join(' ')}; frame-ancestors 'none'`;
await writeFile(join(output, '_headers'), `/*\n  Content-Security-Policy: ${header}\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n`);

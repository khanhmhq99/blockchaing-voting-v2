import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { resolve, relative } from 'node:path';

const root = resolve(process.argv[2] ?? 'research/mvp3/maci/artifacts');
const allowed = new Set(['.r1cs', '.wasm', '.zkey', '.json', '.sol']);

async function visit(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      await visit(path);
      continue;
    }
    if (!entry.isFile() || ![...allowed].some((extension) => entry.name.endsWith(extension))) continue;
    const size = (await stat(path)).size;
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(path)) hash.update(chunk);
    process.stdout.write(`${JSON.stringify({ path: relative(root, path).replaceAll('\\', '/'), size, sha256: hash.digest('hex'), trust: 'UNVERIFIED' })}\n`);
  }
}

try {
  await visit(root);
} catch (error) {
  if (error.code === 'ENOENT') {
    process.stderr.write(`Artifact directory does not exist: ${root}\n`);
    process.exitCode = 2;
  } else {
    throw error;
  }
}

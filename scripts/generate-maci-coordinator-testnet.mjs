// Generate a fresh MACI coordinator keypair directly into ignored testnet env files.
// Never print either key. Run once per synthetic poll before deployment.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { Keypair, PrivateKey } = require(path.join(root, 'research/mvp3/maci/runtime-env/node_modules/@maci-protocol/domainobjs'));
const publicFile = path.join(root, '.env.bsc-testnet');
const privateFile = path.join(root, '.env.bsc-worker');

function readPlaceholder(file, name, pattern) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile()) throw new Error(`${path.basename(file)} must be a regular file`);
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  const matches = lines.filter(line => line.startsWith(`${name}=`));
  if (matches.length !== 1 || !pattern.test(matches[0].slice(name.length + 1))) {
    throw new Error(`${name} must have exactly one placeholder; refusing to overwrite a configured key`);
  }
  return content;
}

function replaceValue(content, name, value) {
  return content.replace(new RegExp(`^${name}=.*$`, 'm'), `${name}=${value}`);
}

if (process.argv[2] === '--verify') {
  function configuredValue(file, name) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => line.startsWith(`${name}=`));
    if (lines.length !== 1) throw new Error(`${name} must occur exactly once`);
    return lines[0].slice(name.length + 1);
  }
  const publicKey = configuredValue(publicFile, 'MACI_COORDINATOR_PUBLIC_KEY');
  const privateKey = configuredValue(privateFile, 'MACI_COORDINATOR_PRIVATE_KEY');
  if (!/^macisk\.[0-9a-fA-F]{64}$/.test(privateKey) ||
      new Keypair(PrivateKey.deserialize(privateKey)).publicKey.serialize() !== publicKey) {
    throw new Error('MACI coordinator keys do not match');
  }
  process.stdout.write('MACI coordinator keypair matches across ignored env files.\n');
  process.exit(0);
}
if (process.argv.length !== 2) throw new Error('Usage: node scripts/generate-maci-coordinator-testnet.mjs [--verify]');

const publicContent = readPlaceholder(publicFile, 'MACI_COORDINATOR_PUBLIC_KEY', /^macipk\.<[^>\r\n]+>$/);
const privateContent = readPlaceholder(privateFile, 'MACI_COORDINATOR_PRIVATE_KEY', /^macisk\.<[^>\r\n]+>$/);
const pair = new Keypair();
const publicKey = pair.publicKey.serialize();
const privateKey = pair.privateKey.serialize();
if (!publicKey.startsWith('macipk.') || !/^macisk\.[0-9a-fA-F]{64}$/.test(privateKey) ||
    new Keypair(PrivateKey.deserialize(privateKey)).publicKey.serialize() !== publicKey) {
  throw new Error('Generated MACI coordinator keypair failed validation');
}

const publicTemp = `${publicFile}.tmp-${process.pid}`;
const privateTemp = `${privateFile}.tmp-${process.pid}`;
try {
  fs.writeFileSync(publicTemp, replaceValue(publicContent, 'MACI_COORDINATOR_PUBLIC_KEY', publicKey), { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(privateTemp, replaceValue(privateContent, 'MACI_COORDINATOR_PRIVATE_KEY', privateKey), { flag: 'wx', mode: 0o600 });
  fs.renameSync(privateTemp, privateFile);
  fs.renameSync(publicTemp, publicFile);
} finally {
  for (const file of [publicTemp, privateTemp]) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
}
process.stdout.write('MACI coordinator keypair saved to ignored testnet and worker env files.\n');

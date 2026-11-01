// Run an explicit local MACI command with isolated, synthetic Hardhat identities.
// The coordinator secret stays in ignored research storage and is never printed.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { HDNodeWallet } from 'ethers';
import domainobjs from '@maci-protocol/domainobjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args[0] !== '--' || args.length < 2) throw new Error('Usage: node scripts/maci-local-env.mjs -- <command> [args]');
const rpc = process.env.MACI_LOCAL_RPC_URL ?? 'http://127.0.0.1:8545';
const parsedRpc = new URL(rpc);
if (parsedRpc.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(parsedRpc.hostname) || parsedRpc.username || parsedRpc.password || parsedRpc.pathname !== '/' || parsedRpc.search || parsedRpc.hash) throw new Error('Local MACI command requires a loopback RPC URL');
const response = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
const chain = await response.json();
if (chain.result !== '0x7a69') throw new Error('Local MACI command requires a running chain 31337 at the configured loopback RPC');
const mnemonic = 'test test test test test test test test test test test junk';
const keys = Array.from({ length: 6 }, (_, index) => HDNodeWallet.fromPhrase(mnemonic, undefined, `m/44'/60'/0'/0/${index}`).privateKey);
const storage = path.join(root, 'research/mvp3/maci/probe-output/local-integration');
fs.mkdirSync(storage, { recursive: true });
const secretFile = path.join(storage, 'coordinator-secret.json');
if (!fs.existsSync(secretFile)) throw new Error('Existing local coordinator secret is missing; do not regenerate it automatically.');
const coordinatorKey = JSON.parse(fs.readFileSync(secretFile, 'utf8')).privateKey;
if (!/^macisk\.[0-9a-fA-F]{64}$/.test(coordinatorKey)) throw new Error('Invalid local coordinator secret');
const coordinatorPublicKey = new domainobjs.Keypair(domainobjs.PrivateKey.deserialize(coordinatorKey)).publicKey.serialize();
const proofWorker = args.includes('proof:worker');
const manualCoordinator = args.some(value => value.endsWith('maci-coordinator.mjs'));
const env = {
  ...process.env, NODE_ENV: 'development', RPC_URL: rpc, MACI_RPC_URL: rpc, CHAIN_ID: '31337',
  CHAIN_CONFIRMATIONS: '1', NEXT_PUBLIC_MACI_RPC_URL: rpc, NEXT_PUBLIC_API_URL: process.env.MACI_LOCAL_API_URL ?? 'http://localhost:3001',
  APP_ORIGIN: process.env.MACI_LOCAL_APP_ORIGIN ?? 'http://localhost:3000',
  MACI_COORDINATOR_PUBLIC_KEY: coordinatorPublicKey,
  DEPLOYER_PRIVATE_KEY: proofWorker ? undefined : keys[0], MACI_ISSUER_PRIVATE_KEY: proofWorker ? undefined : keys[1],
  MACI_REGISTRATION_RELAYER_PRIVATE_KEY: proofWorker ? undefined : keys[2], MACI_JOIN_RELAYER_PRIVATE_KEY: proofWorker ? undefined : keys[3],
  MACI_RELAYER_PRIVATE_KEY: proofWorker ? undefined : keys[4], MACI_PROVER_PRIVATE_KEY: proofWorker || manualCoordinator ? keys[5] : undefined,
  MACI_COORDINATOR_PRIVATE_KEY: proofWorker || manualCoordinator ? coordinatorKey : undefined,
};
const child = spawn(args[1], args.slice(2), { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' && /\.cmd$/i.test(args[1]) });
child.on('error', error => { process.stderr.write(`Local MACI command failed to start: ${error.message}\n`); process.exitCode = 1; });
child.on('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });

import { localChain } from './chain.js';
import { testApi } from './api.js';
import { payloadHash } from '../../packages/shared-types/src/index.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const chain = await localChain(18548);
const manifest = { title: 'Browser election', description: 'Synthetic browser workflow', candidates: [{ name: 'Candidate A', biography: '' }, { name: 'Candidate B', biography: '' }] };
const start = (await chain.client.getBlock()).timestamp + 3600n;
await chain.write('createElection', [start, start + 86400n, 2, payloadHash(manifest)]);
mkdirSync('.tools', { recursive: true });
writeFileSync('.tools/e2e-context.json', JSON.stringify({ accounts: chain.accounts, address: chain.address, rpc: chain.url }));
const api = await testApi(chain, manifest, 3101);
async function close() { await api.app.close(); chain.stop(); process.exit(0); }
process.on('SIGINT', () => { void close(); });
process.on('SIGTERM', () => { void close(); });
console.log('E2E fixture ready: real local EVM, explicit in-memory database double.');

// Explicit chain-97 entrypoint; the shared deployment implementation performs
// RPC, signer, artifact and receipt checks before recording public evidence.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = process.argv[2];
if (!file || process.env.CHAIN_ID !== '97' || process.env.MACI_BSC_TESTNET_ENABLED !== 'true') throw new Error('BSC Testnet deployment requires CHAIN_ID=97, MACI_BSC_TESTNET_ENABLED=true and a poll configuration file.');
const config = JSON.parse(readFileSync(resolve(file), 'utf8'));
if (config.chainId !== 97) throw new Error('BSC Testnet deployment refuses a non-97 poll configuration.');
await import('./deploy-maci-local.mjs');

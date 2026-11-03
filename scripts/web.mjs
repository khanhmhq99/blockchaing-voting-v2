import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

const loaded = config({ path: process.env.MACI_ENV_FILE ?? '.env', quiet: true, processEnv: {} }).parsed;
const publicOrigin = process.env.NEXT_PUBLIC_API_URL ?? loaded?.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const publicRpc = process.env.NEXT_PUBLIC_MACI_RPC_URL ?? loaded?.NEXT_PUBLIC_MACI_RPC_URL;
const sourceUrl = process.env.NEXT_PUBLIC_SOURCE_URL ?? loaded?.NEXT_PUBLIC_SOURCE_URL;
const chainId = process.env.CHAIN_ID ?? loaded?.CHAIN_ID ?? '31337';
const rpc = publicRpc && new URL(publicRpc);
const local = rpc && rpc.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(rpc.hostname) && rpc.pathname === '/' && !rpc.search;
const testnet = rpc && rpc.protocol === 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(rpc.hostname) && !rpc.search;
if (!rpc || rpc.username || rpc.password || rpc.hash || (chainId === '31337' ? !local : chainId === '97' ? !testnet : true)) {
  throw new Error('NEXT_PUBLIC_MACI_RPC_URL must match CHAIN_ID: loopback HTTP for 31337 or public HTTPS for 97.');
}
let source;
try { if (sourceUrl) source = new URL(sourceUrl); }
catch { throw new Error('NEXT_PUBLIC_SOURCE_URL must be an HTTPS URL to an exact source revision.'); }
if (source && (source.protocol !== 'https:' || source.username || source.password || source.hash || !/\/(tree|commit)\/[0-9a-f]{40}\/?$/i.test(source.pathname))) {
  throw new Error('NEXT_PUBLIC_SOURCE_URL must identify an exact HTTPS Git commit.');
}
if (chainId === '97' && (process.env.MACI_BSC_TESTNET_ENABLED ?? loaded?.MACI_BSC_TESTNET_ENABLED) === 'true' && !source) {
  throw new Error('An enabled BSC web build requires NEXT_PUBLIC_SOURCE_URL.');
}
const webPort = process.env.WEB_PORT ?? loaded?.WEB_PORT ?? '3000';
const environment = { ...process.env, NEXT_PUBLIC_API_URL: publicOrigin, NEXT_PUBLIC_MACI_RPC_URL: publicRpc, NEXT_PUBLIC_CHAIN_ID: chainId, NEXT_PUBLIC_SOURCE_URL: sourceUrl ?? '' };
for (const key of Object.keys(environment)) if (/^(DATABASE_|MIGRATION_DATABASE_|DEPLOYER_|SUPABASE_|RPC_URL$|MACI_)/.test(key)) delete environment[key];
const args = ['node_modules/next/dist/bin/next', process.argv[2], 'apps/voter-web'];
if (process.argv[2] === 'dev') args.push('--port', webPort);
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: environment });
if (result.status !== 0 || process.argv[2] !== 'build') process.exit(result.status ?? 1);
const csp = spawnSync(process.execPath, ['scripts/apply-web-csp.mjs'], { stdio: 'inherit', env: environment });
process.exit(csp.status ?? 1);

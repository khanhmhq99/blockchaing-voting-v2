import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

const loaded = config({ path: '.env', quiet: true, processEnv: {} }).parsed;
const publicOrigin = process.env.NEXT_PUBLIC_API_URL ?? loaded?.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const publicRpc = process.env.NEXT_PUBLIC_MACI_RPC_URL ?? loaded?.NEXT_PUBLIC_MACI_RPC_URL;
const rpc = publicRpc && new URL(publicRpc);
if (!rpc || rpc.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(rpc.hostname) || rpc.username || rpc.password || rpc.pathname !== '/' || rpc.search || rpc.hash) {
  throw new Error('Web requires a Hardhat Local loopback RPC in NEXT_PUBLIC_MACI_RPC_URL.');
}
const webPort = process.env.WEB_PORT ?? loaded?.WEB_PORT ?? '3000';
const environment = { ...process.env, NEXT_PUBLIC_API_URL: publicOrigin, ...(publicRpc ? { NEXT_PUBLIC_MACI_RPC_URL: publicRpc } : {}) };
for (const key of Object.keys(environment)) if (/^(DATABASE_|MIGRATION_DATABASE_|DEPLOYER_|SUPABASE_|RPC_URL$)/.test(key)) delete environment[key];
const args = ['node_modules/next/dist/bin/next', process.argv[2], 'apps/voter-web'];
if (process.argv[2] === 'dev') args.push('--port', webPort);
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: environment });
if (result.status !== 0 || process.argv[2] !== 'build') process.exit(result.status ?? 1);
const csp = spawnSync(process.execPath, ['scripts/apply-web-csp.mjs'], { stdio: 'inherit', env: environment });
process.exit(csp.status ?? 1);

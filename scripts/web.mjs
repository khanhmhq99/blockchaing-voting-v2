import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

const loaded = config({ path: '.env', quiet: true, processEnv: {} }).parsed;
const publicOrigin = process.env.NEXT_PUBLIC_API_URL ?? loaded?.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const webPort = process.env.WEB_PORT ?? loaded?.WEB_PORT ?? '3000';
const environment = { ...process.env, NEXT_PUBLIC_API_URL: publicOrigin };
for (const key of Object.keys(environment)) if (/^(DATABASE_|MIGRATION_DATABASE_|DEPLOYER_|SUPABASE_|RPC_URL$)/.test(key)) delete environment[key];
const args = ['node_modules/next/dist/bin/next', process.argv[2], 'apps/voter-web'];
if (process.argv[2] === 'dev') args.push('--port', webPort);
const result = spawnSync(process.execPath, args, { stdio: 'inherit', env: environment });
process.exit(result.status ?? 1);

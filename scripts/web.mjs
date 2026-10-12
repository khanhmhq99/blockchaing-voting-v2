import { config } from 'dotenv';
import { spawnSync } from 'node:child_process';

const loaded = config({ path: '.env', quiet: true, processEnv: {} }).parsed;
const publicOrigin = process.env.NEXT_PUBLIC_API_URL ?? loaded?.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const environment = { ...process.env, NEXT_PUBLIC_API_URL: publicOrigin };
for (const key of Object.keys(environment)) if (/^(DATABASE_|MIGRATION_DATABASE_|DEPLOYER_|SUPABASE_|RPC_URL$)/.test(key)) delete environment[key];
const result = spawnSync(process.execPath, ['node_modules/next/dist/bin/next', process.argv[2], 'apps/voter-web'], { stdio: 'inherit', env: environment });
process.exit(result.status ?? 1);

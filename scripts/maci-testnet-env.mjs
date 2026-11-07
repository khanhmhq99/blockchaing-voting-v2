// Run one Node command with an explicitly selected, ignored BSC Testnet environment.
// This wrapper does not print configuration values or generate credentials.
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { config } from 'dotenv';

const file = resolve(process.env.MACI_ENV_FILE ?? '.env.bsc-testnet');
if (!existsSync(file)) throw new Error('Create an ignored .env.bsc-testnet file before running BSC Testnet commands.');
const loaded = config({ path: file, quiet: true, processEnv: {} });
if (loaded.error || !loaded.parsed || loaded.parsed.CHAIN_ID !== '97') throw new Error('The selected BSC Testnet environment must set CHAIN_ID=97.');
const args = process.argv.slice(2);
if (!args.length) throw new Error('Usage: node scripts/maci-testnet-env.mjs <node arguments>');
const env = { ...process.env };
for (const key of Object.keys(env)) {
  if (/^(CHAIN_ID|CHAIN_CONFIRMATIONS|RPC_URL|RELAYER_PRIVATE_KEY|MACI_.*|DATABASE_.*|MIGRATION_DATABASE_.*|DEPLOYER_PRIVATE_KEY|NEXT_PUBLIC_.*|APP_ORIGIN|API_HOST|API_PORT|WEB_PORT)$/.test(key)) delete env[key];
}
Object.assign(env, loaded.parsed, { MACI_ENV_FILE: file, DOTENV_CONFIG_PATH: file });
const child = spawn(process.execPath, args, { env, stdio: 'inherit', windowsHide: true });
child.once('error', () => { process.stderr.write('Unable to start BSC Testnet command.\n'); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = signal ? 1 : code ?? 1; });

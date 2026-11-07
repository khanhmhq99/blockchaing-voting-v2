// One synthetic BSC Testnet administrator for the authorized private PoC.
import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { DatabaseService } from '../services/api/src/database.js';

if (process.env.NODE_ENV === 'production' || process.env.CHAIN_ID !== '97' || process.env.MACI_BSC_TESTNET_ENABLED !== 'true') {
  throw new Error('Synthetic BSC admin requires explicit chain-97 test gate');
}
const runtime = new URL(process.env.DATABASE_URL ?? '');
const migration = new URL(process.env.MIGRATION_DATABASE_URL ?? '');
const runtimeRef = runtime.username.match(/^voting_runtime\.([a-z0-9]+)$/)?.[1];
const migrationRef = migration.username.match(/^postgres\.([a-z0-9]+)$/)?.[1];
if (!runtimeRef || runtimeRef !== migrationRef || runtime.hostname !== 'aws-1-eu-west-3.pooler.supabase.com' ||
    runtime.pathname !== '/postgres' || migration.pathname !== '/postgres' ||
    !['verify-full', 'verify-ca'].includes(runtime.searchParams.get('sslmode') ?? '') ||
    !['verify-full', 'verify-ca'].includes(migration.searchParams.get('sslmode') ?? '')) {
  throw new Error('Synthetic BSC admin refused an unexpected database project or TLS mode');
}
const directory = join(process.cwd(), 'research/mvp3/maci/probe-output/bsc-integration');
mkdirSync(directory, { recursive: true });
const passwordFile = join(directory, 'admin-password.txt');
if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(24).toString('base64url'), { flag: 'wx', mode: 0o600 });
const password = readFileSync(passwordFile, 'utf8');
const salt = randomBytes(16).toString('hex');
const digest = await promisify(scryptCallback)(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
const db = new DatabaseService();
try {
  await db.$connect();
  await db.$transaction(async tx => {
    if (await tx.appUser.count({ where: { role: 'ADMIN', status: 'ACTIVE' } })) throw new Error('Active BSC administrator already exists; refusing to seed another');
    await tx.appUser.create({ data: {
      username: 'maci_bsc_synthetic_admin', usernameKey: 'maci_bsc_synthetic_admin',
      passwordHash: `scrypt$16384$8$1$${salt}$${digest.toString('hex')}`,
      fullName: 'Synthetic BSC MACI Administrator', role: 'ADMIN', status: 'ACTIVE',
    } });
  });
  process.stdout.write('Synthetic BSC administrator created; password remains in ignored local storage.\n');
} finally { await db.$disconnect(); }

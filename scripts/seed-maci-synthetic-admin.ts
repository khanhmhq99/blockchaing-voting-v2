// Bootstrap one synthetic administrator for the explicitly authorized MVP 3 project.
import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseOptions } from '../services/api/src/config.js';

const scrypt = (password: string, salt: string, length: number, options: { N: number; r: number; p: number; maxmem: number }) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key));
});
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV === 'production' || process.env.MACI_SYNTHETIC_ADMIN_ENABLED !== 'true' ||
    url.hostname !== 'aws-0-ap-northeast-2.pooler.supabase.com' ||
    url.username !== 'voting_runtime.igyjcwppnkysckhirfpk' || url.pathname !== '/postgres') {
    throw new Error('Synthetic admin seed requires the approved MVP 3 Supabase project and explicit enable flag.');
  }
  const directory = join(process.cwd(), 'research/mvp3/maci/probe-output/local-integration');
  mkdirSync(directory, { recursive: true });
  const passwordFile = join(directory, 'admin-password.txt');
  if (!existsSync(passwordFile)) writeFileSync(passwordFile, randomBytes(24).toString('base64url'), { flag: 'wx', mode: 0o600 });
  const password = readFileSync(passwordFile, 'utf8');
  const salt = randomBytes(16).toString('hex');
  const digest = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 }) as Buffer;
  const db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(), { schema: 'voting' }) });
  try {
    await db.appUser.create({ data: {
      username: 'maci_synthetic_admin', usernameKey: 'maci_synthetic_admin',
      passwordHash: `scrypt$16384$8$1$${salt}$${digest.toString('hex')}`,
      fullName: 'Synthetic MACI Administrator', role: 'ADMIN', status: 'ACTIVE',
    } });
    console.log('Synthetic MACI administrator persisted.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Synthetic admin seed failed.'); process.exitCode = 1; });

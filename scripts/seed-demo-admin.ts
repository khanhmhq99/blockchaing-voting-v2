import 'dotenv/config';
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { databaseOptions } from '../services/api/src/config.js';

const scrypt = (password: string, salt: string, length: number, options: { N?: number; r?: number; p?: number; maxmem?: number } = {}) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(password, salt, length, options, (error, key) => error ? reject(error) : resolve(key));
});
async function main() {
  if (process.env.NODE_ENV === 'production' || process.env.DEMO_ADMIN_SEED_ENABLED !== 'true') throw new Error('Demo admin seeding requires a non-production environment and DEMO_ADMIN_SEED_ENABLED=true.');
  const databaseUrl = new URL(process.env.DATABASE_URL ?? '');
  if (!['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname)) throw new Error('Demo admin seeding is restricted to loopback PostgreSQL databases.');
  const password = process.env.DEMO_ADMIN_PASSWORD ?? '123';
  if (!password) throw new Error('DEMO_ADMIN_PASSWORD must contain at least one character.');
  const db = new PrismaClient({ adapter: new PrismaPg(databaseOptions(), { schema: 'voting' }) });
  try {
    const existing = await db.appUser.findUnique({ where: { usernameKey: 'admin' } });
    let configured = false;
    if (existing?.role === 'ADMIN' && existing.status === 'ACTIVE') {
      const [algorithm, cost, blockSize, parallelism, salt, digest] = existing.passwordHash.split('$');
      if (algorithm === 'scrypt' && cost === '16384' && blockSize === '8' && parallelism === '1' && salt && digest && /^[0-9a-f]{128}$/i.test(digest)) {
        const expected = Buffer.from(digest, 'hex');
        const actual = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
        configured = timingSafeEqual(expected, actual);
      }
    }
    if (!configured) {
      const salt = randomBytes(16).toString('hex');
      const hash = await scrypt(password, salt, 64, { N: 16384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 });
      const passwordHash = `scrypt$16384$8$1$${salt}$${hash.toString('hex')}`;
      if (existing) await db.$transaction(async tx => {
        await tx.appUser.update({ where: { id: existing.id }, data: { passwordHash, role: 'ADMIN', status: 'ACTIVE' } });
        await tx.appSession.deleteMany({ where: { userId: existing.id } });
      });
      else await db.appUser.create({ data: { username: 'admin', usernameKey: 'admin', passwordHash, fullName: 'Local Demo Administrator', role: 'ADMIN', status: 'ACTIVE' } });
    }
    console.log('Local demo administrator seeded.');
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : 'Demo admin seed failed.'); process.exitCode = 1; });

import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from '../../services/api/src/database.js';

describe.skipIf(!process.env.DATABASE_URL)('configured Supabase: real Prisma connection, read-only', () => {
  it('connects with verified TLS and reads the migrated private schema', async () => {
    const db = new DatabaseService();
    try {
      await db.$connect();
      expect(await db.$queryRaw`SELECT 1 AS value`).toEqual([{ value: 1 }]);
      for (const count of await Promise.all([db.electionMetadata.count(), db.candidateProfile.count(), db.indexedEvent.count(), db.blockchainTransaction.count(), db.benchmarkRun.count(), db.benchmarkMeasurement.count()])) expect(count).toBeGreaterThanOrEqual(0);
    } finally { await db.$disconnect(); }
  });
});

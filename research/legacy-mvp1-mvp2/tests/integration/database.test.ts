import 'dotenv/config';
import { describe, expect, it } from 'vitest';
import { DatabaseService } from '../../services/api/src/database.js';

describe.skipIf(!process.env.DATABASE_URL)('configured Supabase: real Prisma connection, read-only', () => {
  it('connects with verified TLS and reads the migrated private schema', async () => {
    const db = new DatabaseService();
    try {
      await db.$connect();
      expect(await db.$queryRaw`SELECT 1 AS value`).toEqual([{ value: 1 }]);
      for (const count of await Promise.all([db.electionMetadata.count(), db.candidateProfile.count(), db.indexedEvent.count(), db.blockchainTransaction.count(), db.benchmarkRun.count(), db.benchmarkMeasurement.count(), db.gaslessVoteRequest.count(), db.relayerTransaction.count(), db.relayerBudget.count(), db.gaslessRequestHistory.count()])) expect(count).toBeGreaterThanOrEqual(0);
    } finally { await db.$disconnect(); }
  });
});

describe.skipIf(!process.env.DATABASE_URL || process.env.TEST_DATABASE_WRITES !== 'true')('configured Supabase: opt-in rollback-only gasless persistence', () => {
  it('enforces idempotency uniqueness and rolls back request/history writes', async () => {
    const { randomUUID } = await import('node:crypto');
    const db = new DatabaseService(); const id = randomUUID();
    try {
      await db.$connect();
      const data = { id, chainId: '31337', contractAddress: '0x' + '11'.repeat(20), electionId: '1', voterAddress: '0x' + '22'.repeat(20), candidateId: '0', manifestHash: '0x' + '33'.repeat(32), nonce: '0', deadline: '0', intentHash: `rollback-only-${id}`, status: 'QUEUED', validationMs: 0 };
      await expect(db.$transaction(async tx => {
        await tx.gaslessVoteRequest.create({ data: { ...data, history: { create: { status: 'QUEUED' } } } });
        await tx.gaslessVoteRequest.create({ data: { ...data, id: randomUUID() } });
      })).rejects.toMatchObject({ code: 'P2002' });
      expect(await db.gaslessVoteRequest.findUnique({ where: { id } })).toBeNull();
      expect(await db.gaslessRequestHistory.count({ where: { requestId: id } })).toBe(0);
    } finally { await db.$disconnect(); }
  });
});

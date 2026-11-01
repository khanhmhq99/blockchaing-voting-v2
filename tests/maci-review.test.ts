import assert from 'node:assert/strict';
import test from 'node:test';
import { MaciService } from '../services/api/src/maci/module.ts';

test('admin approval checks the chain before the transaction and grants eligibility once', async () => {
  const electionId = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const voterId = '33333333-3333-4333-8333-333333333333';
  const adminId = '44444444-4444-4444-8444-444444444444';
  const request = { id: requestId, electionId, userId: voterId, status: 'PENDING', requestedAt: new Date(), reviewedAt: null as Date | null };
  let inTransaction = false;
  let chainChecks = 0;
  let eligibilityWrites = 0;
  const transaction = {
    maciParticipationRequest: {
      findUnique: async () => ({ ...request }),
      updateMany: async ({ where, data }: { where: { status: string }; data: { status: string; reviewedAt: Date } }) => {
        if (request.status !== where.status) return { count: 0 };
        request.status = data.status; request.reviewedAt = data.reviewedAt;
        return { count: 1 };
      },
      findUniqueOrThrow: async () => ({ ...request }),
    },
    appUser: { findUnique: async () => ({ status: 'ACTIVE', role: 'USER' }) },
    maciEligibility: { upsert: async () => { eligibilityWrites += 1; return {}; } },
  };
  const database = {
    maciElection: { findUnique: async () => ({ id: electionId, startTimestamp: String(Math.floor(Date.now() / 1000) + 600) }) },
    $transaction: async (work: (tx: typeof transaction) => Promise<unknown>) => {
      inTransaction = true;
      try { return await work(transaction); } finally { inTransaction = false; }
    },
  };
  const auth = { admin: async () => ({ id: adminId }) };
  const service = new MaciService(database as never, {} as never, auth as never);
  (service as unknown as { requireRegistrationWindow(election: unknown): Promise<void> }).requireRegistrationWindow = async () => {
    assert.equal(inTransaction, false, 'RPC validation must not run inside a database transaction');
    chainChecks += 1;
  };

  const approved = await service.reviewParticipation('synthetic-session', electionId, requestId, 'APPROVED');
  assert.equal(approved.status, 'APPROVED');
  assert.equal(chainChecks, 1);
  assert.equal(eligibilityWrites, 1);
  await assert.rejects(service.reviewParticipation('synthetic-session', electionId, requestId, 'APPROVED'));
  assert.equal(eligibilityWrites, 1);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { MaciService } from '../services/api/src/maci/module.ts';

test('election list opens a verified local poll after wall time crosses start without a new block', async () => {
  const wallNow = BigInt(Math.floor(Date.now() / 1000));
  const election = {
    id: '11111111-1111-4111-8111-111111111111', title: 'Synthetic poll', candidates: ['A', 'B'],
    chainId: '31337', maciAddress: '0x1111111111111111111111111111111111111111',
    registrationAddress: '0x2222222222222222222222222222222222222222',
    pollAddress: '0x3333333333333333333333333333333333333333', pollId: '0', deploymentBlock: '1',
    status: 'REGISTRATION', startTimestamp: String(wallNow - 60n), endTimestamp: String(wallNow + 3600n), voteOptions: 2,
  };
  let persistedStatus = '';
  const db = {
    maciElection: {
      findMany: async () => [election],
      updateMany: async ({ data }: { data: { status: string } }) => { persistedStatus = data.status; return { count: 1 }; },
    },
    maciEligibility: { findMany: async () => [{ electionId: election.id, status: 'ELIGIBLE' }] },
  };
  const chain = { client: { getBlock: async () => ({ timestamp: wallNow - 600n }) } };
  const auth = { authenticate: async () => ({ id: 'synthetic-voter' }) };
  const service = new MaciService(db as never, chain as never, auth as never);
  (service as unknown as { verifyDeployment(): Promise<unknown> }).verifyDeployment = async () => ({
    startTimestamp: election.startTimestamp, endTimestamp: election.endTimestamp, voteOptions: election.voteOptions,
  });

  const [listed] = await service.list('synthetic-session');
  assert.equal(listed?.status, 'OPEN');
  assert.equal(listed?.eligible, true);
  assert.equal(persistedStatus, 'OPEN');
});

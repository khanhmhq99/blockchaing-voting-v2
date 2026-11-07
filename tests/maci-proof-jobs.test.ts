import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConflictException } from '@nestjs/common';
import { MaciProofJobs } from '../services/api/src/maci/proof-jobs.js';
import { MaciAuditService } from '../services/api/src/maci/audit.js';

const electionId = '11111111-1111-4111-8111-111111111111';
const blockHash = `0x${'a'.repeat(64)}`;
function fixture(status = 'READY') {
  const calls = { published: 0, verified: 0, updated: 0, publishedJobId: '' };
  const job = { id: electionId, electionId, status, stage: 'AUDIT_VERIFIED', diagnosticCode: null,
    closingBlock: 5n, closingHash: blockHash, genesisHash: blockHash, snapshotBlock: 8n, snapshotHash: blockHash,
    manifestJson: '{}', eventsNdjson: '{}\n', proofsJson: '[]', tallyJson: '{}', createdAt: new Date(), updatedAt: new Date() };
  const db = { maciProofJob: { findUnique: async () => job, findFirst: async () => job, updateMany: async () => { calls.updated++; return { count: 1 }; } } };
  const chain = { config: { CHAIN_ID: 31337, CHAIN_CONFIRMATIONS: 2 }, verifyNetwork: async () => {}, client: {
    getBlock: async () => ({ hash: blockHash }), getBlockNumber: async () => 10n,
  } };
  const auth = { admin: async (cookie?: string) => { if (cookie !== 'admin') throw new Error('UNAUTHORIZED'); } };
  const audit = { publish: async (_cookie?: string, _electionId?: string, _files?: unknown, proofJobId?: string) => { calls.published++; calls.publishedJobId = proofJobId ?? ''; return { status: 'VERIFIED' }; }, verifyEvidence: async () => { calls.verified++; } };
  return { service: new MaciProofJobs(db as never, chain as never, auth as never, audit as never), calls, job, db, chain, audit };
}

test('only an authenticated admin can publish a ready job', async () => {
  const { service, calls } = fixture();
  await assert.rejects(service.approve(undefined, electionId), /UNAUTHORIZED/);
  assert.equal(calls.published, 0);
});

test('admin status returns a stable envelope when no proof job exists', async () => {
  const { service, db } = fixture();
  db.maciProofJob.findFirst = async () => null as never;
  assert.deepEqual(await service.status('admin', electionId), { job: null });
});

test('premature approval cannot call audit publication', async () => {
  const { service, calls } = fixture('AWAITING_CONFIRMATIONS');
  await assert.rejects(service.approve('admin', electionId));
  assert.equal(calls.published, 0);
});

test('approval fails closed after a reorg', async () => {
  const { service, calls, chain } = fixture();
  chain.client.getBlock = async () => ({ hash: `0x${'b'.repeat(64)}` });
  await assert.rejects(service.approve('admin', electionId));
  assert.equal(calls.published, 0);
});

test('approval delegates full verification to the existing audit publisher', async () => {
  const { service, calls, audit } = fixture();
  audit.publish = async () => { calls.published++; throw new Error('INVALID_ARTIFACT'); };
  await assert.rejects(service.approve('admin', electionId), /INVALID_ARTIFACT/);
  assert.equal(calls.updated, 0);
});

test('successful approval publishes once and records the job state', async () => {
  const { service, calls } = fixture();
  assert.equal((await service.approve('admin', electionId)).status, 'VERIFIED');
  assert.equal(calls.published, 1);
  assert.equal(calls.publishedJobId, electionId);
  assert.equal(calls.updated, 0);
});

test('worker restart leaves uncertain on-chain work for reconciliation', async () => {
  const { service, db, calls, job } = fixture('RUNNING');
  db.maciProofJob.findMany = async () => [{ ...job, updatedAt: new Date(0), runId: electionId }];
  await service.markInterrupted();
  assert.equal(calls.updated, 1);
});

test('duplicate election job creation is absorbed by the unique database constraint', async () => {
  const { service, db, chain } = fixture();
  let attempts = 0;
  Object.assign(db, {
    maciElection: { findMany: async () => [{ id: electionId, deploymentInstanceId: electionId, status: 'CLOSED', chainId: '31337', endTimestamp: '1', deploymentBlock: '1' }], findUnique: async () => ({ status: 'CLOSED' }) },
    maciDeploymentJob: { findUnique: async () => ({ id: electionId, status: 'READY', genesisHash: blockHash }) },
  });
  Object.assign(db.maciProofJob, {
    findMany: async () => [], findFirst: async () => null,
    create: async () => { attempts++; throw { code: 'P2002' }; },
  });
  Object.assign(chain.client, { getBlock: async ({ blockNumber }: { blockNumber?: bigint } = {}) => ({ hash: blockHash, number: blockNumber ?? 6n, timestamp: 2n }) });
  Object.assign(service, { matchesDeployment: async () => true });
  await service.tick();
  assert.equal(attempts, 1);
});

test('worker skips a historical deployment beyond the current Hardhat head', async () => {
  const { service, db, chain } = fixture();
  let created = 0;
  Object.assign(db, { maciElection: { findMany: async () => [{ id: electionId, endTimestamp: '1', deploymentBlock: '12' }] } });
  Object.assign(db.maciProofJob, { findMany: async () => [], findFirst: async () => null, create: async () => { created++; } });
  Object.assign(chain.client, {
    getBlockNumber: async () => 0n,
    getBlock: async () => ({ number: 0n, timestamp: 2n, hash: blockHash }),
  });
  await service.tick();
  assert.equal(created, 0);
});

test('invalid staged artifacts never become publishable', async () => {
  const { service, db, audit } = fixture('AWAITING_CONFIRMATIONS');
  let nextStatus = '';
  Object.assign(db.maciProofJob, {
    findUniqueOrThrow: db.maciProofJob.findUnique,
    updateMany: async ({ data }: { data: { status: string } }) => { nextStatus = data.status; return { count: 1 }; },
  });
  audit.verifyEvidence = async () => { throw new ConflictException('INVALID_PROOF'); };
  await (service as unknown as { verifyReady(id: string): Promise<void> }).verifyReady(electionId);
  assert.equal(nextStatus, 'RECONCILIATION_REQUIRED');
});

test('staged artifacts remain pending until snapshot finality', async () => {
  const { service, db, chain, calls } = fixture('AWAITING_CONFIRMATIONS');
  Object.assign(db.maciProofJob, { findUniqueOrThrow: db.maciProofJob.findUnique });
  chain.client.getBlockNumber = async () => 8n;
  await (service as unknown as { verifyReady(id: string): Promise<void> }).verifyReady(electionId);
  assert.equal(calls.verified, 0);
  assert.equal(calls.updated, 0);
});

test('audit transaction rejects an approval whose ready job was claimed elsewhere', async () => {
  let auditWrites = 0;
  let electionWrites = 0;
  const transaction = {
    maciElection: { findUniqueOrThrow: async () => ({ status: 'CLOSED' }), update: async () => { electionWrites++; } },
    maciProofJob: { updateMany: async () => ({ count: 0 }) },
    maciAuditRecord: { create: async () => { auditWrites++; return { snapshotBlock: 8n, snapshotHash: blockHash }; } },
  };
  const db = { $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction),
    maciDeploymentJob: { findUnique: async () => null } };
  const audit = new MaciAuditService(db as never, {} as never, { admin: async () => {} } as never);
  Object.assign(audit, { verifyEvidence: async () => ({ electionId, files: { manifestJson: '{}', eventsNdjson: '{}', proofsJson: '[]', tallyJson: '{}' },
    manifest: { snapshotBlock: 8, snapshotBlockHash: blockHash, tally: ['0', '0'] } }) });
  await assert.rejects(audit.publish('admin', electionId, {}, electionId));
  assert.equal(auditWrites, 0);
  assert.equal(electionWrites, 0);
  transaction.maciProofJob.updateMany = async () => ({ count: 1 });
  assert.equal((await audit.publish('admin', electionId, {}, electionId)).status, 'VERIFIED');
  assert.equal(auditWrites, 1);
  assert.equal(electionWrites, 1);
});

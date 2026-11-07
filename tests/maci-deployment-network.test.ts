import assert from 'node:assert/strict';
import test from 'node:test';
import { MaciDeploymentService } from '../services/api/src/maci/deployment.ts';

const id = '11111111-1111-4111-8111-111111111111';
const request = () => ({ title: 'Synthetic testnet poll', candidates: ['A', 'B'],
  startTimestamp: Math.floor(Date.now() / 1000) + 3600, endTimestamp: Math.floor(Date.now() / 1000) + 7200 });

test('testnet deployment rejects a reused local idempotency key before writing', async () => {
  const previous = process.env.MACI_BSC_TESTNET_ENABLED;
  process.env.MACI_BSC_TESTNET_ENABLED = 'true';
  let writes = 0;
  const db = { maciDeploymentJob: { findUnique: async () => ({ chainId: '31337', requestHash: 'different' }), create: async () => { writes++; } } };
  const chain = { config: { CHAIN_ID: 97 }, client: { getChainId: async () => 97 } };
  const auth = { admin: async () => ({ id }) };
  try {
    const service = new MaciDeploymentService(db as never, chain as never, auth as never, {} as never);
    await assert.rejects(service.create('admin', id, request()), error => typeof error === 'object' && error !== null && 'response' in error &&
      (error.response as { code?: string }).code === 'MACI_IDEMPOTENCY_NETWORK_MISMATCH');
    assert.equal(writes, 0);
  } finally {
    if (previous === undefined) delete process.env.MACI_BSC_TESTNET_ENABLED;
    else process.env.MACI_BSC_TESTNET_ENABLED = previous;
  }
});

test('testnet deployment status refuses a local job', async () => {
  const db = { maciDeploymentJob: { findUnique: async () => ({ chainId: '31337' }) } };
  const chain = { config: { CHAIN_ID: 97 } };
  const auth = { admin: async () => ({ id }) };
  const service = new MaciDeploymentService(db as never, chain as never, auth as never, {} as never);
  await assert.rejects(service.status('admin', id), error => typeof error === 'object' && error !== null && 'response' in error &&
    (error.response as { code?: string }).code === 'MACI_CHAIN_MISMATCH');
});

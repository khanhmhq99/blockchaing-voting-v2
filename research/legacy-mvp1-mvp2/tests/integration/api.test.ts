import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { IndexerService } from '../../services/api/src/indexer.js';
import { payloadHash } from '../../packages/shared-types/src/index.js';
import { localChain, type LocalChain } from '../helpers/chain.js';
import { testApi } from '../helpers/api.js';

describe('NestJS with real EVM and explicit in-memory database double', () => {
  let chain: LocalChain;
  let api: Awaited<ReturnType<typeof testApi>>;
  const manifest = { title: 'Integration election', description: '', candidates: [{ name: 'A', biography: '' }, { name: 'B', biography: '' }] };
  beforeAll(async () => {
    chain = await localChain(18546);
    const start = (await chain.client.getBlock()).timestamp + 100n;
    await chain.write('createElection', [start, start + 1000n, 2, payloadHash(manifest)]);
    await chain.write('registerCandidates', [1n, manifest.candidates.map(payloadHash)]);
    await chain.write('setEligibility', [1n, [chain.accounts[1], chain.accounts[2]], true]);
    await chain.write('freeze', [1n]);
    await chain.time(start);
    api = await testApi(chain, manifest);
  });
  afterAll(async () => { await api?.app.close(); chain?.stop(); });
  it('reads eligibility, accepted votes and results from the contract', async () => {
    await chain.write('vote', [1n, 1], chain.accounts[1]);
    const response = await fetch(`${api.url}/v1/elections/1?voter=${chain.accounts[1]}`);
    const result = await response.json();
    expect(result.metadataStatus).toBe('verified');
    expect(result.chain).toMatchObject({ hasVoted: true, eligible: true, totalVotes: '1', counts: ['0', '1'], source: 'blockchain' });
    api.db.corrupt();
    const corrupted = await (await fetch(`${api.url}/v1/elections/1?voter=${chain.accounts[1]}`)).json();
    expect(corrupted.metadata).toBeNull();
    expect(corrupted.metadataStatus).toBe('mismatch');
    expect(corrupted.chain.totalVotes).toBe('1');
  });
  it('rejects unauthenticated admin writes and malformed IDs without exposing secrets', async () => {
    const response = await fetch(`${api.url}/v1/admin/elections/1/metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(manifest) });
    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('stack');
    expect((await fetch(`${api.url}/v1/elections/not-an-id`)).status).toBe(400);
  });
  it('rebuilds events idempotently and removes orphaned records after a reorg', async () => {
    const indexer = api.module.get(IndexerService);
    const first = await indexer.sync();
    await indexer.sync();
    expect(api.db.events.length).toBe(first.records);
    const snapshot = await chain.rpc('evm_snapshot');
    await chain.write('vote', [1n, 0], chain.accounts[2]);
    await indexer.sync();
    expect(api.db.events.length).toBe(first.records! + 1);
    await chain.rpc('evm_revert', [snapshot]);
    await indexer.sync();
    expect(api.db.events.length).toBe(first.records);
    const result = await (await fetch(`${api.url}/v1/elections/1/results`)).json();
    expect(result.totalVotes).toBe('1');
  });
});

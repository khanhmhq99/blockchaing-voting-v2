import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeEventLog } from 'viem';
import { votingAbi } from '../../packages/contracts/src/abi.js';
import { payloadHash } from '../../packages/shared-types/src/index.js';
import { localChain, type LocalChain } from '../helpers/chain.js';

describe('BasicVoting on a real local EVM', () => {
  let c: LocalChain;
  let start: bigint;
  const hash = payloadHash({ synthetic: true });
  beforeAll(async () => { c = await localChain(); start = (await c.client.getBlock()).timestamp + 1000n; });
  afterAll(() => c?.stop());
  it('rejects non-owner creation and malformed configuration', async () => {
    await expect(c.write('createElection', [start, start + 1000n, 2, hash], c.accounts[1])).rejects.toThrow();
    await expect(c.write('createElection', [start, start, 2, hash])).rejects.toThrow();
    await expect(c.write('createElection', [start, start + 1000n, 101, hash])).rejects.toThrow();
  });
  it('registers candidates, bounds batches, and freezes eligibility atomically', async () => {
    await c.write('createElection', [start, start + 1000n, 2, hash]);
    await expect(c.write('freeze', [1n])).rejects.toThrow();
    const receipt = await c.write('registerCandidates', [1n, [hash, hash]]);
    expect(receipt.logs.map(log => decodeEventLog({ abi: votingAbi, ...log }).eventName)).toEqual(['CandidateAdded', 'CandidateAdded']);
    await expect(c.write('setEligibility', [1n, Array(201).fill(c.accounts[1]), true])).rejects.toThrow();
    await c.write('setEligibility', [1n, [c.accounts[1], c.accounts[1], c.accounts[2]], true]);
    await c.write('setEligibility', [1n, [c.accounts[2]], false]);
    await c.write('setEligibility', [1n, [c.accounts[2]], true]);
    expect((await c.client.readContract({ address: c.address, abi: votingAbi, functionName: 'getElection', args: [1n] })).eligibleCount).toBe(2n);
    await expect(c.write('vote', [1n, 0], c.accounts[1])).rejects.toThrow();
    await c.write('freeze', [1n]);
    await expect(c.write('configureElection', [1n, start, start + 2000n, 2, hash])).rejects.toThrow();
    await expect(c.write('setEligibility', [1n, [c.accounts[3]], true])).rejects.toThrow();
  });
  it('enforces time, eligibility, selection bounds, and concurrent duplicate protection', async () => {
    await expect(c.write('vote', [1n, 0], c.accounts[1])).rejects.toThrow();
    await c.time(start);
    await expect(c.write('vote', [1n, 0], c.accounts[3])).rejects.toThrow();
    await expect(c.write('vote', [1n, 2], c.accounts[1])).rejects.toThrow();
    const duplicates = await Promise.allSettled([c.write('vote', [1n, 0], c.accounts[1]), c.write('vote', [1n, 1], c.accounts[1])]);
    expect(duplicates.filter(result => result.status === 'fulfilled' && result.value.status === 'success')).toHaveLength(1);
    await c.write('vote', [1n, 1], c.accounts[2]);
    await expect(c.write('vote', [1n, 1], c.accounts[2])).rejects.toThrow();
    const election = await c.client.readContract({ address: c.address, abi: votingAbi, functionName: 'getElection', args: [1n] });
    expect(election.totalVotes).toBe(2n);
    const counts = await Promise.all([0, 1].map(i => c.client.readContract({ address: c.address, abi: votingAbi, functionName: 'candidateVotes', args: [1n, i] })));
    expect(counts.reduce((a, b) => a + b)).toBe(election.totalVotes);
    await expect(c.write('finalize', [1n])).rejects.toThrow();
  });
  it('closes at the deadline, finalizes once, and preserves results', async () => {
    await c.time(start + 1000n);
    await expect(c.write('vote', [1n, 0], c.accounts[1])).rejects.toThrow();
    const receipt = await c.write('finalize', [1n]);
    expect(receipt.logs.map(log => decodeEventLog({ abi: votingAbi, ...log }).eventName)).toContain('ElectionClosed');
    await expect(c.write('finalize', [1n])).rejects.toThrow();
    await expect(c.write('cancel', [1n, hash])).rejects.toThrow();
  });
  it('keeps election scopes independent and cancellation terminal', async () => {
    const now = (await c.client.getBlock()).timestamp;
    await c.write('createElection', [now + 100n, now + 200n, 2, hash]);
    expect(await c.client.readContract({ address: c.address, abi: votingAbi, functionName: 'hasVoted', args: [2n, c.accounts[1]!] })).toBe(false);
    await c.write('cancel', [2n, hash]);
    await expect(c.write('registerCandidates', [2n, [hash, hash]])).rejects.toThrow();
    await expect(c.write('transferOwnership', [c.accounts[1]])).rejects.toThrow();
  });
});

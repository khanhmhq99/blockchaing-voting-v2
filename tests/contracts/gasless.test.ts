import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { decodeEventLog, hashTypedData } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { gaslessAbi } from '../../packages/contracts/src/gasless-abi.js';
import { payloadHash } from '../../packages/shared-types/src/index.js';
import { intentMessage, votingTypedData, type VotingIntent } from '../../packages/shared-types/src/gasless.js';
import { localChain, type LocalChain } from '../helpers/chain.js';

describe('GaslessVoting authorization on real local EVM', () => {
  let c: LocalChain; let start: bigint;
  const voters = Array.from({ length: 8 }, () => privateKeyToAccount(generatePrivateKey()));
  const manifestHash = payloadHash({ synthetic: true });
  const intent = (index = 0, changes: Partial<VotingIntent> = {}): VotingIntent => ({ electionId: '1', manifestHash, candidateId: '0', voter: voters[index]!.address.toLowerCase() as `0x${string}`, nonce: '0', deadline: (start + 500n).toString(), ...changes });
  const sign = (i: VotingIntent, index = 0) => voters[index]!.signTypedData(votingTypedData(i, 31337, c.address));
  beforeAll(async () => {
    c = await localChain(18550, 'mvp2'); start = (await c.client.getBlock()).timestamp + 1000n;
    for (let id = 1; id <= 2; id++) {
      await c.write('createElection', [start, start + 1000n, 2, manifestHash]);
      await c.write('registerCandidates', [BigInt(id), [manifestHash, manifestHash]]);
      await c.write('setEligibility', [BigInt(id), [...voters.slice(0, 7).map(v => v.address), c.accounts[2]], true]);
      await c.write('freeze', [BigInt(id)]);
    }
  });
  afterAll(() => c?.stop());
  it('matches Viem digest and rejects an inactive election', async () => {
    const i = intent();
    expect(await c.client.readContract({ address: c.address, abi: gaslessAbi, functionName: 'intentDigest', args: [intentMessage(i)] })).toBe(hashTypedData(votingTypedData(i, 31337, c.address)));
    await expect(c.write('voteWithSignature', [intentMessage(i), await sign(i)], c.accounts[1])).rejects.toThrow();
    await c.time(start);
  });
  it('rejects every signed field mutation and wrong domains/signers', async () => {
    const i = intent(); const signature = await sign(i);
    for (const mutation of [{ candidateId: '1' }, { voter: voters[1]!.address }, { electionId: '2' }, { nonce: '1' }, { deadline: (start + 499n).toString() }, { manifestHash: payloadHash({ changed: true }) }]) {
      await expect(c.write('voteWithSignature', [intentMessage({ ...i, ...mutation }), signature], c.accounts[1])).rejects.toThrow();
    }
    for (const data of [votingTypedData(i, 1, c.address), votingTypedData(i, 31337, c.accounts[4]!)]) {
      await expect(c.write('voteWithSignature', [intentMessage(i), await voters[0]!.signTypedData(data)], c.accounts[1])).rejects.toThrow();
    }
    await expect(c.write('voteWithSignature', [intentMessage(i), await sign(i, 1)], c.accounts[1])).rejects.toThrow();
    await expect(c.write('voteWithSignature', [intentMessage(i), '0x1234'], c.accounts[1])).rejects.toThrow();
  });
  it('rejects ineligible, expired, invalid candidate, manifest and nonce without consumption', async () => {
    for (const [index, changes] of [[7, {}], [0, { deadline: (start - 1n).toString() }], [0, { candidateId: '2' }], [0, { candidateId: '4294967296' }], [0, { nonce: '1' }], [0, { manifestHash: payloadHash({ bad: true }) }]] as const) {
      const i = intent(index, changes);
      await expect(c.write('voteWithSignature', [intentMessage(i), await sign(i, index)], c.accounts[1])).rejects.toThrow();
    }
    expect(await c.client.readContract({ address: c.address, abi: gaslessAbi, functionName: 'nonces', args: [1n, voters[0]!.address] })).toBe(0n);
  });
  it('accepts zero-balance voter, attributes actual voter, rejects replay and concurrent duplicates', async () => {
    const i = intent(); const signature = await sign(i);
    const before = await c.client.getBalance({ address: voters[0]!.address });
    expect(before).toBe(0n);
    const results = await Promise.allSettled([c.write('voteWithSignature', [intentMessage(i), signature], c.accounts[1]), c.write('voteWithSignature', [intentMessage(i), signature], c.accounts[3])]);
    const successes = results.filter(r => r.status === 'fulfilled' && r.value.status === 'success');
    expect(successes).toHaveLength(1);
    const receipt = successes[0]!; if (receipt.status !== 'fulfilled') throw new Error('No receipt');
    const events = receipt.value.logs.map(log => decodeEventLog({ abi: gaslessAbi, ...log }));
    const vote = events.find(e => e.eventName === 'VoteCast');
    expect(vote?.args.voter?.toLowerCase()).toBe(i.voter);
    expect(await c.client.getBalance({ address: voters[0]!.address })).toBe(0n);
    await expect(c.write('voteWithSignature', [intentMessage(i), signature], c.accounts[1])).rejects.toThrow();
    expect(await c.client.readContract({ address: c.address, abi: gaslessAbi, functionName: 'nonces', args: [1n, voters[0]!.address] })).toBe(1n);
  });
  it('shares direct/gasless uniqueness and preserves counts and election scope', async () => {
    await c.write('vote', [1n, 1], c.accounts[2]);
    const i = intent(1, { voter: c.accounts[2]!.toLowerCase() as `0x${string}`, nonce: '1' });
    const signature = await c.wallet.signTypedData({ account: c.accounts[2]!, ...votingTypedData(i, 31337, c.address) });
    await expect(c.write('voteWithSignature', [intentMessage(i), signature], c.accounts[1])).rejects.toThrow();
    const second = intent(0, { electionId: '2' });
    await c.write('voteWithSignature', [intentMessage(second), await sign(second)], c.accounts[1]);
    expect((await c.client.readContract({ address: c.address, abi: gaslessAbi, functionName: 'getElection', args: [1n] })).totalVotes).toBe(2n);
    expect(await c.client.readContract({ address: c.address, abi: gaslessAbi, functionName: 'candidateVotes', args: [1n, 0] })).toBe(1n);
    expect(await c.client.readContract({ address: c.address, abi: gaslessAbi, functionName: 'candidateVotes', args: [1n, 1] })).toBe(1n);
    await c.time(start + 1000n);
    const closed = intent(2, { deadline: (start + 2000n).toString() });
    await expect(c.write('voteWithSignature', [intentMessage(closed), await sign(closed, 2)], c.accounts[1])).rejects.toThrow();
  });
});

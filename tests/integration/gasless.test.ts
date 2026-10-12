import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hashTypedData, type Hex } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { setTimeout as delay } from 'node:timers/promises';
import { payloadHash } from '../../packages/shared-types/src/index.js';
import { votingTypedData, type VotingIntent } from '../../packages/shared-types/src/gasless.js';
import { gaslessAbi } from '../../packages/contracts/src/gasless-abi.js';
import { RelayerService } from '../../services/api/src/relayer/service.js';
import { TransactionSender } from '../../services/api/src/relayer/sender.js';
import { DatabaseService } from '../../services/api/src/database.js';
import { localChain, type LocalChain } from '../helpers/chain.js';
import { testApi } from '../helpers/api.js';

describe('NestJS sponsorship on real EVM with explicit memory database', () => {
  let chain: LocalChain; let api: Awaited<ReturnType<typeof testApi>>; let relay: RelayerService;
  const voters = Array.from({ length: 12 }, () => privateKeyToAccount(generatePrivateKey()));
  const relayerKey = generatePrivateKey(); const sponsor = privateKeyToAccount(relayerKey);
  const manifest = { title: 'Gasless synthetic election', description: '', candidates: [{ name: 'A', biography: '' }, { name: 'B', biography: '' }] };
  let start: bigint;
  type Status = { id: string; status: string; transactionHash: Hex | null; errorCode: string | null; transactionFee: string | null; relayerAddress: string | null };
  async function signed(index: number, changes: Partial<VotingIntent> = {}) {
    const intent: VotingIntent = { electionId: '1', manifestHash: payloadHash(manifest), voter: voters[index]!.address.toLowerCase() as Hex, candidateId: String(index % 2), nonce: '0', deadline: ((await chain.client.getBlock()).timestamp + 120n).toString(), ...changes };
    const typed = votingTypedData(intent, 31337, chain.address);
    return { body: { intent, signature: await voters[index]!.signTypedData(typed) }, digest: hashTypedData(typed) };
  }
  async function post(input: Awaited<ReturnType<typeof signed>>) {
    return fetch(`${api.url}/v1/gasless/votes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'idempotency-key': input.digest }, body: JSON.stringify(input.body) });
  }
  async function terminal(id: string) {
    for (let i = 0; i < 50; i++) {
      await relay.pump(); const status = await relay.status(id);
      if (['CONFIRMED', 'FAILED', 'REJECTED'].includes(status.status)) return status;
      await delay(20);
    }
    throw new Error('Fixture request did not complete');
  }
  beforeAll(async () => {
    chain = await localChain(18551, 'mvp2');
    Object.assign(process.env, { GASLESS_ENABLED: 'true', RELAYER_PRIVATE_KEY: relayerKey, RELAYER_RATE_PER_MINUTE: '10000', RELAYER_VOTER_ATTEMPTS: '20' });
    await chain.rpc('hardhat_setBalance', [sponsor.address, '0x56BC75E2D63100000']);
    start = (await chain.client.getBlock()).timestamp + 1000n;
    await chain.write('createElection', [start, start + 10000n, 2, payloadHash(manifest)]);
    await chain.write('registerCandidates', [1n, manifest.candidates.map(payloadHash)]);
    await chain.write('setEligibility', [1n, voters.slice(0, 11).map(v => v.address), true]);
    await chain.write('freeze', [1n]); await chain.time(start);
    api = await testApi(chain, manifest); relay = api.module.get(RelayerService);
  });
  afterAll(async () => { await api?.app.close(); chain?.stop(); for (const key of ['GASLESS_ENABLED', 'RELAYER_PRIVATE_KEY', 'RELAYER_RATE_PER_MINUTE', 'RELAYER_VOTER_ATTEMPTS']) delete process.env[key]; });
  it('rejects malformed, mutated, expired, wrong nonce and unauthorized inputs before payment', async () => {
    const input = await signed(0);
    const bad = await post({ ...input, body: { ...input.body, intent: { ...input.body.intent, candidateId: '01' } } }); expect(bad.status).toBe(400);
    const mutated = await post({ ...input, body: { ...input.body, intent: { ...input.body.intent, candidateId: '1' } } }); expect(mutated.status).toBe(400);
    for (const invalid of [await signed(0, { nonce: '1' }), await signed(0, { deadline: (start - 1n).toString() }), await signed(11)]) expect((await post(invalid)).status).toBeGreaterThanOrEqual(400);
    expect(await chain.client.getTransactionCount({ address: sponsor.address })).toBe(0);
  });
  it('deduplicates concurrent HTTP submissions and sponsors two zero-balance voters with distinct transaction nonces', async () => {
    const input = await signed(0); const before = await chain.client.getBalance({ address: sponsor.address });
    const responses = await Promise.all([post(input), post(input), post(await signed(1))]);
    const rows = await Promise.all(responses.map(async r => { expect(r.status).toBe(201); return r.json() as Promise<Status>; }));
    expect(rows[0]!.id).toBe(rows[1]!.id);
    const first = await terminal(rows[0]!.id); const second = await terminal(rows[2]!.id);
    expect([first.status, second.status]).toEqual(['CONFIRMED', 'CONFIRMED']);
    const txs = await Promise.all([first, second].map(r => chain.client.getTransaction({ hash: r.transactionHash as Hex })));
    expect(txs.map(t => t.nonce)).toEqual([0, 1]);
    expect(txs.every(t => t.from.toLowerCase() === sponsor.address.toLowerCase())).toBe(true);
    expect(before - await chain.client.getBalance({ address: sponsor.address })).toBe(BigInt(first.transactionFee!) + BigInt(second.transactionFee!));
    for (const voter of voters.slice(0, 2)) expect(await chain.client.getBalance({ address: voter.address })).toBe(0n);
    expect((await chain.client.readContract({ address: chain.address, abi: gaslessAbi, functionName: 'getElection', args: [1n] })).totalVotes).toBe(2n);
    const duplicate = await post(input); expect((await duplicate.json() as Status).id).toBe(first.id);
    const db = api.module.get(DatabaseService);
    const persisted = await db.gaslessVoteRequest.findUniqueOrThrow({ where: { id: first.id }, include: { transaction: true } });
    expect(persisted.signature).toBeNull(); expect(persisted.transaction!.rawTransaction).toBeNull();
  });
  it('returns safe sponsorship errors for balance, gas and budget limits', async () => {
    const sender = api.module.get(TransactionSender);
    const input = await signed(2);
    await chain.rpc('hardhat_setBalance', [sponsor.address, '0x0']);
    await expect(sender.prepare(input.body.intent, input.body.signature)).rejects.toMatchObject({ code: 'RELAYER_BALANCE_LOW' });
    await chain.rpc('hardhat_setBalance', [sponsor.address, '0x56BC75E2D63100000']);
    process.env.RELAYER_MAX_GAS = '1'; await expect(sender.prepare(input.body.intent, input.body.signature)).rejects.toMatchObject({ code: 'GAS_LIMIT_EXCEEDED' }); delete process.env.RELAYER_MAX_GAS;
    process.env.RELAYER_BUDGET_WEI = '0';
    const response = await post(input); const row = await response.json() as Status;
    expect((await terminal(row.id)).errorCode).toBe('SPONSORSHIP_BUDGET_EXCEEDED'); delete process.env.RELAYER_BUDGET_WEI;
  });
  it('preserves signed hash after uncertain broadcast and recovers without allocating another nonce', async () => {
    const sender = api.module.get(TransactionSender); const original = sender.broadcast.bind(sender);
    const mock = vi.spyOn(sender, 'broadcast').mockRejectedValue(new Error('simulated RPC timeout'));
    const response = await post(await signed(3)); const row = await response.json() as Status;
    await relay.pump(); const pending = await relay.status(row.id);
    expect(pending.status).toBe('PENDING'); expect(pending.errorCode).toBe('BROADCAST_UNCERTAIN');
    const hash = pending.transactionHash;
    mock.mockImplementation(original);
    // A fresh worker object has no in-memory queue/nonce state; reuse persisted rows.
    await relay.onModuleDestroy();
    relay = new RelayerService(relay.db, relay.chain, relay.authorization, sender);
    const confirmed = await terminal(row.id); expect(confirmed.transactionHash).toBe(hash); expect(confirmed.status).toBe('CONFIRMED'); mock.mockRestore();
  });
  it('does not broadcast when transaction persistence fails and resumes the durable queue', async () => {
    const db = api.module.get(DatabaseService);
    const nonce = await chain.client.getTransactionCount({ address: sponsor.address });
    const mock = vi.spyOn(db.relayerTransaction, 'create').mockRejectedValue(new Error('simulated database outage'));
    const response = await post(await signed(6)); const row = await response.json() as Status;
    await relay.pump().catch(() => undefined);
    expect(await chain.client.getTransactionCount({ address: sponsor.address })).toBe(nonce);
    mock.mockRestore(); expect((await terminal(row.id)).status).toBe('CONFIRMED');
  });
  it('records mined revert without automatically signing a retry', async () => {
    await chain.rpc('evm_setAutomine', [false]);
    const input = await signed(7, { deadline: ((await chain.client.getBlock()).timestamp + 5n).toString() });
    const response = await post(input); const row = await response.json() as Status;
    await relay.pump(); expect((await relay.status(row.id)).status).toBe('PENDING');
    await chain.time(BigInt(input.body.intent.deadline) + 1n); await chain.rpc('evm_setAutomine', [true]);
    expect((await terminal(row.id)).status).toBe('FAILED');
    const nonce = await chain.client.getTransactionCount({ address: sponsor.address });
    await relay.pump(); expect(await chain.client.getTransactionCount({ address: sponsor.address })).toBe(nonce);
    expect(await chain.client.readContract({ address: chain.address, abi: gaslessAbi, functionName: 'hasVoted', args: [1n, voters[7]!.address] })).toBe(false);
  });
  it('rejects the administrative signer for sponsorship', async () => {
    const sender = api.module.get(TransactionSender); const input = await signed(8);
    const mock = vi.spyOn(sender.chain, 'owner').mockResolvedValue(sponsor.address);
    await expect(sender.prepare(input.body.intent, input.body.signature)).rejects.toMatchObject({ code: 'RELAYER_ADMIN_KEY_REUSE' }); mock.mockRestore();
  });
  it('keeps a pending transaction uncertain and detects reorg after confirmation', async () => {
    await relay.pump(); const snapshot = await chain.rpc('evm_snapshot');
    await chain.rpc('evm_setAutomine', [false]);
    const response = await post(await signed(4)); const row = await response.json() as Status;
    await relay.pump(); const pending = await relay.status(row.id); expect(pending.status).toBe('PENDING');
    await chain.rpc('evm_mine'); await chain.rpc('evm_setAutomine', [true]);
    expect((await terminal(row.id)).status).toBe('CONFIRMED');
    await chain.rpc('evm_revert', [snapshot]);
    const reverted = await relay.status(row.id); expect(reverted.status).toBe('PENDING'); expect(reverted.errorCode).toBe('REORG_DETECTED');
    // Re-include the exact transaction from the RPC archive is an operator task after retention purge.
    // Keep this final request unresolved to assert fail-closed sender behavior.
  });
  it('enforces rate limits without exposing provider details', async () => {
    process.env.RELAYER_RATE_PER_MINUTE = '1';
    const response = await post(await signed(5)); expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({ error: { code: 'RATE_LIMITED' } }); process.env.RELAYER_RATE_PER_MINUTE = '10000';
  });
});

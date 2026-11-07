import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { keccak256 } from 'ethers';
import { MaciDeploymentJournal, acquireDeploymentSignerLock } from '../scripts/maci-deployment-journal.mjs';

const from = '0x1111111111111111111111111111111111111111';
const to = '0x2222222222222222222222222222222222222222';
const genesisHash = `0x${'a'.repeat(64)}`;
const config = { chainId: 97, runId: 'synthetic-journal-test', candidates: ['A', 'B'] };
const intent = { to, data: '0x1234', value: 0n };

function fixture(feeLimits = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maci-journal-test-'));
  const transactions = new Map();
  const receipts = new Map();
  let head = 1;
  let broadcasts = 0;
  let failure = null;
  const provider = {
    async getNetwork() { return { chainId: 97n }; },
    async getBlock(number) { return number === 0 ? { hash: genesisHash } : { number: head }; },
    async getBlockNumber() { return head; },
    async getTransaction(hash) { return transactions.get(hash) ?? null; },
    async getTransactionReceipt(hash) { return receipts.get(hash) ?? null; },
    async getCode() { return '0x6000'; },
    async getTransactionCount(_address, mode) {
      const mined = [...receipts.values()].length;
      return mode === 'latest' ? mined : transactions.size;
    },
    async waitForTransaction(hash) { return mine(hash); },
    async broadcastTransaction(raw) {
      if (failure === 'before') throw new Error('RPC down before broadcast');
      const transaction = JSON.parse(Buffer.from(raw.slice(2), 'hex').toString('utf8'));
      const hash = keccak256(raw);
      transactions.set(hash, { ...transaction, hash, from });
      broadcasts += 1;
      if (failure === 'after') throw new Error('RPC dropped response after broadcast');
      return transactions.get(hash);
    },
  };
  function mine(hash) {
    const tx = transactions.get(hash);
    assert.ok(tx);
    const receipt = { status: 1, blockNumber: ++head, blockHash: `0x${head.toString(16).padStart(64, '0')}`,
      gasUsed: 21000n, contractAddress: null };
    receipts.set(hash, receipt);
    return receipt;
  }
  const wallet = {
    async populateTransaction(tx) { return { gasLimit: 21_000n, gasPrice: 100_000_000n, ...tx }; },
    async signTransaction(tx) { return `0x${Buffer.from(JSON.stringify(tx, (_, value) => typeof value === 'bigint' ? value.toString() : value)).toString('hex')}`; },
  };
  function journal(overrides = {}) {
    return new MaciDeploymentJournal({ file: path.join(dir, 'journal.json'), chainId: 97, genesisHash,
      runId: config.runId, signerAddress: from, configuration: config, confirmations: 1, provider, wallet, ...feeLimits, ...overrides });
  }
  return { journal, provider, transactions, receipts, mine, setFailure(value) { failure = value; }, get broadcasts() { return broadcasts; } };
}

test('BSC fee limits stop signing and are immutable across recovery', async () => {
  const f = fixture({ maxGasPriceWei: '1000000000', maxCostWei: '10000000000000' });
  const first = f.journal(); first.setStage('policy');
  const sent = await first.send(intent);
  assert.equal(first.record.entries[0].maxTransactionCostWei, '2100000000000');
  assert.throws(() => f.journal({ maxCostWei: '20000000000000' }), /identity mismatch/);
  f.mine(sent.hash);
  const resumed = f.journal(); resumed.setStage('policy');
  await resumed.send(intent);
  await resumed.confirmAll();
  assert.equal(f.broadcasts, 1);
  const highPrice = fixture({ maxGasPriceWei: '50000000' });
  const limited = highPrice.journal(); limited.setStage('policy');
  await assert.rejects(limited.send(intent), /gas price exceeds/);
  assert.equal(limited.record.entries.length, 0);
  const lowBudget = fixture({ maxCostWei: '1000000000000' });
  const budgeted = lowBudget.journal(); budgeted.setStage('policy');
  await assert.rejects(budgeted.send(intent), /cost exceeds/);
  assert.equal(budgeted.record.entries.length, 0);
});

test('prepared transaction survives an interruption before broadcast and reuses the signed identity', async () => {
  const f = fixture();
  const first = f.journal(); first.setStage('policy'); f.setFailure('before');
  await assert.rejects(first.send(intent), /manual reconciliation/);
  const prepared = first.record.entries[0];
  assert.equal(prepared.status, 'prepared');
  assert.equal(f.broadcasts, 0);
  const resumed = f.journal(); resumed.setStage('policy'); f.setFailure(null);
  const response = await resumed.send(intent);
  assert.equal(response.hash, prepared.hash);
  f.mine(response.hash);
  await resumed.confirmAll();
  assert.equal(f.broadcasts, 1);
});

test('lost RPC response after broadcast cannot cause another transaction', async () => {
  const f = fixture(); const first = f.journal(); first.setStage('policy'); f.setFailure('after');
  const sent = await first.send(intent);
  assert.equal(f.broadcasts, 1);
  const resumed = f.journal(); resumed.setStage('policy'); f.setFailure(null);
  assert.equal((await resumed.send(intent)).hash, sent.hash);
  f.mine(sent.hash);
  await resumed.confirmAll();
  assert.equal(f.broadcasts, 1);
});

test('mined transaction survives an interruption before checkpoint persistence', async () => {
  const f = fixture(); const first = f.journal(); first.setStage('policy');
  const sent = await first.send(intent); f.mine(sent.hash);
  const resumed = f.journal(); resumed.setStage('policy');
  assert.equal((await resumed.send(intent)).hash, sent.hash);
  await resumed.confirmAll();
  assert.equal(f.broadcasts, 1);
  assert.equal(resumed.record.entries[0].status, 'confirmed');
});

test('configuration, intent, chain and occupied-nonce mismatches fail closed', async () => {
  const f = fixture(); const first = f.journal(); first.setStage('policy');
  f.setFailure('before'); await assert.rejects(first.send(intent));
  const resumed = f.journal(); resumed.setStage('policy');
  await assert.rejects(resumed.send({ ...intent, data: '0xabcd' }), /intent/);
  f.provider.getNetwork = async () => ({ chainId: 56n });
  const wrongChain = f.journal(); wrongChain.setStage('policy');
  await assert.rejects(wrongChain.send(intent), /fingerprint/);
});

test('same signer and chain cannot be used concurrently', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'maci-lock-test-'));
  const release = acquireDeploymentSignerLock(dir, 97, genesisHash, from);
  assert.throws(() => acquireDeploymentSignerLock(dir, 97, genesisHash, from), /Another deployment process/);
  release();
  const releaseAgain = acquireDeploymentSignerLock(dir, 97, genesisHash, from);
  releaseAgain();
});

import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createWalletClient, hashTypedData, http, keccak256, stringToHex, type Hex, type TransactionReceipt } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { localChain } from '../tests/helpers/chain.js';
import { testApi } from '../tests/helpers/api.js';
import { votingAbi } from '../packages/contracts/src/abi.js';
import { payloadHash } from '../packages/shared-types/src/index.js';
import { votingTypedData } from '../packages/shared-types/src/gasless.js';
import type { RelayerService } from '../services/api/src/relayer/service.js';

const sha = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const ns = (milliseconds: number) => String(Math.round(milliseconds * 1e6));
// Public, reproducible synthetic accounts ONLY. Never use this derivation for funds.
const account = (label: string) => privateKeyToAccount(keccak256(stringToHex(`HCMUT MVP2 LOCAL SYNTHETIC ONLY ${label}`)));
let snapshotHash = '';
type Row = { logicalVoteId: string; transactionHash: string; senderRole: string; nonce: number; blockNumber: string; blockHash: string; gasUsed: string; effectiveGasPrice: string; feeWei: string; voterFeeWei: string; sponsorFeeWei: string; signatureNs: string | null; validationNs: string | null; queueNs: string | null; submissionNs: string; confirmationNs: string; endToEndNs: string; success: boolean };

let nextPort = 18552;
async function run(mode: 'mvp1' | 'mvp2', count: number, parent: string) {
  const chain = await localChain(nextPort++, mode);
  let api: Awaited<ReturnType<typeof testApi>> | undefined;
  const directory = `${parent}/${mode}-${count}`; mkdirSync(directory, { recursive: true });
  const rows: Row[] = []; const setup: { operation: string; hash: string; gasUsed: string; feeWei: string }[] = [];
  const startedAt = new Date().toISOString();
  const voters = Array.from({ length: count }, (_, i) => account(`voter-${i}`));
  const sponsor = account('relayer');
  const manifest = { title: `Paired workload ${count}`, description: 'Synthetic public benchmark', candidates: [{ name: 'A', biography: '' }, { name: 'B', biography: '' }] };
  try {
    const start = (await chain.client.getBlock()).timestamp + 1000n;
    const measureSetup = async (operation: string, name: string, args: readonly unknown[]) => {
      const receipt = await chain.write(name, args);
      setup.push({ operation, hash: receipt.transactionHash, gasUsed: String(receipt.gasUsed), feeWei: String(receipt.gasUsed * receipt.effectiveGasPrice) });
    };
    await measureSetup('create', 'createElection', [start, start + 100000n, 2, payloadHash(manifest)]);
    await measureSetup('candidates', 'registerCandidates', [1n, manifest.candidates.map(payloadHash)]);
    for (let i = 0; i < count; i += 200) await measureSetup('authorize', 'setEligibility', [1n, voters.slice(i, i + 200).map(v => v.address), true]);
    await measureSetup('freeze', 'freeze', [1n]); await chain.time(start);
    const checkpoint = await chain.client.getBlock();
    if (mode === 'mvp1') {
      process.env.GASLESS_ENABLED = 'false';
      for (const voter of voters) await chain.rpc('hardhat_setBalance', [voter.address, '0x56BC75E2D63100000']);
    } else {
      Object.assign(process.env, { GASLESS_ENABLED: 'true', RELAYER_PRIVATE_KEY: keccak256(stringToHex('HCMUT MVP2 LOCAL SYNTHETIC ONLY relayer')), RELAYER_RATE_PER_MINUTE: '10000', RELAYER_BUDGET_WEI: '100000000000000000000' });
      await chain.rpc('hardhat_setBalance', [sponsor.address, '0x56BC75E2D63100000']);
      api = await testApi(chain, manifest);
    }
    const sponsorBefore = await chain.client.getBalance({ address: sponsor.address });
    const windowStart = performance.now();
    for (let i = 0; i < count; i++) {
      const voter = voters[i]!; const begin = performance.now();
      const before = await chain.client.getBalance({ address: voter.address });
      let receipt: TransactionReceipt; let signatureNs: string | null = null; let validationNs: string | null = null; let queueNs: string | null = null; let submissionNs: string; let confirmationNs: string;
      if (mode === 'mvp1') {
        const wallet = createWalletClient({ account: voter, transport: http(chain.url), pollingInterval: 20 });
        const sent = performance.now();
        const hash = await wallet.writeContract({ chain: null, address: chain.address, abi: votingAbi, functionName: 'vote', args: [1n, i % 2] });
        submissionNs = ns(performance.now() - sent);
        const waiting = performance.now(); receipt = await chain.client.waitForTransactionReceipt({ hash }); confirmationNs = ns(performance.now() - waiting);
      } else {
        if (before !== 0n) throw new Error('Synthetic gasless voter unexpectedly funded');
        const intent = { electionId: '1', manifestHash: payloadHash(manifest), candidateId: String(i % 2), voter: voter.address, nonce: '0', deadline: ((await chain.client.getBlock()).timestamp + 120n).toString() };
        const typed = votingTypedData(intent, 31337, chain.address); const signStart = performance.now();
        const signature = await voter.signTypedData(typed); signatureNs = ns(performance.now() - signStart);
        const response = await fetch(`${api!.url}/v1/gasless/votes`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'idempotency-key': hashTypedData(typed) }, body: JSON.stringify({ intent, signature }) });
        if (!response.ok) throw new Error('Benchmark API admission failed');
        const accepted = await response.json() as { id: string };
        const waiting = performance.now(); let status: Awaited<ReturnType<RelayerService['status']>>;
        for (;;) {
          const response = await fetch(`${api!.url}/v1/gasless/votes/${accepted.id}`);
          if (!response.ok) throw new Error('Benchmark status unavailable');
          status = await response.json() as typeof status;
          if (status.status === 'CONFIRMED') break;
          if (['FAILED', 'REJECTED'].includes(status.status) || performance.now() - waiting > 30000) throw new Error('Benchmark request failed or timed out');
          await delay(5);
        }
        confirmationNs = ns(status.confirmationMs!);
        validationNs = ns(status.validationMs); queueNs = ns(status.queueMs!); submissionNs = ns(status.submissionMs!);
        receipt = await chain.client.getTransactionReceipt({ hash: status.transactionHash as Hex });
      }
      const elapsed = performance.now() - begin;
      const chainTx = await chain.client.getTransaction({ hash: receipt.transactionHash });
      const fee = receipt.gasUsed * receipt.effectiveGasPrice;
      const after = await chain.client.getBalance({ address: voter.address });
      if (before - after !== (mode === 'mvp1' ? fee : 0n) || receipt.status !== 'success' || chainTx.from.toLowerCase() !== (mode === 'mvp1' ? voter.address : sponsor.address).toLowerCase()) throw new Error('Fee attribution mismatch');
      const row: Row = { logicalVoteId: `synthetic-${i}`, transactionHash: receipt.transactionHash, senderRole: mode === 'mvp1' ? 'voter' : 'relayer', nonce: chainTx.nonce, blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash, gasUsed: String(receipt.gasUsed), effectiveGasPrice: String(receipt.effectiveGasPrice), feeWei: String(fee), voterFeeWei: mode === 'mvp1' ? String(fee) : '0', sponsorFeeWei: mode === 'mvp2' ? String(fee) : '0', signatureNs, validationNs, queueNs, submissionNs, confirmationNs, endToEndNs: ns(elapsed), success: true };
      rows.push(row); appendFileSync(`${directory}/transaction-attempts.jsonl`, JSON.stringify(row) + '\n');
      appendFileSync(`${directory}/logical-submissions.jsonl`, JSON.stringify({ logicalVoteId: row.logicalVoteId, status: 'accepted', transactionHash: row.transactionHash, endToEndNs: row.endToEndNs }) + '\n');
    }
    const durationMs = performance.now() - windowStart;
    const events = await chain.client.getContractEvents({ address: chain.address, abi: votingAbi, eventName: 'VoteCast', args: { electionId: 1n }, fromBlock: checkpoint.number });
    const election = await chain.client.readContract({ address: chain.address, abi: votingAbi, functionName: 'getElection', args: [1n] });
    if (events.length !== count || election.totalVotes !== BigInt(count) || new Set(events.map(e => e.args.voter)).size !== count) throw new Error('Canonical accepted set mismatch');
    const feeTotal = rows.reduce((sum, row) => sum + BigInt(row.feeWei), 0n);
    if (mode === 'mvp2' && sponsorBefore - await chain.client.getBalance({ address: sponsor.address }) !== feeTotal) throw new Error('Sponsor balance mismatch');
    const lastBlock = await chain.client.getBlock();
    await chain.time(start + 100000n); await measureSetup('finalize', 'finalize', [1n]);
    const average = (key: 'endToEndNs' | 'confirmationNs' | 'signatureNs' | 'validationNs' | 'queueNs' | 'submissionNs') => rows[0]![key] === null ? null : rows.reduce((sum, row) => sum + Number(row[key]), 0) / count / 1e6;
    const gasTotal = rows.reduce((sum, row) => sum + BigInt(row.gasUsed), 0n);
    const summary = { mode, voters: count, attempted: count, accepted: count, failed: 0, pending: 0, successRate: 1, failureRate: 0, gasTotal: String(gasTotal), meanGas: Number(gasTotal) / count, feeTotalWei: String(feeTotal), voterFeeWei: mode === 'mvp1' ? String(feeTotal) : '0', relayerFeeWei: mode === 'mvp2' ? String(feeTotal) : '0', signatureMs: average('signatureNs'), validationMs: average('validationNs'), queueMs: average('queueNs'), submissionMs: average('submissionNs'), confirmationObservationMs: average('confirmationNs'), endToEndMs: average('endToEndNs'), durationMs, throughputVotesPerSecond: count * 1000 / durationMs };
    const sourceFile = `packages/contracts/contracts/${mode === 'mvp1' ? 'BasicVoting' : 'GaslessVoting'}.sol`;
    const artifact = JSON.parse(readFileSync(`packages/contracts/generated/${mode === 'mvp1' ? 'BasicVoting' : 'GaslessVoting'}.json`, 'utf8')) as { compiler: string; settings: unknown; bytecode: string; abi: unknown };
    const metadata = { schemaVersion: 2, sourceSnapshotHash: snapshotHash, runId: directory.split('/').at(-1), mode, classification: 'observed-local-EVM; simulated voter signing/network/finality; memory database', revision: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(), dirty: execFileSync('git', ['status', '--porcelain']).toString().length > 0, patchHash: sha(execFileSync('git', ['diff', 'HEAD'])), sourceHash: sha(readFileSync(sourceFile)), driverHash: sha(readFileSync('scripts/benchmark-gasless.ts')), lockfileHash: sha(readFileSync('package-lock.json')), rawHash: sha(readFileSync(`${directory}/transaction-attempts.jsonl`)), logicalHash: sha(readFileSync(`${directory}/logical-submissions.jsonl`)), startedAt, finishedAt: new Date().toISOString(), timezone: 'UTC; display Asia/Saigon', clock: 'performance.now; nanoseconds rounded from monotonic fractional milliseconds; one host', chain: { id: 31337, name: 'Hardhat automining loopback', address: chain.address, firstBlockHash: checkpoint.hash, lastBlockHash: lastBlock.hash, genesis: 'fresh Hardhat chain; wall-clock genesis timestamp', finality: 'one local inclusion', l1Settlement: 'not_applicable' }, build: { node: process.version, npm: '11.19.0', ...artifact, container: 'not_applicable Windows host' }, hardware: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, memoryBytes: os.totalmem(), browser: 'not_applicable Node simulated signing', network: 'loopback', limits: 'uncontrolled workstation' }, workload: { voters: count, candidates: 2, seed: 'public deterministic development-only label derivation in driver', concurrency: 1, arrivals: 'next after confirmation', repeats: 1, warmup: 'none', retry: 'same persisted raw transaction only', authorizationBatch: 200, timeoutMs: 30000, manifest, scenarioHash: sha(JSON.stringify({ count, manifest })) }, crypto: 'not_applicable: no ZK/encryption', database: 'explicit in-memory test double; Supabase latency/durability NOT measured', unmeasured: ['human MetaMask latency', 'public-network finality', 'relayer compute/storage monetary costs'], analysis: 'single observed run; arithmetic means, no confidence intervals; confirmationObservationMs starts after transaction broadcast acknowledgement; MVP2 uses server Date millisecond timestamps and includes receipt polling, MVP1 uses driver performance.now; not public-chain finality', exclusions: 'deployment/funding excluded; setup/finalize separately recorded', summary, setup };
    writeFileSync(`${directory}/manifest.json`, JSON.stringify(metadata, null, 2) + '\n');
    writeFileSync(`${directory}/contract.sol`, readFileSync(sourceFile));
    console.log(JSON.stringify(summary)); return summary;
  } catch (error) { writeFileSync(`${directory}/incomplete.json`, JSON.stringify({ completedVotes: rows.length, attemptedVoters: count, status: 'incomplete', reason: 'benchmark driver failed; completed raw attempts retained' }) + '\n'); throw error; }
  finally { await api?.app.close(); chain.stop(); delete process.env.RELAYER_PRIVATE_KEY; }
}

async function main() {
  const parent = `benchmarks/results/mvp2-paired-${randomUUID()}`; mkdirSync(parent, { recursive: true });
  writeFileSync(`${parent}/benchmark-driver.ts`, readFileSync('scripts/benchmark-gasless.ts'));
  const paths = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', 'services/api/src', 'services/api/prisma', 'packages/contracts/contracts', 'packages/contracts/src', 'packages/shared-types/src', 'tests/helpers', 'scripts/benchmark-gasless.ts', 'package.json', 'package-lock.json', 'hardhat.config.ts', 'tsconfig.base.json']).toString().trim().split(/\r?\n/).sort();
  const hashes: Record<string, string> = {};
  for (const path of paths) {
    const bytes = readFileSync(path); hashes[path] = sha(bytes);
    const target = `${parent}/source-snapshot/${path}`; mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, bytes);
  }
  const snapshot = JSON.stringify(hashes, null, 2) + '\n'; snapshotHash = sha(snapshot);
  writeFileSync(`${parent}/source-hashes.json`, snapshot);
  const comparison = [];
  for (const size of [10, 100, 1000]) {
    const baseline = await run('mvp1', size, parent); const gasless = await run('mvp2', size, parent);
    comparison.push({ size, baseline, gasless, difference: { meanGas: gasless.meanGas - baseline.meanGas, feeTotalWei: String(BigInt(gasless.feeTotalWei) - BigInt(baseline.feeTotalWei)), endToEndMs: gasless.endToEndMs! - baseline.endToEndMs!, throughputVotesPerSecond: gasless.throughputVotesPerSecond - baseline.throughputVotesPerSecond } });
  }
  writeFileSync(`${parent}/comparison.json`, JSON.stringify(comparison, null, 2) + '\n');
  console.log(`Paired benchmark artifacts: ${parent}`);
}
main().catch(() => { console.error('Paired benchmark failed; no completion claim. Inspect incomplete markers and retained raw rows.'); process.exitCode = 1; });

import 'dotenv/config';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import type { Prisma } from '@prisma/client';
import { createWalletClient, http, type TransactionReceipt } from 'viem';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import { votingAbi } from '../packages/contracts/src/abi.js';
import { payloadHash } from '../packages/shared-types/src/index.js';
import { localChain } from '../tests/helpers/chain.js';

type Measurement = { operation: string; logicalVoteId: string | null; transactionHash: string; blockHash: string; blockNumber: string; gasUsed: string; effectiveGasPrice: string; feeWei: string; confirmationNs: string; confirmationMs: number; success: boolean };
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
async function benchmark() {
  const chain = await localChain(18547);
  let revision: string | null = null;
  try { revision = execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* Unborn repository: exploratory only. */ }
  try {
    for (const voterCount of [10, 100, 1000]) {
      const startedAt = new Date().toISOString();
      const runId = `mvp1-${voterCount}-${randomUUID()}`;
      const directory = `benchmarks/results/${runId}`;
      mkdirSync(directory, { recursive: true });
      const rows: Measurement[] = [];
      const collect = (operation: string, start: number, receipt: TransactionReceipt, logicalVoteId: string | null = null) => {
        const confirmationNs = Math.round((performance.now() - start) * 1e6);
        rows.push({ operation, logicalVoteId, transactionHash: receipt.transactionHash, blockHash: receipt.blockHash, blockNumber: receipt.blockNumber.toString(), gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), feeWei: (receipt.gasUsed * receipt.effectiveGasPrice).toString(), confirmationNs: String(confirmationNs), confirmationMs: confirmationNs / 1e6, success: receipt.status === 'success' });
        if (receipt.status !== 'success') throw new Error('Unexpected benchmark transaction revert');
      };
      const measure = async (operation: string, functionName: string, args: readonly unknown[]) => {
        const start = performance.now();
        collect(operation, start, await chain.write(functionName, args));
      };
      const manifest = { title: `Synthetic workload ${voterCount}`, description: 'Public local baseline', candidates: [{ name: 'A', biography: '' }, { name: 'B', biography: '' }] };
      const accounts = Array.from({ length: voterCount }, () => privateKeyToAccount(generatePrivateKey()));
      for (const account of accounts) await chain.rpc('hardhat_setBalance', [account.address, '0x56BC75E2D63100000']);
      const firstBlock = await chain.client.getBlock();
      const startTime = firstBlock.timestamp + 1000n;
      await measure('create', 'createElection', [startTime, startTime + 100000n, 2, payloadHash(manifest)]);
      const electionId = await chain.client.readContract({ address: chain.address, abi: votingAbi, functionName: 'electionCount' });
      await measure('candidates', 'registerCandidates', [electionId, manifest.candidates.map(payloadHash)]);
      for (let i = 0; i < accounts.length; i += 200) await measure('authorize', 'setEligibility', [electionId, accounts.slice(i, i + 200).map(a => a.address), true]);
      await measure('freeze', 'freeze', [electionId]);
      await chain.time(startTime);
      const windowStart = performance.now();
      // Sequential arrivals isolate baseline client/RPC latency. No throughput capacity claim.
      for (let index = 0; index < accounts.length; index++) {
        const account = accounts[index]!;
        const wallet = createWalletClient({ account, transport: http(chain.url), pollingInterval: 20 });
        const start = performance.now();
        const hash = await wallet.writeContract({ chain: null, address: chain.address, abi: votingAbi, functionName: 'vote', args: [electionId, index % 2] });
        collect('vote', start, await chain.client.waitForTransactionReceipt({ hash }), `synthetic-${index}`);
      }
      const durationMs = performance.now() - windowStart;
      const totalVotes = (await chain.client.readContract({ address: chain.address, abi: votingAbi, functionName: 'getElection', args: [electionId] })).totalVotes;
      const events = await chain.client.getContractEvents({ address: chain.address, abi: votingAbi, eventName: 'VoteCast', args: { electionId }, fromBlock: firstBlock.number! });
      if (totalVotes !== BigInt(voterCount) || events.length !== voterCount) throw new Error('Receipt/event/state reconciliation failed');
      await chain.time(startTime + 100000n);
      await measure('finalize', 'finalize', [electionId]);
      const lastBlock = await chain.client.getBlock();
      const votes = rows.filter(row => row.operation === 'vote');
      const latencies = votes.map(row => row.confirmationMs).sort((a, b) => a - b);
      const gas = votes.map(row => BigInt(row.gasUsed));
      const summary = { voterCount, attempted: voterCount, accepted: Number(totalVotes), failed: 0, pending: 0, failureRate: 0, durationMs, throughputVotesPerSecond: voterCount / (durationMs / 1000), p50InclusionMs: latencies[Math.ceil(latencies.length * 0.50) - 1], p95InclusionMs: latencies[Math.ceil(latencies.length * 0.95) - 1], voteGasMin: gas.reduce((a, b) => a < b ? a : b).toString(), voteGasMax: gas.reduce((a, b) => a > b ? a : b).toString(), voteGasTotal: gas.reduce((a, b) => a + b, 0n).toString(), allOperationsGas: rows.reduce((a, row) => a + BigInt(row.gasUsed), 0n).toString(), allOperationsFeeWei: rows.reduce((a, row) => a + BigInt(row.feeWei), 0n).toString() };
      const raw = rows.map(row => JSON.stringify(row)).join('\n') + '\n';
      const logical = votes.map(row => JSON.stringify({ logicalVoteId: row.logicalVoteId, status: 'accepted', transactionHash: row.transactionHash, blockHash: row.blockHash, elapsedMs: row.confirmationMs })).join('\n') + '\n';
      const artifact = JSON.parse(readFileSync('packages/contracts/generated/BasicVoting.json', 'utf8')) as { compiler: string; settings: Prisma.InputJsonValue; bytecode: string };
      const metadata = {
        schemaVersion: 1, runId, milestone: 'MVP 1', protocol: 'public-wallet-v1', classification: 'observed-local-EVM; simulated network and finality', reproducibility: revision ? 'working-tree snapshot' : 'exploratory: repository has no commit', revision,
        sourceHash: sha(readFileSync('packages/contracts/contracts/BasicVoting.sol')), driverHash: sha(readFileSync('scripts/benchmark.ts')), lockfileHash: sha(readFileSync('package-lock.json')), rawHash: sha(raw), logicalHash: sha(logical),
        startedAt, finishedAt: new Date().toISOString(), timezone: 'UTC', clock: 'performance.now monotonic milliseconds, fractional resolution; single driver, no distributed clock synchronization',
        chain: { chainId: 31337, network: 'Hardhat local automining', address: chain.address, electionId: electionId.toString(), firstBlockHash: firstBlock.hash, lastBlockHash: lastBlock.hash, finality: 'one local inclusion; no public-network finality', providerRegion: 'same host', l1Settlement: 'not_applicable' },
        build: { node: process.version, npm: '11.19.0', compiler: artifact.compiler, settings: artifact.settings, bytecodeHash: sha(artifact.bytecode), container: 'not_applicable: Windows host' },
        hardware: { platform: os.platform(), release: os.release(), cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, memoryBytes: os.totalmem(), browser: 'not_applicable: Node driver', network: 'loopback', resourceLimits: 'uncontrolled workstation' },
        workload: { manifest, eligibleVoters: voterCount, choices: 'alternating 0/1', accounts: 'fresh ephemeral keys; never persisted', concurrency: 1, arrival: 'next after receipt', warmup: 'none', repeats: 1, authorizationBatch: 200, fees: 'local RPC estimate', retry: 'no logical vote retries', timeoutMs: 180000, seed: 'not_applicable: fixed choices, random ephemeral addresses' },
        crypto: 'not_applicable before MVP 3', analysis: 'nearest-rank percentiles; no confidence interval from one run', exclusions: 'deployment and funding excluded; setup and finalize separately recorded', database: process.env.DATABASE_URL ? 'configured: persistence attempted separately' : 'not configured; local raw artifacts only', summary,
      };
      writeFileSync(`${directory}/transaction-attempts.jsonl`, raw);
      writeFileSync(`${directory}/logical-submissions.jsonl`, logical);
      writeFileSync(`${directory}/manifest.json`, JSON.stringify(metadata, null, 2) + '\n');
      writeFileSync(`${directory}/BasicVoting.sol`, readFileSync('packages/contracts/contracts/BasicVoting.sol'));
      writeFileSync(`${directory}/benchmark-driver.ts`, readFileSync('scripts/benchmark.ts'));
      if (process.env.DATABASE_URL) {
        const { DatabaseService } = await import('../services/api/src/database.js');
        const db = new DatabaseService();
        try { await db.$connect(); await db.benchmarkRun.create({ data: { id: runId, manifest: metadata, summary, measurements: { create: rows.map(row => ({ operation: row.operation, transactionHash: row.transactionHash, gasUsed: row.gasUsed, effectiveGasPrice: row.effectiveGasPrice, confirmationMs: row.confirmationMs, success: row.success })) } } }); }
        finally { await db.$disconnect(); }
      }
      console.log(JSON.stringify({ runId, ...summary }));
    }
  } finally { chain.stop(); }
}
benchmark().catch(() => { console.error('Benchmark failed; inspect retained completed raw artifacts. No incomplete run is reported as successful.'); process.exitCode = 1; });

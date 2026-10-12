import { Inject, Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { GaslessVoteRequest, Prisma, RelayerTransaction } from '@prisma/client';
import { decodeEventLog, keccak256, TransactionReceiptNotFoundError, type Address, type Hex } from 'viem';
import { gaslessAbi } from '../../../../packages/contracts/src/gasless-abi.js';
import { gaslessRequestSchema, type GaslessStatus, type VotingIntent } from '../../../../packages/shared-types/src/gasless.js';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { IntentAuthorization } from './authorization.js';
import { TransactionSender } from './sender.js';
import { relayerConfig } from './config.js';
import { RelayError } from './errors.js';

type Tx = Prisma.TransactionClient;
type StoredRequest = GaslessVoteRequest & { transaction: RelayerTransaction | null };
const active = ['SUBMITTED', 'PENDING'];
function intentOf(row: GaslessVoteRequest): VotingIntent {
  return { electionId: row.electionId, candidateId: row.candidateId, voter: row.voterAddress as Address, manifestHash: row.manifestHash as Hex, nonce: row.nonce, deadline: row.deadline };
}
const transitions: Record<GaslessStatus, GaslessStatus[]> = {
  QUEUED: ['SUBMITTED', 'REJECTED'], SUBMITTED: ['PENDING', 'CONFIRMED', 'FAILED'],
  PENDING: ['PENDING', 'CONFIRMED', 'FAILED'], CONFIRMED: ['PENDING'], FAILED: ['PENDING'], REJECTED: [],
};

@Injectable()
export class RelayerService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running: Promise<void> | undefined;
  private readonly rates = new Map<string, { count: number; until: number }>();
  constructor(@Inject(DatabaseService) readonly db: DatabaseService, @Inject(ChainService) readonly chain: ChainService,
    @Inject(IntentAuthorization) readonly authorization: IntentAuthorization, @Inject(TransactionSender) readonly sender: TransactionSender) {}
  onModuleInit() {
    if (relayerConfig().enabled) { this.timer = setInterval(() => this.kick(), 1000); this.timer.unref(); this.kick(); }
  }
  async onModuleDestroy() { clearInterval(this.timer); await this.running; }
  private enabled() { if (!relayerConfig().enabled) throw new RelayError('GASLESS_DISABLED', 503); }
  scope() { return { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address }; }
  private lane() { return `${this.chain.config.CHAIN_ID}:${this.sender.address()}`; }
  // No IP is retained or logged. The global bucket also bounds invalid-signature work.
  rate(key = 'global') {
    const now = Date.now();
    for (const [k, entry] of this.rates) if (entry.until <= now) this.rates.delete(k);
    const entry = this.rates.get(key) ?? { count: 0, until: now + 60000 };
    const limit = key === 'global' ? relayerConfig().ratePerMinute : relayerConfig().voterAttempts;
    if (entry.count >= limit || this.rates.size >= 10000) throw new RelayError('RATE_LIMITED', 429);
    entry.count++; this.rates.set(key, entry);
  }
  private async locked<T>(work: (tx: Tx) => Promise<T>) {
    const lane = this.lane();
    return this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lane})::bigint)`;
      return work(tx);
    }, { timeout: 60000, maxWait: 5000 });
  }
  async submit(body: unknown, idempotencyKey?: string) {
    this.enabled(); this.rate();
    const start = performance.now();
    const { intent, signature } = gaslessRequestSchema.parse(body);
    const intentHash = await this.authorization.signature(intent, signature);
    if (idempotencyKey !== intentHash) throw new RelayError('IDEMPOTENCY_KEY_MISMATCH');
    const existing = await this.db.gaslessVoteRequest.findUnique({ where: { intentHash }, include: { transaction: true } });
    if (existing) return this.publicStatus(existing);
    this.rate(`${intent.electionId}:${intent.voter}`);
    await this.authorization.validate(intent, signature);
    const validationMs = performance.now() - start;
    const row = await this.locked(async tx => {
      const duplicate = await tx.gaslessVoteRequest.findUnique({ where: { intentHash }, include: { transaction: true } });
      if (duplicate) return duplicate;
      const scope = this.scope();
      const activeSlot = `${scope.chainId}:${scope.contractAddress}:${intent.electionId}:${intent.voter}:${intent.nonce}`;
      if (await tx.gaslessVoteRequest.findUnique({ where: { activeSlot } })) throw new RelayError('VOTE_REQUEST_EXISTS', 409);
      if (await tx.gaslessVoteRequest.count({ where: { ...scope, electionId: intent.electionId, voterAddress: intent.voter } }) >= relayerConfig().voterAttempts) throw new RelayError('SPONSORSHIP_ATTEMPTS_EXCEEDED', 429);
      if (await tx.gaslessVoteRequest.count({ where: { ...scope, status: { in: ['QUEUED', ...active] } } }) >= relayerConfig().queueLimit) throw new RelayError('QUEUE_FULL', 429);
      return tx.gaslessVoteRequest.create({ data: { ...scope, electionId: intent.electionId, candidateId: intent.candidateId, voterAddress: intent.voter, manifestHash: intent.manifestHash, nonce: intent.nonce, deadline: intent.deadline, intentHash, activeSlot, signature, status: 'QUEUED', validationMs, history: { create: { status: 'QUEUED' } } }, include: { transaction: true } });
    });
    this.kick();
    return this.publicStatus(row);
  }
  private async transition(tx: Tx, row: GaslessVoteRequest, status: GaslessStatus, errorCode: string | null = null) {
    if (!transitions[row.status as GaslessStatus]?.includes(status)) throw new Error('Invalid relayer state transition');
    const terminal = ['CONFIRMED', 'FAILED', 'REJECTED'].includes(status);
    await tx.gaslessVoteRequest.update({ where: { id: row.id }, data: {
      status, errorCode, confirmedAt: status === 'CONFIRMED' ? new Date() : null,
      ...(terminal ? { signature: null } : {}), ...(status === 'REJECTED' || status === 'FAILED' ? { activeSlot: null } : {}),
      history: { create: { status, errorCode } },
    } });
  }
  private async reconcile(tx: Tx, row: StoredRequest): Promise<boolean> {
    const transaction = row.transaction!;
    await this.chain.verifyNetwork();
    let receipt;
    try { receipt = await this.chain.client.getTransactionReceipt({ hash: transaction.transactionHash as Hex }); }
    catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
    if (receipt) {
      const block = await this.chain.client.getBlock({ blockNumber: receipt.blockNumber });
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      if (block.hash !== receipt.blockHash || head < receipt.blockNumber + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) {
        await this.pending(tx, row, 'AWAITING_CONFIRMATIONS'); return false;
      }
      const chainTx = await this.chain.client.getTransaction({ hash: receipt.transactionHash });
      const exact = chainTx.from.toLowerCase() === transaction.relayerAddress && chainTx.to?.toLowerCase() === transaction.contractAddress && keccak256(chainTx.input) === transaction.calldataHash;
      const accepted = receipt.logs.some(log => {
        if (log.address.toLowerCase() !== transaction.contractAddress) return false;
        try {
          const event = decodeEventLog({ abi: gaslessAbi, ...log });
          return event.eventName === 'VoteCast' && event.args.electionId === BigInt(row.electionId) && event.args.voter.toLowerCase() === row.voterAddress && event.args.candidateId === Number(row.candidateId);
        } catch { return false; }
      });
      if ((await this.chain.client.getBlock({ blockNumber: receipt.blockNumber })).hash !== receipt.blockHash) { await this.pending(tx, row, 'REORG_DETECTED'); return false; }
      const status = exact && accepted && receipt.status === 'success' ? 'CONFIRMED' : 'FAILED';
      if (row.status !== status) {
        await this.transition(tx, row, status, status === 'FAILED' ? 'TRANSACTION_REVERTED_OR_MISMATCH' : null);
        await tx.relayerTransaction.update({ where: { id: transaction.id }, data: { status, rawTransaction: null, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString(), transactionFee: (receipt.gasUsed * receipt.effectiveGasPrice).toString(), confirmedAt: new Date() } });
      }
      return true;
    }
    if (['CONFIRMED', 'FAILED'].includes(row.status)) { await this.pending(tx, row, 'REORG_DETECTED'); return false; }
    const nonce = await this.chain.client.getTransactionCount({ address: transaction.relayerAddress as Address, blockTag: 'latest' });
    if (nonce > transaction.nonce) { await this.pending(tx, row, 'NONCE_CONSUMED_RECEIPT_UNKNOWN'); return false; }
    const age = Date.now() - transaction.createdAt.getTime();
    const block = await this.chain.client.getBlock();
    if (!transaction.rawTransaction || block.timestamp > BigInt(row.deadline)) { await this.pending(tx, row, 'OPERATOR_RECONCILIATION_REQUIRED'); return false; }
    if (keccak256(transaction.rawTransaction as Hex) !== transaction.transactionHash) { await this.pending(tx, row, 'STORED_TRANSACTION_MISMATCH'); return false; }
    // Re-send only the already persisted signed bytes, with no fee/nonce mutation.
    const started = performance.now();
    try { await this.sender.broadcast(transaction.rawTransaction as Hex); }
    catch { await this.pending(tx, row, 'BROADCAST_UNCERTAIN'); return false; }
    await tx.relayerTransaction.update({ where: { id: transaction.id }, data: { submittedAt: transaction.submittedAt ?? new Date(), submissionMs: transaction.submissionMs ?? performance.now() - started } });
    await this.pending(tx, row, age > relayerConfig().pendingTimeoutMs ? 'PENDING_TIMEOUT' : null);
    return false;
  }
  private async pending(tx: Tx, row: StoredRequest, errorCode: string | null) {
    if (row.status !== 'PENDING' || row.errorCode !== errorCode) await this.transition(tx, row, 'PENDING', errorCode);
    await tx.relayerTransaction.update({ where: { requestId: row.id }, data: { status: 'PENDING', confirmedAt: null, blockNumber: null, blockHash: null, gasUsed: null, effectiveGasPrice: null, transactionFee: null } });
  }
  private async step(): Promise<boolean> {
    return this.locked(async tx => {
      const scope = this.scope();
      const relayerAddress = this.sender.address();
      const budget = await tx.relayerBudget.upsert({ where: { id: this.lane() }, create: { id: this.lane(), contractAddress: scope.contractAddress }, update: {} });
      if (budget.contractAddress !== scope.contractAddress) throw new RelayError('RELAYER_BOUND_TO_OTHER_CONTRACT', 503);
      const pending = await tx.relayerTransaction.findFirst({ where: { chainId: scope.chainId, relayerAddress, status: { in: active } }, include: { request: true }, orderBy: { createdAt: 'asc' } });
      if (pending) return this.reconcile(tx, { ...pending.request, transaction: pending });
      const row = await tx.gaslessVoteRequest.findFirst({ where: { ...scope, status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
      if (!row) return false;
      const queueMs = Date.now() - row.createdAt.getTime();
      let prepared;
      try {
        await this.authorization.validate(intentOf(row), row.signature as Hex);
        prepared = await this.sender.prepare(intentOf(row), row.signature as Hex);
        if (BigInt(budget.reservedWei.toString()) + BigInt(prepared.reservedFeeWei) > BigInt(relayerConfig().budgetWei)) throw new RelayError('SPONSORSHIP_BUDGET_EXCEEDED');
      } catch (error) {
        // Unknown RPC/database failures keep the durable queue intact for later reconciliation.
        if (!(error instanceof RelayError)) throw error;
        await this.transition(tx, row, 'REJECTED', error.code); return true;
      }
      await tx.relayerBudget.update({ where: { id: this.lane() }, data: { reservedWei: { increment: prepared.reservedFeeWei } } });
      await tx.relayerTransaction.create({ data: { ...scope, ...prepared, relayerAddress, requestId: row.id, status: 'SUBMITTED', queueMs } });
      await this.transition(tx, row, 'SUBMITTED');
      return true;
    });
  }
  kick() { void this.pump().catch(() => { /* No bodies, signatures, keys, or provider errors in telemetry. Durable state is retried. */ }); }
  async pump() {
    if (!relayerConfig().enabled) return;
    if (this.running) return this.running;
    this.running = (async () => { for (let i = 0; i < 16; i++) if (!await this.step()) break; })();
    try { await this.running; } finally { this.running = undefined; }
  }
  async status(id: string) {
    this.enabled();
    const row = await this.locked(async tx => {
      const current = await tx.gaslessVoteRequest.findUnique({ where: { id }, include: { transaction: true } });
      if (!current || current.chainId !== this.scope().chainId || current.contractAddress !== this.chain.address) throw new RelayError('REQUEST_NOT_FOUND', 404);
      if (current.transaction) await this.reconcile(tx, current);
      return (await tx.gaslessVoteRequest.findUniqueOrThrow({ where: { id }, include: { transaction: true } }));
    });
    this.kick(); return this.publicStatus(row);
  }
  async byIntent(intentHash: string) {
    this.enabled();
    const row = await this.db.gaslessVoteRequest.findUnique({ where: { intentHash } });
    if (!row) throw new RelayError('REQUEST_NOT_FOUND', 404);
    return this.status(row.id);
  }
  private publicStatus(row: StoredRequest) {
    const t = row.transaction;
    return { id: row.id, status: row.status, errorCode: row.errorCode, electionId: row.electionId,
      chainId: row.chainId, contractAddress: row.contractAddress, transactionHash: t?.transactionHash ?? null,
      blockNumber: t?.blockNumber?.toString() ?? null, blockHash: t?.blockHash ?? null,
      gasUsed: t?.gasUsed ?? null, effectiveGasPrice: t?.effectiveGasPrice ?? null, transactionFee: t?.transactionFee ?? null,
      relayerAddress: t?.relayerAddress ?? null, confirmations: this.chain.config.CHAIN_CONFIRMATIONS,
      validationMs: row.validationMs, queueMs: t?.queueMs ?? null, submissionMs: t?.submissionMs ?? null,
      confirmationMs: t?.confirmedAt && t.submittedAt ? t.confirmedAt.getTime() - t.submittedAt.getTime() : null,
      confirmedAt: row.confirmedAt?.toISOString() ?? null };
  }
}

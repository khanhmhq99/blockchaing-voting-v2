import { createWalletClient, decodeEventLog, encodeFunctionData, encodePacked, http, keccak256, parseTransaction, recoverTransactionAddress, TransactionReceiptNotFoundError, type Address, type Hex, type TransactionSerialized } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { z } from 'zod';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { MACI_SNARK_FIELD } from '../../../../packages/shared-types/src/maci.js';

const field = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(value => BigInt(value) < MACI_SNARK_FIELD);
const encryptedMessageSchema = z.object({
  data: z.array(field).length(10),
  encryptionPublicKey: z.object({ x: field, y: field }).strict(),
}).strict();
const pollAbi = [
  { type: 'function', name: 'publishMessage', stateMutability: 'nonpayable', inputs: [
    { name: '_message', type: 'tuple', components: [{ name: 'data', type: 'uint256[10]' }] },
    { name: '_encryptionPublicKey', type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] },
  ], outputs: [] },
  { type: 'event', name: 'PublishMessage', inputs: [
    { name: '_message', type: 'tuple', indexed: false, components: [{ name: 'data', type: 'uint256[10]' }] },
    { name: '_encryptionPublicKey', type: 'tuple', indexed: false, components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] },
  ] },
] as const;

function sponsorAccount() {
  const key = process.env.MACI_RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new ServiceUnavailableException({ code: 'MACI_RELAYER_UNCONFIGURED', message: 'MACI relayer is unavailable.' });
  if (key.toLowerCase() === process.env.MACI_ISSUER_PRIVATE_KEY?.toLowerCase() || key.toLowerCase() === process.env.DEPLOYER_PRIVATE_KEY?.toLowerCase() || key.toLowerCase() === process.env.RELAYER_PRIVATE_KEY?.toLowerCase()) throw new ServiceUnavailableException({ code: 'MACI_RELAYER_KEY_REUSE', message: 'MACI relayer key must be separate.' });
  return privateKeyToAccount(key as Hex);
}

@Injectable()
export class MaciRelayService {
  private readonly rates = new Map<string, { count: number; until: number }>();
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService) {}

  private rate() {
    const now = Date.now();
    const key = 'global';
    const entry = this.rates.get(key) ?? { count: 0, until: now + 60_000 };
    if (entry.until <= now) { entry.count = 0; entry.until = now + 60_000; }
    if (entry.count >= 60) throw new HttpException({ code: 'MACI_RATE_LIMITED', message: 'MACI relay is busy.' }, 429);
    entry.count += 1;
    this.rates.set(key, entry);
  }

  private async network() {
    if (await this.chain.client.getChainId() !== this.chain.config.CHAIN_ID) throw new ServiceUnavailableException({ code: 'MACI_CHAIN_MISMATCH', message: 'MACI RPC chain changed.' });
  }

  private publicStatus(row: { id: string; status: string; transactionHash: string | null; errorCode: string | null }) {
    return { id: row.id, status: row.status, transactionHash: row.transactionHash, errorCode: row.errorCode, counted: false };
  }

  async submit(electionId: string, body: unknown, idempotencyKey: string | undefined, cookie: string | undefined) {
    if (cookie) throw new ForbiddenException({ code: 'MACI_IDENTITY_COOKIE_FORBIDDEN', message: 'Submit encrypted commands without an identity session.' });
    this.rate();
    const parsed = encryptedMessageSchema.parse(body);
    const election = await this.db.maciElection.findUnique({ where: { id: z.uuid().parse(electionId) } });
    if (!election || election.status !== 'OPEN') throw new ConflictException({ code: 'MACI_POLL_NOT_OPEN', message: 'MACI poll is not open.' });
    await this.network();
    if (election.chainId !== String(this.chain.config.CHAIN_ID)) throw new ConflictException({ code: 'MACI_CHAIN_MISMATCH', message: 'MACI election uses another chain.' });
    const pollAddress = election.pollAddress as Address;
    const message = { data: parsed.data.map(value => BigInt(value)) as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] };
    const encryptionPublicKey = { x: BigInt(parsed.encryptionPublicKey.x), y: BigInt(parsed.encryptionPublicKey.y) };
    const calldata = encodeFunctionData({ abi: pollAbi, functionName: 'publishMessage', args: [message, encryptionPublicKey] });
    const digest = keccak256(encodePacked(['uint256', 'address', 'bytes32'], [BigInt(election.chainId), pollAddress, keccak256(calldata)]));
    if (idempotencyKey !== digest) throw new ConflictException({ code: 'MACI_IDEMPOTENCY_MISMATCH', message: 'Idempotency key does not match the encrypted command.' });
    const prior = await this.db.maciEncryptedSubmission.findUnique({ where: { messageDigest: digest } });
    if (prior) return this.publicStatus(await this.reconcile(prior.id));
    const account = sponsorAccount();
    const lane = `${election.chainId}:${account.address.toLowerCase()}`;
    const prepared = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lane})::bigint)`;
      const duplicate = await tx.maciEncryptedSubmission.findUnique({ where: { messageDigest: digest } });
      if (duplicate) return duplicate;
      const active = await tx.maciEncryptedSubmission.findFirst({ where: { chainId: election.chainId, status: { in: ['PREPARED', 'PENDING'] } } });
      if (active) throw new HttpException({ code: 'MACI_RELAY_BUSY', message: 'Another MACI transaction is pending.' }, 429);
      const nonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'pending' });
      const latestNonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' });
      if (nonce !== latestNonce) throw new ServiceUnavailableException({ code: 'MACI_EXTERNAL_PENDING', message: 'Relayer nonce is pending.' });
      const estimate = await this.chain.client.estimateGas({ account, to: pollAddress, data: calldata });
      const gas = (estimate * 120n + 99n) / 100n;
      const maxGas = BigInt(process.env.MACI_RELAYER_MAX_GAS ?? '500000');
      const gasPrice = await this.chain.client.getGasPrice();
      const maxGasPrice = BigInt(process.env.MACI_RELAYER_MAX_GAS_PRICE_WEI ?? '10000000000');
      if (gas > maxGas || gasPrice > maxGasPrice) throw new ServiceUnavailableException({ code: 'MACI_GAS_LIMIT', message: 'MACI gas cap was reached.' });
      const balance = await this.chain.client.getBalance({ address: account.address });
      if (balance < gas * gasPrice) throw new ServiceUnavailableException({ code: 'MACI_BALANCE_LOW', message: 'MACI relayer lacks test funds.' });
      const raw = await account.signTransaction({ chainId: this.chain.config.CHAIN_ID, type: 'legacy', to: pollAddress, data: calldata, gas, gasPrice, nonce, value: 0n });
      return tx.maciEncryptedSubmission.create({ data: {
        chainId: election.chainId, pollAddress: election.pollAddress, messageDigest: digest,
        messageData: parsed.data, encryptionKeyX: parsed.encryptionPublicKey.x, encryptionKeyY: parsed.encryptionPublicKey.y,
        status: 'PREPARED', transactionHash: keccak256(raw), rawTransaction: raw, calldataHash: keccak256(calldata), nonce,
      } });
    }, { timeout: 60_000, maxWait: 5_000 });
    return this.publicStatus(await this.reconcile(prepared.id));
  }

  async status(id: string) {
    return this.publicStatus(await this.reconcile(z.uuid().parse(id)));
  }

  private async reconcile(id: string) {
    const row = await this.db.maciEncryptedSubmission.findUnique({ where: { id } });
    if (!row) throw new ConflictException({ code: 'MACI_SUBMISSION_MISSING', message: 'Encrypted submission was not found.' });
    if (!row.transactionHash || !row.rawTransaction || !row.calldataHash || row.nonce === null) return row;
    await this.network();
    const account = sponsorAccount();
    const raw = row.rawTransaction as Hex;
    const parsed = parseTransaction(raw);
    const sender = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
    if (sender.toLowerCase() !== account.address.toLowerCase() || parsed.chainId !== this.chain.config.CHAIN_ID || parsed.to?.toLowerCase() !== row.pollAddress || !parsed.data || keccak256(parsed.data) !== row.calldataHash || keccak256(raw) !== row.transactionHash) {
      throw new ServiceUnavailableException({ code: 'MACI_STORED_TX_MISMATCH', message: 'Stored MACI transaction failed integrity validation.' });
    }
    let receipt;
    try { receipt = await this.chain.client.getTransactionReceipt({ hash: row.transactionHash as Hex }); } catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
    if (receipt) {
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      const block = await this.chain.client.getBlock({ blockNumber: receipt.blockNumber });
      if (block.hash !== receipt.blockHash || head < receipt.blockNumber + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) {
        return this.db.maciEncryptedSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: 'AWAITING_CONFIRMATIONS' } });
      }
      const transaction = await this.chain.client.getTransaction({ hash: receipt.transactionHash });
      const matching = receipt.logs.some(log => {
        if (log.address.toLowerCase() !== row.pollAddress) return false;
        try {
          const event = decodeEventLog({ abi: pollAbi, data: log.data, topics: log.topics });
          const serialized = event.args._message.data.map(value => value.toString());
          return JSON.stringify(serialized) === JSON.stringify(row.messageData) && event.args._encryptionPublicKey.x.toString() === row.encryptionKeyX && event.args._encryptionPublicKey.y.toString() === row.encryptionKeyY;
        } catch { return false; }
      });
      const exact = transaction.from.toLowerCase() === account.address.toLowerCase() && transaction.to?.toLowerCase() === row.pollAddress && keccak256(transaction.input) === row.calldataHash;
      const status = receipt.status === 'success' && matching && exact ? 'INCLUDED' : 'FAILED';
      return this.db.maciEncryptedSubmission.update({ where: { id }, data: { status, errorCode: status === 'FAILED' ? 'MACI_TX_FAILED' : null, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString() } });
    }
    const latestNonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' });
    if (latestNonce > row.nonce) return this.db.maciEncryptedSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: 'MACI_NONCE_CONSUMED' } });
    try {
      await createWalletClient({ transport: http(this.chain.config.RPC_URL, { timeout: 10_000, retryCount: 0 }) }).sendRawTransaction({ serializedTransaction: raw });
      return this.db.maciEncryptedSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: null } });
    } catch {
      return this.db.maciEncryptedSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: 'MACI_BROADCAST_UNCERTAIN' } });
    }
  }
}

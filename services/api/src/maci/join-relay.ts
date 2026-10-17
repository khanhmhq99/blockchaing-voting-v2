import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createWalletClient, decodeEventLog, encodeFunctionData, encodePacked, http, keccak256, parseTransaction, recoverTransactionAddress, TransactionReceiptNotFoundError, type Address, type Hex, type TransactionSerialized } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { BN254_BASE_FIELD, MACI_SNARK_FIELD } from '../../../../packages/shared-types/src/maci.js';

const field = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(value => BigInt(value) < MACI_SNARK_FIELD);
const proofCoordinate = z.string().regex(/^(0|[1-9][0-9]*)$/).refine(value => BigInt(value) < BN254_BASE_FIELD);
const inputSchema = z.object({
  nullifier: field,
  publicKey: z.object({ x: field, y: field }).strict(),
  stateRootIndex: z.string().regex(/^(0|[1-9][0-9]*)$/),
  proof: z.array(proofCoordinate).length(8),
}).strict();
const keyType = { name: '_publicKey', type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] } as const;
const pollAbi = [
  { type: 'function', name: 'verifyJoiningPollProof', stateMutability: 'view', inputs: [
    { name: '_nullifier', type: 'uint256' }, { name: '_index', type: 'uint256' }, keyType, { name: '_proof', type: 'uint256[8]' },
  ], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'pollNullifiers', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'bool' }] },
  { type: 'function', name: 'joinPoll', stateMutability: 'nonpayable', inputs: [
    { name: '_nullifier', type: 'uint256' }, keyType, { name: '_stateRootIndex', type: 'uint256' },
    { name: '_proof', type: 'uint256[8]' }, { name: '_signUpPolicyData', type: 'bytes' }, { name: '_initialVoiceCreditProxyData', type: 'bytes' },
  ], outputs: [] },
  { type: 'event', name: 'PollJoined', inputs: [
    { name: '_pollPublicKeyX', type: 'uint256', indexed: true }, { name: '_pollPublicKeyY', type: 'uint256', indexed: true },
    { name: '_voiceCreditBalance', type: 'uint256', indexed: false }, { name: '_nullifier', type: 'uint256', indexed: false },
    { name: '_pollStateIndex', type: 'uint256', indexed: false },
  ] },
] as const;

function sponsorAccount() {
  const key = process.env.MACI_JOIN_RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new ServiceUnavailableException({ code: 'MACI_JOIN_RELAYER_UNCONFIGURED', message: 'MACI join sponsor is unavailable.' });
  for (const other of [process.env.MACI_ISSUER_PRIVATE_KEY, process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY, process.env.MACI_RELAYER_PRIVATE_KEY, process.env.RELAYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY]) {
    if (key.toLowerCase() === other?.toLowerCase()) throw new ServiceUnavailableException({ code: 'MACI_JOIN_KEY_REUSE', message: 'MACI join sponsor key must be separate.' });
  }
  return privateKeyToAccount(key as Hex);
}

@Injectable()
export class MaciJoinRelay {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService) {}

  private view(row: { id: string; status: string; transactionHash: string | null; pollStateIndex: string | null; errorCode: string | null }) {
    return { id: row.id, status: row.status, transactionHash: row.transactionHash, pollStateIndex: row.pollStateIndex, errorCode: row.errorCode };
  }

  async submit(electionIdInput: string, body: unknown, idempotencyKey: string | undefined, cookie: string | undefined) {
    if (cookie) throw new ForbiddenException({ code: 'MACI_IDENTITY_COOKIE_FORBIDDEN', message: 'Submit joining proofs without an identity session.' });
    const election = await this.db.maciElection.findUnique({ where: { id: z.uuid().parse(electionIdInput) } });
    if (!election || election.status !== 'OPEN') throw new ConflictException({ code: 'MACI_POLL_NOT_OPEN', message: 'MACI poll is not open.' });
    if (election.chainId !== String(await this.chain.client.getChainId())) throw new ServiceUnavailableException({ code: 'MACI_CHAIN_MISMATCH', message: 'MACI RPC chain changed.' });
    const input = inputSchema.parse(body);
    const key = { x: BigInt(input.publicKey.x), y: BigInt(input.publicKey.y) };
    const nullifier = BigInt(input.nullifier);
    const rootIndex = BigInt(input.stateRootIndex);
    const proof = input.proof.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint];
    const pollAddress = election.pollAddress as Address;
    const calldata = encodeFunctionData({ abi: pollAbi, functionName: 'joinPoll', args: [nullifier, key, rootIndex, proof, '0x', '0x'] });
    const digest = keccak256(encodePacked(['uint256', 'address', 'bytes32'], [BigInt(election.chainId), pollAddress, keccak256(calldata)]));
    if (idempotencyKey !== digest) throw new ConflictException({ code: 'MACI_IDEMPOTENCY_MISMATCH', message: 'Idempotency key does not match the joining proof.' });
    const prior = await this.db.maciPollJoinSubmission.findUnique({ where: { joinDigest: digest } });
    if (prior) return this.view(await this.reconcile(prior.id));
    if (await this.chain.client.readContract({ address: pollAddress, abi: pollAbi, functionName: 'pollNullifiers', args: [nullifier] })) throw new ConflictException({ code: 'MACI_ALREADY_JOINED', message: 'This credential has already joined the poll.' });
    const valid = await this.chain.client.readContract({ address: pollAddress, abi: pollAbi, functionName: 'verifyJoiningPollProof', args: [nullifier, rootIndex, key, proof] });
    if (!valid) throw new ConflictException({ code: 'MACI_INVALID_JOIN_PROOF', message: 'The joining proof is invalid.' });
    const account = sponsorAccount();
    const lane = `${election.chainId}:${account.address.toLowerCase()}`;
    const prepared = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lane})::bigint)`;
      const duplicate = await tx.maciPollJoinSubmission.findUnique({ where: { joinDigest: digest } });
      if (duplicate) return duplicate;
      const active = await tx.maciPollJoinSubmission.findFirst({ where: { chainId: election.chainId, status: { in: ['PREPARED', 'PENDING'] } } });
      if (active) throw new HttpException({ code: 'MACI_JOIN_RELAY_BUSY', message: 'Another joining proof is pending.' }, 429);
      const nonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'pending' });
      if (nonce !== await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' })) throw new ServiceUnavailableException({ code: 'MACI_EXTERNAL_PENDING', message: 'Join sponsor has a pending transaction.' });
      const estimate = await this.chain.client.estimateGas({ account, to: pollAddress, data: calldata });
      const gas = (estimate * 120n + 99n) / 100n;
      const gasPrice = await this.chain.client.getGasPrice();
      if (gas > BigInt(process.env.MACI_JOIN_MAX_GAS ?? '1000000') || gasPrice > BigInt(process.env.MACI_RELAYER_MAX_GAS_PRICE_WEI ?? '10000000000')) throw new ServiceUnavailableException({ code: 'MACI_GAS_LIMIT', message: 'MACI gas cap was reached.' });
      if (await this.chain.client.getBalance({ address: account.address }) < gas * gasPrice) throw new ServiceUnavailableException({ code: 'MACI_BALANCE_LOW', message: 'Join sponsor lacks test funds.' });
      const raw = await account.signTransaction({ chainId: Number(election.chainId), type: 'legacy', to: pollAddress, data: calldata, value: 0n, gas, gasPrice, nonce });
      return tx.maciPollJoinSubmission.create({ data: {
        chainId: election.chainId, pollAddress: election.pollAddress, joinDigest: digest,
        publicKeyX: input.publicKey.x, publicKeyY: input.publicKey.y, nullifier: input.nullifier,
        status: 'PREPARED', transactionHash: keccak256(raw), rawTransaction: raw, calldataHash: keccak256(calldata), nonce,
      } });
    }, { timeout: 60_000, maxWait: 5_000 });
    return this.view(await this.reconcile(prepared.id));
  }

  async status(id: string) {
    return this.view(await this.reconcile(z.uuid().parse(id)));
  }

  private async reconcile(id: string) {
    const row = await this.db.maciPollJoinSubmission.findUnique({ where: { id } });
    if (!row) throw new ConflictException({ code: 'MACI_JOIN_MISSING', message: 'Joining proof was not found.' });
    if (!row.rawTransaction || !row.transactionHash || !row.calldataHash || row.nonce === null) return row;
    const account = sponsorAccount();
    const raw = row.rawTransaction as Hex;
    const parsed = parseTransaction(raw);
    const sender = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
    if (sender.toLowerCase() !== account.address.toLowerCase() || parsed.chainId !== Number(row.chainId) || parsed.to?.toLowerCase() !== row.pollAddress || !parsed.data || keccak256(parsed.data) !== row.calldataHash || keccak256(raw) !== row.transactionHash) throw new ServiceUnavailableException({ code: 'MACI_STORED_TX_MISMATCH', message: 'Stored join transaction failed integrity validation.' });
    let receipt;
    try { receipt = await this.chain.client.getTransactionReceipt({ hash: row.transactionHash as Hex }); } catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
    if (receipt) {
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      const block = await this.chain.client.getBlock({ blockNumber: receipt.blockNumber });
      if (block.hash !== receipt.blockHash || head < receipt.blockNumber + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) return this.db.maciPollJoinSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: 'AWAITING_CONFIRMATIONS' } });
      const tx = await this.chain.client.getTransaction({ hash: receipt.transactionHash });
      let index: string | null = null;
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== row.pollAddress) continue;
        try {
          const event = decodeEventLog({ abi: pollAbi, data: log.data, topics: log.topics });
          if (event.eventName === 'PollJoined' && event.args._pollPublicKeyX.toString() === row.publicKeyX && event.args._pollPublicKeyY.toString() === row.publicKeyY && event.args._nullifier.toString() === row.nullifier && event.args._voiceCreditBalance === 1n) index = event.args._pollStateIndex.toString();
        } catch { /* Another poll event. */ }
      }
      const exact = tx.from.toLowerCase() === account.address.toLowerCase() && tx.to?.toLowerCase() === row.pollAddress && keccak256(tx.input) === row.calldataHash;
      const status = receipt.status === 'success' && exact && index !== null ? 'JOINED' : 'FAILED';
      return this.db.maciPollJoinSubmission.update({ where: { id }, data: { status, pollStateIndex: index, errorCode: status === 'FAILED' ? 'MACI_JOIN_TX_FAILED' : null, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash } });
    }
    const latestNonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' });
    if (latestNonce > row.nonce) return this.db.maciPollJoinSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: 'MACI_NONCE_CONSUMED' } });
    try {
      await createWalletClient({ transport: http(this.chain.config.RPC_URL, { timeout: 10_000, retryCount: 0 }) }).sendRawTransaction({ serializedTransaction: raw });
      return this.db.maciPollJoinSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: null } });
    } catch {
      return this.db.maciPollJoinSubmission.update({ where: { id }, data: { status: 'PENDING', errorCode: 'MACI_BROADCAST_UNCERTAIN' } });
    }
  }
}

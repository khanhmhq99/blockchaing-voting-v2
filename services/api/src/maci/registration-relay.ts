import { ConflictException, ForbiddenException, HttpException, Inject, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createWalletClient, decodeEventLog, encodeFunctionData, http, keccak256, parseTransaction, recoverTransactionAddress, TransactionReceiptNotFoundError, type Address, type Hex, type TransactionSerialized } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { z } from 'zod';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { AuthService } from '../auth.js';
import { sponsoredMaciRegistrationAbi } from '../../../../packages/contracts/src/sponsored-maci-registration-abi.js';

const signupEventAbi = [{ type: 'event', name: 'SignUp', inputs: [
  { name: '_stateIndex', type: 'uint256', indexed: false },
  { name: '_timestamp', type: 'uint256', indexed: false },
  { name: '_userPublicKeyX', type: 'uint256', indexed: true },
  { name: '_userPublicKeyY', type: 'uint256', indexed: true },
] }] as const;

function sponsorAccount() {
  const key = process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new ServiceUnavailableException({ code: 'MACI_REGISTRATION_RELAYER_UNCONFIGURED', message: 'MACI registration sponsor is unavailable.' });
  for (const other of [process.env.MACI_ISSUER_PRIVATE_KEY, process.env.MACI_RELAYER_PRIVATE_KEY, process.env.RELAYER_PRIVATE_KEY, process.env.DEPLOYER_PRIVATE_KEY]) {
    if (key.toLowerCase() === other?.toLowerCase()) throw new ServiceUnavailableException({ code: 'MACI_REGISTRATION_KEY_REUSE', message: 'MACI registration sponsor key must be separate.' });
  }
  return privateKeyToAccount(key as Hex);
}

@Injectable()
export class MaciRegistrationRelay {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService, @Inject(AuthService) private readonly auth: AuthService) {}

  private view(row: { status: string; transactionHash: string | null; blockNumber: bigint | null }) {
    return { status: row.status, transactionHash: row.transactionHash, blockNumber: row.blockNumber?.toString() ?? null };
  }

  async submit(cookie: string | undefined, electionIdInput: string) {
    const user = await this.auth.authenticate(cookie);
    const electionId = z.uuid().parse(electionIdInput);
    const election = await this.db.maciElection.findUnique({ where: { id: electionId } });
    if (!election || election.status !== 'REGISTRATION') throw new ConflictException({ code: 'MACI_REGISTRATION_CLOSED', message: 'Registration is not open.' });
    if (await this.chain.client.getChainId() !== Number(election.chainId)) throw new ServiceUnavailableException({ code: 'MACI_CHAIN_MISMATCH', message: 'MACI RPC chain changed.' });
    const row = await this.db.maciRegistration.findUnique({ where: { electionId_userId: { electionId, userId: user.id } } });
    if (!row) throw new ForbiddenException({ code: 'MACI_AUTHORIZATION_REQUIRED', message: 'A registration authorization is required.' });
    if (row.status === 'CONFIRMED' && row.rawTransaction) return this.view(await this.reconcile(row.id));
    if (row.status === 'ISSUED') {
      const chainNow = (await this.chain.client.getBlock()).timestamp;
      const wallNow = BigInt(Math.floor(Date.now() / 1000));
      if (BigInt(row.deadline) < (chainNow > wallNow ? chainNow : wallNow)) throw new ConflictException({ code: 'MACI_AUTHORIZATION_EXPIRED', message: 'Request a fresh registration authorization.' });
    }
    if (row.rawTransaction) return this.view(await this.reconcile(row.id));

    const account = sponsorAccount();
    const lane = `${election.chainId}:${account.address.toLowerCase()}`;
    const prepared = await this.db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lane})::bigint)`;
      const latest = await tx.maciRegistration.findUniqueOrThrow({ where: { id: row.id } });
      if (latest.rawTransaction || latest.status === 'CONFIRMED') return latest;
      const active = await tx.maciRegistration.findFirst({ where: { status: { in: ['PREPARED', 'PENDING'] }, election: { chainId: election.chainId } } });
      if (active) throw new HttpException({ code: 'MACI_REGISTRATION_RELAY_BUSY', message: 'Another registration is pending.' }, 429);
      const nonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'pending' });
      if (nonce !== await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' })) throw new ServiceUnavailableException({ code: 'MACI_EXTERNAL_PENDING', message: 'Registration sponsor has a pending transaction.' });
      const data = encodeFunctionData({ abi: sponsoredMaciRegistrationAbi, functionName: 'register', args: [
        { x: BigInt(latest.publicKeyX), y: BigInt(latest.publicKeyY) }, latest.ticket as Hex,
        BigInt(latest.deadline), latest.issuerSignature as Hex,
      ] });
      const to = election.registrationAddress as Address;
      const estimate = await this.chain.client.estimateGas({ account, to, data });
      const gas = (estimate * 120n + 99n) / 100n;
      const gasPrice = await this.chain.client.getGasPrice();
      if (gas > BigInt(process.env.MACI_REGISTRATION_MAX_GAS ?? '500000') || gasPrice > BigInt(process.env.MACI_RELAYER_MAX_GAS_PRICE_WEI ?? '10000000000')) throw new ServiceUnavailableException({ code: 'MACI_GAS_LIMIT', message: 'MACI gas cap was reached.' });
      if (await this.chain.client.getBalance({ address: account.address }) < gas * gasPrice) throw new ServiceUnavailableException({ code: 'MACI_BALANCE_LOW', message: 'Registration sponsor lacks test funds.' });
      const raw = await account.signTransaction({ chainId: Number(election.chainId), type: 'legacy', to, data, value: 0n, gas, gasPrice, nonce });
      return tx.maciRegistration.update({ where: { id: row.id }, data: {
        status: 'PREPARED', transactionHash: keccak256(raw), rawTransaction: raw, calldataHash: keccak256(data), nonce,
      } });
    }, { timeout: 60_000, maxWait: 5_000 });
    return this.view(await this.reconcile(prepared.id));
  }

  async status(cookie: string | undefined, electionIdInput: string) {
    const user = await this.auth.authenticate(cookie);
    const electionId = z.uuid().parse(electionIdInput);
    const row = await this.db.maciRegistration.findUnique({ where: { electionId_userId: { electionId, userId: user.id } } });
    if (!row) throw new ConflictException({ code: 'MACI_REGISTRATION_MISSING', message: 'Registration was not found.' });
    return this.view(row.rawTransaction ? await this.reconcile(row.id) : row);
  }

  private async reconcile(id: string) {
    const row = await this.db.maciRegistration.findUniqueOrThrow({ where: { id }, include: { election: true } });
    if (!row.rawTransaction || !row.transactionHash || !row.calldataHash || row.nonce === null) return row;
    const account = sponsorAccount();
    const raw = row.rawTransaction as Hex;
    const parsed = parseTransaction(raw);
    const sender = await recoverTransactionAddress({ serializedTransaction: raw as TransactionSerialized });
    if (sender.toLowerCase() !== account.address.toLowerCase() || parsed.chainId !== Number(row.election.chainId) || parsed.to?.toLowerCase() !== row.election.registrationAddress || !parsed.data || keccak256(parsed.data) !== row.calldataHash || keccak256(raw) !== row.transactionHash) throw new ServiceUnavailableException({ code: 'MACI_STORED_TX_MISMATCH', message: 'Stored registration transaction failed integrity validation.' });
    let receipt;
    try { receipt = await this.chain.client.getTransactionReceipt({ hash: row.transactionHash as Hex }); } catch (error) { if (!(error instanceof TransactionReceiptNotFoundError)) throw error; }
    if (receipt) {
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      const block = await this.chain.client.getBlock({ blockNumber: receipt.blockNumber });
      if (block.hash !== receipt.blockHash || head < receipt.blockNumber + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) return this.db.maciRegistration.update({ where: { id }, data: { status: 'PENDING' } });
      const tx = await this.chain.client.getTransaction({ hash: receipt.transactionHash });
      const eventMatches = receipt.logs.some(log => {
        if (log.address.toLowerCase() !== row.election.maciAddress) return false;
        try {
          const event = decodeEventLog({ abi: signupEventAbi, data: log.data, topics: log.topics });
          return event.args._userPublicKeyX.toString() === row.publicKeyX && event.args._userPublicKeyY.toString() === row.publicKeyY;
        } catch { return false; }
      });
      const used = await this.chain.client.readContract({ address: row.election.registrationAddress as Address, abi: sponsoredMaciRegistrationAbi, functionName: 'usedTickets', args: [row.ticket as Hex] });
      const exact = tx.from.toLowerCase() === account.address.toLowerCase() && tx.to?.toLowerCase() === row.election.registrationAddress && keccak256(tx.input) === row.calldataHash;
      return this.db.maciRegistration.update({ where: { id }, data: { status: receipt.status === 'success' && used && eventMatches && exact ? 'CONFIRMED' : 'FAILED', blockNumber: receipt.blockNumber, blockHash: receipt.blockHash } });
    }
    const latestNonce = await this.chain.client.getTransactionCount({ address: account.address, blockTag: 'latest' });
    if (latestNonce > row.nonce) return this.db.maciRegistration.update({ where: { id }, data: { status: 'PENDING' } });
    try {
      await createWalletClient({ transport: http(this.chain.config.RPC_URL, { timeout: 10_000, retryCount: 0 }) }).sendRawTransaction({ serializedTransaction: raw });
    } catch { /* Preserve signed bytes for retry and manual reconciliation. */ }
    return this.db.maciRegistration.update({ where: { id }, data: { status: 'PENDING' } });
  }
}

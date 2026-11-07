// Crash-safe, chain-bound transaction journal for the explicit MACI deployer.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { keccak256 } from 'ethers';

function digest(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function intentOf(tx) {
  return { to: tx.to?.toLowerCase() ?? null, dataHash: keccak256(tx.data ?? '0x'), value: BigInt(tx.value ?? 0).toString() };
}
function sameIntent(a, b) { return a.to === b.to && a.dataHash === b.dataHash && a.value === b.value; }

function durableWrite(file, data) {
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, 'wx', 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify(data, null, 2)}\n`); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}

export function acquireDeploymentSignerLock(directory, chainId, genesisHash, signerAddress) {
  fs.mkdirSync(directory, { recursive: true });
  const key = createHash('sha256').update(`${chainId}:${genesisHash.toLowerCase()}:${signerAddress.toLowerCase()}`).digest('hex');
  const file = path.join(directory, `${key}.lock`);
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const fd = fs.openSync(file, 'wx', 0o600);
      try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token })); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      return () => {
        try {
          if (JSON.parse(fs.readFileSync(file, 'utf8')).token === token) fs.unlinkSync(file);
        } catch { /* A removed or replaced lock must not be deleted. */ }
      };
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      let holder;
      try { holder = JSON.parse(fs.readFileSync(file, 'utf8')); }
      catch (cause) { throw new Error('Deployment signer lock is unreadable; manual reconciliation required', { cause }); }
      if (!Number.isSafeInteger(holder.pid) || holder.pid <= 0) throw new Error('Deployment signer lock has no valid owner', { cause: error });
      let stale = false;
      try { process.kill(holder.pid, 0); }
      catch (checkError) {
        if (checkError?.code !== 'ESRCH') throw checkError;
        stale = true;
      }
      if (!stale) throw new Error('Another deployment process holds the signer lock', { cause: error });
      try { fs.renameSync(file, `${file}.stale.${randomUUID()}`); }
      catch (cause) { throw new Error('Deployment signer lock changed during recovery', { cause }); }
    }
  }
  throw new Error('Unable to acquire deployment signer lock');
}

export class MaciDeploymentJournal {
  constructor({ file, chainId, genesisHash, runId, signerAddress, configuration, confirmations, provider, wallet, onBroadcast, maxGasPriceWei, maxCostWei }) {
    this.file = file;
    this.provider = provider;
    this.wallet = wallet;
    this.confirmations = confirmations;
    this.onBroadcast = onBroadcast;
    this.maxGasPriceWei = maxGasPriceWei === undefined ? null : BigInt(maxGasPriceWei);
    this.maxCostWei = maxCostWei === undefined ? null : BigInt(maxCostWei);
    if ((this.maxGasPriceWei !== null && this.maxGasPriceWei <= 0n) || (this.maxCostWei !== null && this.maxCostWei <= 0n)) throw new Error('Invalid deployment fee limit');
    this.cursor = 0;
    this.stage = 'not-started';
    const identity = { chainId, genesisHash: genesisHash.toLowerCase(), runId, signerAddress: signerAddress.toLowerCase(), configurationHash: digest(configuration),
      ...((this.maxGasPriceWei === null && this.maxCostWei === null) ? {} : { feeLimits: {
        maxGasPriceWei: this.maxGasPriceWei?.toString() ?? null, maxCostWei: this.maxCostWei?.toString() ?? null,
      } }),
    };
    if (fs.existsSync(file)) {
      this.record = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (JSON.stringify(this.record.identity) !== JSON.stringify(identity) || !Array.isArray(this.record.entries)) throw new Error('Deployment journal identity mismatch');
    } else {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      this.record = { version: 1, identity, entries: [] };
      durableWrite(file, this.record);
    }
  }

  setStage(stage) { this.stage = stage; }
  persist() { durableWrite(this.file, this.record); }

  async assertChain() {
    if (Number((await this.provider.getNetwork()).chainId) !== this.record.identity.chainId ||
        (await this.provider.getBlock(0))?.hash?.toLowerCase() !== this.record.identity.genesisHash) {
      throw new Error('Deployment journal chain fingerprint changed');
    }
  }

  async confirm(entry) {
    await this.assertChain();
    let receipt = await this.provider.getTransactionReceipt(entry.hash);
    if (!receipt) return null;
    if (receipt.status !== 1) throw new Error('Journaled transaction reverted; manual reconciliation required');
    const tx = await this.provider.getTransaction(entry.hash);
    if (!tx || tx.from.toLowerCase() !== this.record.identity.signerAddress || tx.nonce !== entry.nonce ||
        !sameIntent(intentOf(tx), entry.intent)) throw new Error('Journaled transaction identity mismatch');
    if (entry.receipt && (entry.receipt.blockHash !== receipt.blockHash || entry.receipt.blockNumber !== receipt.blockNumber)) {
      throw new Error('Journaled transaction reorged; manual reconciliation required');
    }
    const head = await this.provider.getBlockNumber();
    if (head < receipt.blockNumber + this.confirmations - 1) return null;
    let codeHash = null;
    if (receipt.contractAddress) {
      const code = await this.provider.getCode(receipt.contractAddress);
      if (code === '0x') throw new Error('Journaled contract has no code');
      codeHash = keccak256(code);
      if (entry.receipt?.codeHash && entry.receipt.codeHash !== codeHash) throw new Error('Journaled contract code changed');
    }
    entry.receipt = { blockNumber: receipt.blockNumber, blockHash: receipt.blockHash,
      gasUsed: receipt.gasUsed.toString(), contractAddress: receipt.contractAddress, codeHash };
    entry.status = 'confirmed';
    this.persist();
    return tx;
  }

  async awaitConfirmed(entry) {
    let transaction = await this.confirm(entry);
    if (transaction) return transaction;
    await this.provider.waitForTransaction(entry.hash, this.confirmations, 180000);
    transaction = await this.confirm(entry);
    if (!transaction) throw new Error('Deployment transaction lacks required confirmations');
    return transaction;
  }

  async responseFor(entry) {
    const confirmed = await this.confirm(entry);
    if (confirmed) return confirmed;
    const known = await this.provider.getTransaction(entry.hash);
    if (known) return known;
    const [latest, pending] = await Promise.all([
      this.provider.getTransactionCount(this.record.identity.signerAddress, 'latest'),
      this.provider.getTransactionCount(this.record.identity.signerAddress, 'pending'),
    ]);
    if (latest > entry.nonce || pending > entry.nonce) throw new Error('Journaled nonce has an unknown outcome; manual reconciliation required');
    if (latest < entry.nonce) throw new Error('Journaled nonce has a gap; manual reconciliation required');
    try {
      const response = await this.provider.broadcastTransaction(entry.rawSignedTransaction);
      if (response.hash !== entry.hash) throw new Error('RPC returned a different transaction hash');
      entry.status = 'broadcast';
      this.persist();
      this.onBroadcast?.(entry.index);
      return response;
    } catch {
      const observed = await this.provider.getTransaction(entry.hash);
      if (observed) return observed;
      throw new Error('Broadcast outcome unknown; manual reconciliation required');
    }
  }

  async send(tx) {
    await this.assertChain();
    const intent = intentOf(tx);
    const index = this.cursor++;
    const existing = this.record.entries[index];
    if (existing) {
      if (existing.stage !== this.stage || !sameIntent(existing.intent, intent)) throw new Error('Deployment replay does not match journaled stage and intent');
      return this.responseFor(existing);
    }
    if (index !== this.record.entries.length) throw new Error('Deployment journal sequence gap');
    const previous = this.record.entries.at(-1);
    if (previous) await this.awaitConfirmed(previous);
    const pending = await this.provider.getTransactionCount(this.record.identity.signerAddress, 'pending');
    const latest = await this.provider.getTransactionCount(this.record.identity.signerAddress, 'latest');
    const expectedNonce = previous ? previous.nonce + 1 : pending;
    if (pending !== latest || pending !== expectedNonce) throw new Error('Deployer nonce is occupied or conflicting');
    const populated = await this.wallet.populateTransaction({ ...tx, nonce: expectedNonce, chainId: this.record.identity.chainId });
    if (populated.nonce !== expectedNonce || !sameIntent(intentOf(populated), intent)) throw new Error('Populated deployment intent changed');
    let maxTransactionCostWei = null;
    if (this.maxGasPriceWei !== null || this.maxCostWei !== null) {
      const price = populated.maxFeePerGas ?? populated.gasPrice;
      const limit = populated.gasLimit;
      if (price === undefined || limit === undefined || BigInt(price) <= 0n || BigInt(limit) <= 0n) throw new Error('Deployment fee estimate is unavailable');
      if (this.maxGasPriceWei !== null && BigInt(price) > this.maxGasPriceWei) throw new Error('Deployment gas price exceeds configured limit');
      maxTransactionCostWei = BigInt(price) * BigInt(limit) + BigInt(populated.value ?? 0);
      const reserved = this.record.entries.reduce((sum, entry) => sum + BigInt(entry.maxTransactionCostWei ?? 0), 0n);
      if (this.maxCostWei !== null && reserved + maxTransactionCostWei > this.maxCostWei) throw new Error('Deployment cost exceeds configured budget');
    }
    const rawSignedTransaction = await this.wallet.signTransaction(populated);
    const entry = { index, stage: this.stage, intent, nonce: expectedNonce,
      hash: keccak256(rawSignedTransaction), rawSignedTransaction, status: 'prepared', receipt: null,
      ...(maxTransactionCostWei === null ? {} : { maxTransactionCostWei: maxTransactionCostWei.toString() }) };
    this.record.entries.push(entry);
    this.persist(); // Signed identity is durable before any network broadcast.
    return this.responseFor(entry);
  }

  async consumeConfirmed(stage, expectedTransaction) {
    await this.assertChain();
    const entry = this.record.entries[this.cursor];
    if (!entry || entry.stage !== stage || (expectedTransaction && !sameIntent(entry.intent, intentOf(expectedTransaction)))) {
      throw new Error(`Deployment journal cannot skip an unmatched transaction at index ${this.cursor} (${entry?.stage ?? 'missing'} versus ${stage})`);
    }
    await this.awaitConfirmed(entry);
    this.cursor += 1;
    return entry;
  }

  async confirmAll() {
    for (const entry of this.record.entries) await this.awaitConfirmed(entry);
    if (this.cursor !== this.record.entries.length) throw new Error('Deployment replay did not consume every journaled transaction');
    return this.record.entries;
  }
}

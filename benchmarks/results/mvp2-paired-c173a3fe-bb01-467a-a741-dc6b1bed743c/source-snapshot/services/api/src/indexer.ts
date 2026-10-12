import { Inject, Injectable, ConflictException } from '@nestjs/common';
import { decodeEventLog } from 'viem';
import type { Prisma } from '@prisma/client';
import { votingAbi } from '../../../packages/contracts/src/abi.js';
import { jsonSafe } from '../../../packages/shared-types/src/index.js';
import { DatabaseService } from './database.js';
import { ChainService } from './chain.js';

@Injectable()
export class IndexerService {
  private busy = false;
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService) {}
  async sync() {
    if (this.busy) throw new ConflictException('Index rebuild already running');
    this.busy = true;
    try {
      await this.chain.verifyNetwork();
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      const end = head - BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1);
      const start = BigInt(this.chain.config.DEPLOYMENT_BLOCK);
      if (end < start) return { status: 'waiting-for-confirmations' };
      const anchor = await this.chain.client.getBlock({ blockNumber: end });
      const where = { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address };
      const rows: Prisma.IndexedEventCreateManyInput[] = [];
      for (let fromBlock = start; fromBlock <= end; fromBlock += 1000n) {
        const toBlock = fromBlock + 999n > end ? end : fromBlock + 999n;
        for (const log of await this.chain.client.getLogs({ address: this.chain.address, fromBlock, toBlock })) {
          if (log.blockNumber === null || !log.blockHash || !log.transactionHash || log.logIndex === null) throw new Error('Incomplete log');
          const decoded = decodeEventLog({ abi: votingAbi, data: log.data, topics: log.topics });
          rows.push({ ...where, blockNumber: log.blockNumber, blockHash: log.blockHash, transactionHash: log.transactionHash, logIndex: log.logIndex, eventName: decoded.eventName, payload: jsonSafe(decoded.args) as Prisma.InputJsonValue });
        }
      }
      if ((await this.chain.client.getBlock({ blockNumber: end })).hash !== anchor.hash) throw new Error('Reorg during indexing; retry');
      const transactions: Prisma.BlockchainTransactionCreateManyInput[] = [];
      for (const hash of new Set(rows.map(row => row.transactionHash))) {
        const receipt = await this.chain.client.getTransactionReceipt({ hash: hash as `0x${string}` });
        const related = rows.filter(row => row.transactionHash === hash);
        if (related.some(row => row.blockHash !== receipt.blockHash)) throw new Error('Receipt/log mismatch');
        const payload = related.find(row => row.payload && typeof row.payload === 'object' && 'electionId' in row.payload)?.payload as { electionId?: string } | undefined;
        transactions.push({ ...where, electionId: payload?.electionId ?? null, transactionHash: hash, operation: [...new Set(related.map(row => row.eventName))].join(','), status: receipt.status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, gasUsed: receipt.gasUsed.toString(), effectiveGasPrice: receipt.effectiveGasPrice.toString() });
      }
      const id = `${where.chainId}:${where.contractAddress}`;
      await this.db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
        if ((await this.chain.client.getBlock({ blockNumber: end })).hash !== anchor.hash) throw new Error('Reorg during indexing; retry');
        await tx.indexedEvent.deleteMany({ where });
        if (rows.length) await tx.indexedEvent.createMany({ data: rows });
        await tx.blockchainTransaction.deleteMany({ where });
        if (transactions.length) await tx.blockchainTransaction.createMany({ data: transactions });
        await tx.chainCheckpoint.upsert({ where: { id }, create: { id, blockNumber: end, blockHash: anchor.hash! }, update: { blockNumber: end, blockHash: anchor.hash! } });
      }, { timeout: 30000 });
      return { records: rows.length, blockNumber: end.toString(), blockHash: anchor.hash, finality: 'confirmation-depth', source: 'blockchain' };
    } finally { this.busy = false; }
  }
}

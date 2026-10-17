import { Injectable } from '@nestjs/common';
import { createPublicClient, http } from 'viem';
import { chainConfig } from './config.js';

@Injectable()
export class ChainService {
  readonly config = chainConfig();
  readonly client = createPublicClient({ transport: http(this.config.RPC_URL, { timeout: 10000, retryCount: 1 }) });
  async verifyNetwork() {
    if (await this.client.getChainId() !== this.config.CHAIN_ID) throw new Error('RPC chain mismatch');
  }
}

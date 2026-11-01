import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { createPublicClient, http, type Address } from 'viem';
import { chainConfig } from './config.js';

@Injectable()
export class ChainService {
  readonly config = chainConfig();
  readonly client = createPublicClient({ transport: http(this.config.RPC_URL, { timeout: 10000, retryCount: 1 }) });
  async verifyNetwork() {
    if (await this.client.getChainId() !== this.config.CHAIN_ID) throw new Error('RPC chain mismatch');
  }
  async requireLocalContract(address: Address) {
    let chainId: number;
    try { chainId = await this.client.getChainId(); }
    catch { throw new ServiceUnavailableException({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Hardhat Local RPC is unavailable.' }); }
    if (chainId !== 31337) throw new ServiceUnavailableException({ code: 'MACI_CHAIN_MISMATCH', message: 'Hardhat Local chain 31337 is required.' });
    try {
      if (!await this.client.getCode({ address })) throw new ServiceUnavailableException({ code: 'MACI_CONTRACT_MISSING', message: 'MACI contract is missing on Hardhat Local.' });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Hardhat Local RPC is unavailable.' });
    }
  }
}

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
  requireTransactionsEnabled() {
    if (this.config.CHAIN_ID === 97 && process.env.MACI_BSC_TESTNET_ENABLED !== 'true') throw new ServiceUnavailableException({ code: 'MACI_TESTNET_DISABLED', message: 'BSC Testnet transactions are not enabled.' });
  }
  async requireLocalContract(address: Address) {
    let chainId: number;
    try { chainId = await this.client.getChainId(); }
    catch { throw new ServiceUnavailableException({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Configured RPC is unavailable.' }); }
    if (chainId !== this.config.CHAIN_ID) throw new ServiceUnavailableException({ code: 'MACI_CHAIN_MISMATCH', message: 'Configured RPC chain does not match this service.' });
    try {
      if (!await this.client.getCode({ address })) throw new ServiceUnavailableException({ code: 'MACI_CONTRACT_MISSING', message: 'MACI contract is missing on the configured chain.' });
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException({ code: 'DEPENDENCY_UNAVAILABLE', message: 'Configured RPC is unavailable.' });
    }
  }
}

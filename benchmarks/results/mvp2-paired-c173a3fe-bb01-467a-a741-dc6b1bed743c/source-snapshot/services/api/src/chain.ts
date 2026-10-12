import { Injectable } from '@nestjs/common';
import { createPublicClient, http, type Address } from 'viem';
import { votingAbi } from '../../../packages/contracts/src/abi.js';
import { chainConfig } from './config.js';
import { states } from '../../../packages/shared-types/src/index.js';

@Injectable()
export class ChainService {
  readonly config = chainConfig();
  readonly address = this.config.VOTING_CONTRACT_ADDRESS.toLowerCase() as Address;
  readonly client = createPublicClient({ transport: http(this.config.RPC_URL, { timeout: 10000, retryCount: 1 }) });
  async verifyNetwork() {
    if (await this.client.getChainId() !== this.config.CHAIN_ID) throw new Error('RPC chain mismatch');
    if (!await this.client.getCode({ address: this.address })) throw new Error('Contract is not deployed');
  }
  async owner() { await this.verifyNetwork(); return this.client.readContract({ address: this.address, abi: votingAbi, functionName: 'owner' }); }
  async election(id: bigint, voter?: Address) {
    await this.verifyNetwork();
    const blockNumber = await this.client.getBlockNumber({ cacheTime: 0 });
    const block = await this.client.getBlock({ blockNumber });
    const base = { address: this.address, abi: votingAbi, blockNumber } as const;
    const election = await this.client.readContract({ ...base, functionName: 'getElection', args: [id] });
    const state = await this.client.readContract({ ...base, functionName: 'state', args: [id] });
    const counts = await Promise.all(Array.from({ length: election.candidateCount }, (_, index) => this.client.readContract({ ...base, functionName: 'candidateVotes', args: [id, index] })));
    const candidateHashes = await Promise.all(Array.from({ length: election.registeredCandidates }, (_, index) => this.client.readContract({ ...base, functionName: 'candidateMetadataHash', args: [id, index] })));
    const eligibility = voter ? await this.client.readContract({ ...base, functionName: 'eligible', args: [id, voter] }) : null;
    const hasVoted = voter ? await this.client.readContract({ ...base, functionName: 'hasVoted', args: [id, voter] }) : null;
    if ((await this.client.getBlock({ blockNumber })).hash !== block.hash) throw new Error('Chain changed during read; retry');
    return { ...election, id: id.toString(), state: states[state], counts, candidateHashes, eligible: eligibility, hasVoted, source: 'blockchain', blockNumber, blockHash: block.hash, finality: 'included' };
  }
}

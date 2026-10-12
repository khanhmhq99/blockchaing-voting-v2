import { Inject, Injectable } from '@nestjs/common';
import { hashTypedData, recoverTypedDataAddress, type Hex } from 'viem';
import { gaslessAbi } from '../../../../packages/contracts/src/gasless-abi.js';
import { intentMessage, votingTypedData, type VotingIntent } from '../../../../packages/shared-types/src/gasless.js';
import { ChainService } from '../chain.js';
import { relayerConfig } from './config.js';
import { RelayError } from './errors.js';

@Injectable()
export class IntentAuthorization {
  constructor(@Inject(ChainService) readonly chain: ChainService) {}
  async signature(intent: VotingIntent, signature: Hex) {
    const data = votingTypedData(intent, this.chain.config.CHAIN_ID, this.chain.address);
    let recovered: string;
    try { recovered = await recoverTypedDataAddress({ ...data, signature }); }
    catch { throw new RelayError('INVALID_SIGNATURE'); }
    if (recovered.toLowerCase() !== intent.voter.toLowerCase()) throw new RelayError('INVALID_SIGNATURE');
    return hashTypedData(data);
  }
  async validate(intent: VotingIntent, signature: Hex) {
    const digest = await this.signature(intent, signature);
    await this.chain.verifyNetwork();
    const block = await this.chain.client.getBlock();
    const deadline = BigInt(intent.deadline);
    if (deadline < block.timestamp) throw new RelayError('INTENT_EXPIRED');
    if (deadline > block.timestamp + BigInt(relayerConfig().maxDeadlineSeconds)) throw new RelayError('DEADLINE_TOO_FAR');
    const election = await this.chain.election(BigInt(intent.electionId), intent.voter);
    if (election.state !== 'Active') throw new RelayError('ELECTION_NOT_ACTIVE');
    if (!election.eligible) throw new RelayError('VOTER_NOT_ELIGIBLE');
    if (election.hasVoted) throw new RelayError('ALREADY_VOTED', 409);
    if (election.manifestHash.toLowerCase() !== intent.manifestHash) throw new RelayError('MANIFEST_MISMATCH');
    if (BigInt(intent.candidateId) >= BigInt(election.candidateCount)) throw new RelayError('INVALID_CANDIDATE');
    const nonce = await this.chain.client.readContract({ address: this.chain.address, abi: gaslessAbi, functionName: 'nonces', args: [BigInt(intent.electionId), intent.voter] });
    if (nonce !== BigInt(intent.nonce)) throw new RelayError('INVALID_NONCE', 409);
    const code = await this.chain.client.getCode({ address: intent.voter });
    if (code && code !== '0x') throw new RelayError('EOA_REQUIRED');
    try {
      await this.chain.client.simulateContract({ address: this.chain.address, abi: gaslessAbi, functionName: 'voteWithSignature', args: [intentMessage(intent), signature] });
    } catch { throw new RelayError('SIMULATION_FAILED'); }
    return digest;
  }
}

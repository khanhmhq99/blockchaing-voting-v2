import { z } from 'zod';
import type { Address, Hex } from 'viem';

export const uint256Schema = z.string().regex(/^(0|[1-9][0-9]{0,77})$/).pipe(z.string().refine(value => BigInt(value) < 2n ** 256n));
export const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => value.toLowerCase() as Address);
export const intentSchema = z.object({
  electionId: uint256Schema.pipe(z.string().refine(value => BigInt(value) > 0n)),
  manifestHash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).transform(value => value.toLowerCase() as Hex),
  candidateId: uint256Schema.pipe(z.string().refine(value => BigInt(value) < 100n)),
  voter: addressSchema, nonce: uint256Schema, deadline: uint256Schema,
}).strict();
export const gaslessRequestSchema = z.object({ intent: intentSchema, signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/).transform(value => value as Hex) }).strict();
export type VotingIntent = z.infer<typeof intentSchema>;
export const votingIntentTypes = { VotingIntent: [
  { name: 'electionId', type: 'uint256' }, { name: 'manifestHash', type: 'bytes32' },
  { name: 'candidateId', type: 'uint256' }, { name: 'voter', type: 'address' },
  { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
] } as const;
export function votingDomain(chainId: number, verifyingContract: Address) {
  return { name: 'HCMUT Gasless Voting', version: '2', chainId, verifyingContract } as const;
}
export function intentMessage(intent: VotingIntent) {
  return { ...intent, electionId: BigInt(intent.electionId), candidateId: BigInt(intent.candidateId), nonce: BigInt(intent.nonce), deadline: BigInt(intent.deadline) };
}
export function votingTypedData(intent: VotingIntent, chainId: number, contract: Address) {
  return { domain: votingDomain(chainId, contract), types: votingIntentTypes, primaryType: 'VotingIntent', message: intentMessage(intent) } as const;
}
export type GaslessStatus = 'QUEUED' | 'SUBMITTED' | 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'FAILED';

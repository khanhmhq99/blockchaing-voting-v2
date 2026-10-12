import { hashTypedData, type Address, type Hex } from 'viem';
import { gaslessRequestSchema, votingTypedData } from '../../../packages/shared-types/src/gasless';
import { connectWallet } from './wallet';

export type GaslessReceipt = { id: string; electionId: string; chainId: string; contractAddress: Address; status: string; errorCode: string | null; transactionHash: Hex | null; blockNumber: string | null; blockHash: Hex | null; gasUsed: string | null; transactionFee: string | null; relayerAddress: Address | null };
export async function relayRequest<T>(api: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}/v1/gasless${path}`, init);
  const body = await response.json();
  if (!response.ok) throw new Error(`Gasless: ${body.error?.code ?? 'DEPENDENCY_UNAVAILABLE'}`);
  return body as T;
}
export async function signVotingIntent(api: string, config: { chainId: number; contractAddress: Address }, election: { id: string; manifestHash: Hex }, candidate: number, expected: Address) {
  const { client, address } = await connectWallet(config.chainId);
  if (address.toLowerCase() !== expected.toLowerCase()) throw new Error('Ví đã thay đổi. Kết nối lại và kiểm tra lựa chọn.');
  const nonce = await relayRequest<{ nonce: string; timestamp: string; deadline: string }>(api, `/nonce/${election.id}/${address}`);
  const intent = { electionId: election.id, manifestHash: election.manifestHash, candidateId: String(candidate), voter: address.toLowerCase() as Address, nonce: nonce.nonce, deadline: nonce.deadline };
  const typed = votingTypedData(intent, config.chainId, config.contractAddress);
  const signature = await client.signTypedData({ account: address, ...typed });
  if (await client.getChainId() !== config.chainId || (await client.getAddresses())[0]?.toLowerCase() !== expected.toLowerCase()) throw new Error('Ví hoặc mạng thay đổi khi ký. Vui lòng kiểm tra lại.');
  return { body: gaslessRequestSchema.parse({ intent, signature }), digest: hashTypedData(typed) };
}

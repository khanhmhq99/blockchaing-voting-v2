// Browser-only poll-joining proof creation using MACI v3 and its published circuit artifacts.
import { Keypair, PrivateKey } from '@maci-protocol/domainobjs';
import { poseidon } from '@maci-protocol/crypto';
import { getJoinedUserData, getPollJoiningCircuitEvents, MACI__factory } from '@maci-protocol/sdk/browser';
import { JsonRpcProvider, VoidSigner } from 'ethers';
import { groth16 } from 'snarkjs';
import { encodeFunctionData, encodePacked, keccak256, type Address } from 'viem';

const joinAbi = [{ type: 'function', name: 'joinPoll', stateMutability: 'nonpayable', inputs: [
  { name: '_nullifier', type: 'uint256' },
  { name: '_publicKey', type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] },
  { name: '_stateRootIndex', type: 'uint256' },
  { name: '_proof', type: 'uint256[8]' },
  { name: '_signUpPolicyData', type: 'bytes' },
  { name: '_initialVoiceCreditProxyData', type: 'bytes' },
], outputs: [] }] as const;

export async function generateMaciJoin(args: {
  secret: string; rpcUrl: string; chainId: string; maciAddress: Address;
  pollAddress: Address; pollId: string; deploymentBlock: string;
}) {
  if (!/^macisk\.[0-9a-f]{64}$/.test(args.secret)) throw new Error('Invalid MACI credential.');
  const provider = new JsonRpcProvider(args.rpcUrl, Number(args.chainId));
  if (BigInt((await provider.getNetwork()).chainId) !== BigInt(args.chainId)) throw new Error('MACI RPC chain mismatch.');
  const reader = new VoidSigner('0x0000000000000000000000000000000000000001', provider);
  const pair = new Keypair(PrivateKey.deserialize(args.secret));
  const maci = MACI__factory.connect(args.maciAddress, reader);
  const stateIndex = await maci.getStateIndex(pair.publicKey.hash());
  const pollId = BigInt(args.pollId);
  const deploymentBlock = Number(args.deploymentBlock);
  if (!Number.isSafeInteger(deploymentBlock) || deploymentBlock < 0) throw new Error('Invalid MACI deployment block.');
  const inputs = await getPollJoiningCircuitEvents({
    maciContract: maci, stateIndex, pollId, userMaciPrivateKey: pair.privateKey,
    signer: reader, startBlock: deploymentBlock, blocksPerBatch: 200,
  });
  const stateRootIndex = (await maci.totalSignups()) - 1n;
  const nullifier = poseidon([BigInt(pair.privateKey.asCircuitInputs()), pollId]);
  const { proof } = await groth16.fullProve(inputs, '/maci/v3.0.0/PollJoining_14.wasm', '/maci/v3.0.0/polljoining_14.zkey');
  const coordinates = [proof.pi_a[0], proof.pi_a[1], proof.pi_b[0]?.[1], proof.pi_b[0]?.[0], proof.pi_b[1]?.[1], proof.pi_b[1]?.[0], proof.pi_c[0], proof.pi_c[1]];
  if (coordinates.some(value => value === undefined)) throw new Error('Incomplete MACI joining proof.');
  const formatted = coordinates.map(value => BigInt(value!).toString());
  const publicKey = { x: pair.publicKey.raw[0].toString(), y: pair.publicKey.raw[1].toString() };
  const calldata = encodeFunctionData({ abi: joinAbi, functionName: 'joinPoll', args: [
    nullifier, { x: pair.publicKey.raw[0], y: pair.publicKey.raw[1] }, stateRootIndex,
    formatted.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint], '0x', '0x',
  ] });
  const idempotencyKey = keccak256(encodePacked(['uint256', 'address', 'bytes32'], [BigInt(args.chainId), args.pollAddress, keccak256(calldata)]));
  return { body: { nullifier: nullifier.toString(), publicKey, stateRootIndex: stateRootIndex.toString(), proof: formatted }, idempotencyKey };
}

export async function findMaciJoin(args: {
  secret: string; rpcUrl: string; chainId: string; maciAddress: Address; pollId: string; deploymentBlock: string;
}) {
  const provider = new JsonRpcProvider(args.rpcUrl, Number(args.chainId));
  const reader = new VoidSigner('0x0000000000000000000000000000000000000001', provider);
  const pair = new Keypair(PrivateKey.deserialize(args.secret));
  const joined = await getJoinedUserData({
    maciAddress: args.maciAddress, pollId: BigInt(args.pollId),
    pollPublicKey: pair.publicKey.serialize(), signer: reader,
    startBlock: Number(args.deploymentBlock),
  });
  return joined.isJoined ? joined.pollStateIndex ?? null : null;
}

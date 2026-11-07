// Synthetic MACI join and encrypted vote through the same browser primitives and anonymous API.
// Credentials and generated proof inputs stay in ignored local files; stdout contains public evidence only.
import fs from 'node:fs';
import path from 'node:path';
import { Keypair, PrivateKey } from '@maci-protocol/domainobjs';
import { poseidon } from '@maci-protocol/crypto';
import { getPollJoiningCircuitEvents, MACI__factory } from '@maci-protocol/sdk/browser';
import { JsonRpcProvider, VoidSigner } from 'ethers';
import { groth16 } from 'snarkjs';
import { cleanThreads } from '@maci-protocol/contracts';
import { decodeFunctionResult, encodeFunctionData, encodePacked, keccak256, type Address } from 'viem';
import { encryptMaciVote } from '../apps/voter-web/app/maci-client.js';

type Election = { id: string; chainId: string; chainHealth: string; status: string;
  maciAddress: Address; pollAddress: Address; pollId: string; deploymentBlock: string;
  startTimestamp: string; endTimestamp: string;
  coordinatorKeyX: string; coordinatorKeyY: string; voteOptions: number };

const id = process.argv[2];
const prepareOnly = process.argv[3] === '--prepare';
const waitForOpen = process.argv[3] === '--wait';
if (process.argv.length > 4 || (process.argv[3] && !prepareOnly && !waitForOpen))
  throw new Error('Usage: run-maci-bsc-vote.ts <election-uuid> [--prepare|--wait]');
if (process.env.CHAIN_ID !== '97' || process.env.MACI_BSC_TESTNET_ENABLED !== 'true' ||
    !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Authorized chain-97 election ID required');
const directory = path.resolve('research/mvp3/maci/probe-output/bsc-integration', id!);
const voters = JSON.parse(fs.readFileSync(path.join(directory, 'synthetic-voters.json'), 'utf8')) as
  { index: number; secret: string }[];
const evidenceFile = path.join(directory, 'voting-observation.json');
const evidence = fs.existsSync(evidenceFile) ?
  JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) as Record<string, { join?: { body: unknown; idempotencyKey: string; id?: string; transactionHash?: string; pollStateIndex?: string }; vote?: { body: unknown; idempotencyKey: string; id?: string; transactionHash?: string } }> : {};
const save = () => fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
const origin = `http://127.0.0.1:${Number(process.env.API_PORT ?? 3001)}`;
async function request(route: string, method = 'GET', body?: unknown, idempotencyKey?: string, cookie?: string) {
  const response = await fetch(`${origin}/v1/${route}`, { method, headers: {
    ...(body ? { 'content-type': 'application/json' } : {}), ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
    ...(cookie ? { cookie } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(`${route}: HTTP ${response.status} ${data.code ?? 'unknown'}`);
  return { data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const adminPassword = fs.readFileSync(path.resolve('research/mvp3/maci/probe-output/bsc-integration/admin-password.txt'), 'utf8');
const admin = await request('auth/login', 'POST', { username: 'maci_bsc_synthetic_admin', password: adminPassword });
if (!admin.cookie) throw new Error('Admin session missing');
const { data: elections } = await request('maci/elections', 'GET', undefined, undefined, admin.cookie);
let election = (elections as unknown as Election[]).find(item => item.id === id);
if (!election || election.chainId !== '97' || election.chainHealth !== 'AVAILABLE') throw new Error('Election not available on chain 97');
if (waitForOpen) {
  for (let attempt = 0; attempt < 120 && election.status === 'REGISTRATION'; attempt++) {
    if (Date.now() > Number(election.endTimestamp) * 1000) throw new Error('Voting window expired');
    const delay = Math.min(15000, Math.max(1000, Number(election.startTimestamp) * 1000 + 2000 - Date.now()));
    await new Promise(resolve => setTimeout(resolve, delay));
    const refreshed = await request('maci/elections', 'GET', undefined, undefined, admin.cookie);
    election = (refreshed.data as unknown as Election[]).find(item => item.id === id);
    if (!election || election.chainId !== '97' || election.chainHealth !== 'AVAILABLE') throw new Error('Election chain became unavailable');
  }
}
if (!prepareOnly && election.status === 'REGISTRATION') {
  const opened = await request(`maci/admin/elections/${id}/status`, 'POST', { status: 'OPEN' }, undefined, admin.cookie);
  if (opened.data.status !== 'OPEN') throw new Error('Election did not open');
} else if (!prepareOnly && election.status !== 'OPEN') throw new Error(`Election state ${election.status}`);
if (prepareOnly && !['REGISTRATION', 'OPEN'].includes(election.status)) throw new Error('Joining proof preparation window closed');
const provider = new JsonRpcProvider(process.env.MACI_RPC_URL!, 97, { batchMaxCount: 1 });
if (Number((await provider.getNetwork()).chainId) !== 97) throw new Error('RPC chain mismatch');
const reader = new VoidSigner('0x0000000000000000000000000000000000000001', provider);
const maci = MACI__factory.connect(election.maciAddress, reader);
const joinAbi = [{ type: 'function', name: 'joinPoll', stateMutability: 'nonpayable', inputs: [
  { name: '_nullifier', type: 'uint256' }, { name: '_publicKey', type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] },
  { name: '_stateRootIndex', type: 'uint256' }, { name: '_proof', type: 'uint256[8]' },
  { name: '_signUpPolicyData', type: 'bytes' }, { name: '_initialVoiceCreditProxyData', type: 'bytes' },
], outputs: [] }] as const;
const joinVerifyAbi = [{ type: 'function', name: 'verifyJoiningPollProof', stateMutability: 'view', inputs: [
  { name: '_nullifier', type: 'uint256' }, { name: '_index', type: 'uint256' },
  { name: '_publicKey', type: 'tuple', components: [{ name: 'x', type: 'uint256' }, { name: 'y', type: 'uint256' }] },
  { name: '_proof', type: 'uint256[8]' },
], outputs: [{ type: 'bool' }] }] as const;
const wasm = path.resolve('apps/voter-web/public/maci/v3.0.0/PollJoining_14.wasm');
const zkey = path.resolve('apps/voter-web/public/maci/v3.0.0/polljoining_14.zkey');
for (const voter of voters) {
  const key = String(voter.index);
  evidence[key] ??= {};
  const pair = new Keypair(PrivateKey.deserialize(voter.secret));
  if (!evidence[key].join) {
    const stateIndex = await maci.getStateIndex(pair.publicKey.hash());
    const inputs = await getPollJoiningCircuitEvents({ maciContract: maci, stateIndex,
      pollId: BigInt(election.pollId), userMaciPrivateKey: pair.privateKey, signer: reader,
      startBlock: Number(election.deploymentBlock), blocksPerBatch: 200 });
    const rootIndex = (await maci.totalSignups()) - 1n;
    const nullifier = poseidon([BigInt(pair.privateKey.asCircuitInputs()), BigInt(election.pollId)]);
    const { proof } = await groth16.fullProve(inputs, wasm, zkey);
    const coordinates = [proof.pi_a[0], proof.pi_a[1], proof.pi_b[0][1], proof.pi_b[0][0],
      proof.pi_b[1][1], proof.pi_b[1][0], proof.pi_c[0], proof.pi_c[1]].map(value => BigInt(value).toString());
    const body = { nullifier: nullifier.toString(), publicKey: {
      x: pair.publicKey.raw[0].toString(), y: pair.publicKey.raw[1].toString() },
      stateRootIndex: rootIndex.toString(), proof: coordinates };
    const calldata = encodeFunctionData({ abi: joinAbi, functionName: 'joinPoll', args: [nullifier,
      { x: pair.publicKey.raw[0], y: pair.publicKey.raw[1] }, rootIndex,
      coordinates.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint], '0x', '0x'] });
    const idempotencyKey = keccak256(encodePacked(['uint256', 'address', 'bytes32'],
      [97n, election.pollAddress as Address, keccak256(calldata)]));
    evidence[key].join = { body, idempotencyKey };
    save();
  }
  if (prepareOnly) {
    const prepared = evidence[key].join!.body as { nullifier: string; stateRootIndex: string;
      publicKey: { x: string; y: string }; proof: string[] };
    const data = encodeFunctionData({ abi: joinVerifyAbi, functionName: 'verifyJoiningPollProof',
      args: [BigInt(prepared.nullifier), BigInt(prepared.stateRootIndex),
        { x: BigInt(prepared.publicKey.x), y: BigInt(prepared.publicKey.y) },
        prepared.proof.map(BigInt) as [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint]] });
    const result = await provider.call({ to: election.pollAddress, data });
    if (!decodeFunctionResult({ abi: joinVerifyAbi, functionName: 'verifyJoiningPollProof', data: result as `0x${string}` })) throw new Error('Prepared join proof failed on-chain verifier');
    process.stdout.write(JSON.stringify({ voter: voter.index, joinProofPrepared: true, onChainVerifier: true }) + '\n');
    continue;
  }
  const join = evidence[key].join!;
  if (!join.id || !join.pollStateIndex) {
    const submitted = await request(`maci/elections/${id}/joins`, 'POST', join.body, join.idempotencyKey);
    join.id = String(submitted.data.id);
    save();
  }
  for (let attempt = 0; attempt < 60 && !join.pollStateIndex; attempt++) {
    const status = await request(`maci/joins/${join.id}`);
    if (status.data.status === 'FAILED') throw new Error('Join transaction failed');
    join.transactionHash = status.data.transactionHash ? String(status.data.transactionHash) : undefined;
    join.pollStateIndex = status.data.pollStateIndex ? String(status.data.pollStateIndex) : undefined;
    save();
    if (!join.pollStateIndex) await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (!join.pollStateIndex) throw new Error('Join not confirmed');
  process.stdout.write(JSON.stringify({ voter: voter.index, joinTransactionHash: join.transactionHash,
    pollStateIndex: join.pollStateIndex }) + '\n');
  if (!evidence[key].vote) {
    const encrypted = encryptMaciVote({ secret: voter.secret, pollId: election.pollId,
      pollStateIndex: join.pollStateIndex, candidateIndex: voter.index, nonce: 1,
      coordinatorKeyX: election.coordinatorKeyX, coordinatorKeyY: election.coordinatorKeyY,
      voteOptions: election.voteOptions, chainId: election.chainId, pollAddress: election.pollAddress });
    evidence[key].vote = { body: { data: encrypted.message.data,
      encryptionPublicKey: encrypted.encryptionPublicKey }, idempotencyKey: encrypted.idempotencyKey };
    save();
  }
  const vote = evidence[key].vote!;
  if (!vote.id || !vote.transactionHash) {
    const submitted = await request(`maci/elections/${id}/messages`, 'POST', vote.body, vote.idempotencyKey);
    vote.id = String(submitted.data.id);
    save();
  }
  let included = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    const status = await request(`maci/messages/${vote.id}`);
    if (status.data.status === 'FAILED') throw new Error('Encrypted command transaction failed');
    vote.transactionHash = status.data.transactionHash ? String(status.data.transactionHash) : undefined;
    save();
    if (status.data.status === 'INCLUDED') { included = true; break; }
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  if (!included || !vote.transactionHash) throw new Error('Encrypted command not confirmed on chain');
  process.stdout.write(JSON.stringify({ voter: voter.index, voteTransactionHash: vote.transactionHash }) + '\n');
}
provider.destroy();
await cleanThreads();

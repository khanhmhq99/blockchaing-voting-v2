// Explicit synthetic configuration anchor for an existing local MACI deployment.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { JsonRpcProvider, Wallet, keccak256 } from 'ethers';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith('--') || !process.argv[i + 1]) throw new Error('Invalid arguments');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!args.deployment || !args.out || !args['candidate-ids']) throw new Error('Usage: node scripts/anchor-mvp4-local.mjs --deployment <deployment.json> --candidate-ids <id,id,...> --out <config.json> [--election-id <uuid>]');
if (args['election-id'] && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args['election-id'])) throw new Error('Invalid election ID');
const deployment = JSON.parse(fs.readFileSync(path.resolve(args.deployment), 'utf8'));
const ids = args['candidate-ids'].split(',');
if (deployment.chainId !== 31337 || !Array.isArray(deployment.candidates) || ids.length !== deployment.candidates.length || new Set(ids).size !== ids.length || ids.some(id => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))) throw new Error('Invalid local deployment or candidate identifiers');
const rpcUrl = process.env.MACI_RPC_URL;
const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
if (rpcUrl !== 'http://127.0.0.1:8545' || !/^0x[0-9a-fA-F]{64}$/.test(signerKey ?? '')) throw new Error('Local RPC or synthetic signer is unavailable');
const provider = new JsonRpcProvider(rpcUrl);
if (Number((await provider.getNetwork()).chainId) !== 31337) throw new Error('Refusing a nonlocal chain');
const wallet = new Wallet(signerKey, provider);
const latest = await provider.getBlock('latest');
if (BigInt(latest.timestamp) >= BigInt(deployment.startTimestamp)) throw new Error('Poll has already started; no retrospective anchor');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
async function fileHash(file) {
  const hasher = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hasher.update(chunk);
  return hasher.digest('hex');
}
const artifactRoot = path.resolve('research/mvp3/maci/artifacts');
const circuitRoot = path.resolve('research/mvp3/maci/probe-output/circuits');
const artifactFiles = [
  path.join(artifactRoot, 'messageprocessorfull_14-25-3.zkey'),
  path.join(artifactRoot, 'votetallynonqv_14-5-3.zkey'),
  path.join(circuitRoot, 'MessageProcessorFull_14-25-3_js/MessageProcessorFull_14-25-3.wasm'),
  path.join(circuitRoot, 'VoteTallyNonQv_14-5-3_js/VoteTallyNonQv_14-5-3.wasm'),
];
const artifactHashes = {};
for (const file of artifactFiles) artifactHashes[path.basename(file)] = await fileHash(file);
const codeHashes = {};
for (const [name, address] of Object.entries({ maci: deployment.maciAddress, poll: deployment.pollAddress, messageProcessor: deployment.messageProcessorAddress, tally: deployment.tallyAddress })) {
  const code = await provider.getCode(address);
  if (code === '0x') throw new Error('Missing deployed contract code');
  codeHashes[name] = keccak256(code);
}
const config = {
  format: 'maci-election-config-v1', candidateBinding: 'onchain-pre-election-hash-v1',
  electionId: args['election-id'] ?? randomUUID(), protocol: deployment.protocol, chainId: String(deployment.chainId),
  maciAddress: deployment.maciAddress, pollAddress: deployment.pollAddress, pollId: deployment.pollId,
  deploymentBlock: String(deployment.deploymentBlock),
  coordinatorKeyX: deployment.coordinatorPublicKey.x, coordinatorKeyY: deployment.coordinatorPublicKey.y,
  startTimestamp: String(deployment.startTimestamp), endTimestamp: String(deployment.endTimestamp),
  voteOptions: deployment.candidates.length,
  candidates: deployment.candidates.map((name, optionIndex) => ({ id: ids[optionIndex], optionIndex, name })),
  artifactHashes, codeHashes,
};
const baseHash = sha(Buffer.from(`${canonical(config)}\n`, 'utf8'));
const transaction = await wallet.sendTransaction({ to: wallet.address, value: 0n, data: `0x${baseHash}` });
const receipt = await transaction.wait();
const block = await provider.getBlock(receipt.blockNumber);
if (receipt.status !== 1 || BigInt(block.timestamp) >= BigInt(config.startTimestamp)) throw new Error('Anchor failed or was included after poll start');
config.anchor = { transactionHash: transaction.hash, sender: wallet.address };
const bytes = `${canonical(config)}\n`;
fs.writeFileSync(path.resolve(args.out), bytes, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ electionId: config.electionId, chainId: 31337, anchorTransactionHash: transaction.hash, anchorBlock: receipt.blockNumber, anchorTimestamp: block.timestamp, pollStartTimestamp: config.startTimestamp, baseSha256: baseHash, canonicalSha256: sha(Buffer.from(bytes, 'utf8')), configPath: path.resolve(args.out) })}\n`);

// Explicit synthetic configuration anchor for a verified MACI deployment.
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { JsonRpcProvider, Wallet, keccak256 } from 'ethers';
import { MaciDeploymentJournal, acquireDeploymentSignerLock } from './maci-deployment-journal.mjs';

const args = {};
for (let i = 2; i < process.argv.length; i += 2) {
  if (!process.argv[i]?.startsWith('--') || !process.argv[i + 1]) throw new Error('Invalid arguments');
  args[process.argv[i].slice(2)] = process.argv[i + 1];
}
if (!args.deployment || !args.out || !args['candidate-ids']) throw new Error('Usage: node scripts/anchor-mvp4-local.mjs --deployment <deployment.json> --candidate-ids <id,id,...> --out <config.json> [--election-id <uuid>]');
const outputFile = path.resolve(args.out);
if (fs.existsSync(outputFile)) throw new Error('Candidate configuration already exists; reconcile its anchor instead of replaying');
if (args['election-id'] && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(args['election-id'])) throw new Error('Invalid election ID');
const deployment = JSON.parse(fs.readFileSync(path.resolve(args.deployment), 'utf8'));
const ids = args['candidate-ids'].split(',');
if (![31337, 97].includes(deployment.chainId) || (process.env.CHAIN_ID && process.env.CHAIN_ID !== String(deployment.chainId)) || (deployment.chainId === 97 && process.env.CHAIN_ID !== '97') || !Array.isArray(deployment.candidates) || ids.length !== deployment.candidates.length || new Set(ids).size !== ids.length || ids.some(id => !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(id))) throw new Error('Invalid deployment, chain or candidate identifiers');
if (deployment.chainId === 97 && process.env.MACI_BSC_TESTNET_ENABLED !== 'true') throw new Error('BSC Testnet transactions require MACI_BSC_TESTNET_ENABLED=true');
const rpcUrl = process.env.MACI_RPC_URL;
const signerKey = process.env.DEPLOYER_PRIVATE_KEY;
let validRpc = false;
try {
  const parsed = new URL(rpcUrl);
  const local = parsed.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/' && !parsed.search;
  const testnet = parsed.protocol === 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(parsed.hostname);
  validRpc = !parsed.username && !parsed.password && !parsed.hash && (deployment.chainId === 31337 ? local : testnet);
} catch { /* Reject malformed RPC URLs. */ }
if (!validRpc || !/^0x[0-9a-fA-F]{64}$/.test(signerKey ?? '')) throw new Error('Deployment RPC or signer is unavailable');
const provider = new JsonRpcProvider(rpcUrl, undefined, { batchMaxCount: 1 });
if (Number((await provider.getNetwork()).chainId) !== deployment.chainId) throw new Error('RPC chain mismatch');
if (deployment.genesisHash && (await provider.getBlock(0)).hash.toLowerCase() !== deployment.genesisHash.toLowerCase()) throw new Error('Deployment chain fingerprint mismatch');
const wallet = new Wallet(signerKey, provider);
const latest = await provider.getBlock('latest');
const journalFile = `${outputFile}.journal.json`;
if (BigInt(latest.timestamp) >= BigInt(deployment.startTimestamp) && !fs.existsSync(journalFile)) throw new Error('Poll has already started; no retrospective anchor');
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
const intentFile = `${outputFile}.intent.json`;
let electionId = args['election-id'] ?? randomUUID();
if (fs.existsSync(intentFile)) {
  const saved = JSON.parse(fs.readFileSync(intentFile, 'utf8'));
  if (args['election-id'] && saved.electionId !== args['election-id']) throw new Error('Candidate anchor election ID changed');
  electionId = saved.electionId;
} else {
  const fd = fs.openSync(intentFile, 'wx', 0o600);
  try { fs.writeFileSync(fd, `${JSON.stringify({ electionId })}\n`); fs.fsyncSync(fd); }
  finally { fs.closeSync(fd); }
}
const config = {
  format: 'maci-election-config-v1', candidateBinding: 'onchain-pre-election-hash-v1',
  electionId, protocol: deployment.protocol, chainId: String(deployment.chainId),
  ...(deployment.genesisHash ? { genesisHash: deployment.genesisHash } : {}),
  maciAddress: deployment.maciAddress, pollAddress: deployment.pollAddress, pollId: deployment.pollId,
  deploymentBlock: String(deployment.deploymentBlock),
  coordinatorKeyX: deployment.coordinatorPublicKey.x, coordinatorKeyY: deployment.coordinatorPublicKey.y,
  startTimestamp: String(deployment.startTimestamp), endTimestamp: String(deployment.endTimestamp),
  voteOptions: deployment.candidates.length,
  candidates: deployment.candidates.map((name, optionIndex) => ({ id: ids[optionIndex], optionIndex, name })),
  artifactHashes, codeHashes,
};
const baseHash = sha(Buffer.from(`${canonical(config)}\n`, 'utf8'));
const confirmations = Number(process.env.CHAIN_CONFIRMATIONS ?? (deployment.chainId === 97 ? 3 : 1));
if (!Number.isSafeInteger(confirmations) || confirmations < 1 || confirmations > 100) throw new Error('Invalid anchor confirmation count');
const maxGasPriceWei = deployment.chainId === 97 ? process.env.MACI_DEPLOYMENT_MAX_GAS_PRICE_WEI : undefined;
if (deployment.chainId === 97 && !/^[1-9][0-9]*$/.test(maxGasPriceWei ?? '')) throw new Error('BSC anchor gas price limit is required');
const genesisHash = (await provider.getBlock(0)).hash;
const releaseSignerLock = acquireDeploymentSignerLock(path.resolve('research/mvp3/maci/probe-output/deployment-locks'), deployment.chainId, genesisHash, wallet.address);
try {
  const localFault = process.env.MACI_LOCAL_ANCHOR_FAULT_AFTER_BROADCAST;
  if (localFault && deployment.chainId !== 31337) throw new Error('Anchor fault injection is local-only');
  const journal = new MaciDeploymentJournal({ file: journalFile, chainId: deployment.chainId, genesisHash,
    runId: deployment.runId, signerAddress: wallet.address, configuration: config, confirmations, provider, wallet,
    onBroadcast: localFault ? () => process.exit(86) : undefined,
    maxGasPriceWei, maxCostWei: deployment.chainId === 97 ? '1000000000000000' : undefined });
  if (BigInt(latest.timestamp) >= BigInt(deployment.startTimestamp) && journal.record.entries.length === 0) throw new Error('Poll started before any anchor transaction was signed');
  wallet.sendTransaction = request => journal.send(request);
  journal.setStage('candidate-anchor');
  const transaction = await wallet.sendTransaction({ to: wallet.address, value: 0n, data: `0x${baseHash}` });
  const receipt = await transaction.wait();
  await journal.confirmAll();
  const block = await provider.getBlock(receipt.blockNumber);
  if (receipt.status !== 1 || BigInt(block.timestamp) >= BigInt(config.startTimestamp)) throw new Error('Anchor failed or was included after poll start');
  config.anchor = { transactionHash: transaction.hash, sender: wallet.address };
  const bytes = `${canonical(config)}\n`;
  fs.writeFileSync(outputFile, bytes, { flag: 'wx' });
  process.stdout.write(`${JSON.stringify({ electionId: config.electionId, chainId: deployment.chainId, anchorTransactionHash: transaction.hash, anchorBlock: receipt.blockNumber, anchorTimestamp: block.timestamp, pollStartTimestamp: config.startTimestamp, baseSha256: baseHash, canonicalSha256: sha(Buffer.from(bytes, 'utf8')), configPath: outputFile })}\n`);
} finally { releaseSignerLock(); }

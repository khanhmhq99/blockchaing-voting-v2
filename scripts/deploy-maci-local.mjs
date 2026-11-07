// Explicit synthetic MACI v3 deployment to Hardhat Local or BSC Testnet.
// The configured chain, RPC and signer are checked before any transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { MaciDeploymentJournal, acquireDeploymentSignerLock } from './maci-deployment-journal.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/deploy-maci-local.mjs <synthetic-poll-config.json>');
const config = JSON.parse(fs.readFileSync(path.resolve(configFile), 'utf8'));
const now = Math.floor(Date.now() / 1000);
if (!config || !/^[a-z0-9_-]{1,64}$/.test(config.runId) || ![31337, 97].includes(config.chainId) || (process.env.CHAIN_ID && String(config.chainId) !== process.env.CHAIN_ID) || (config.chainId === 97 && process.env.CHAIN_ID !== '97') || !Array.isArray(config.candidates) || config.candidates.length < 2 || config.candidates.length > 125 || config.candidates.some(name => typeof name !== 'string' || name.trim().length < 1 || name.length > 120) || !Number.isSafeInteger(config.startTimestamp) || !Number.isSafeInteger(config.endTimestamp) || config.startTimestamp <= now + 60 || config.endTimestamp <= config.startTimestamp + 120) {
  throw new Error('Invalid synthetic MACI poll configuration, chain or voting window');
}
if (config.chainId === 97 && process.env.MACI_BSC_TESTNET_ENABLED !== 'true') throw new Error('BSC Testnet transactions require MACI_BSC_TESTNET_ENABLED=true');
const rpcUrl = process.env.MACI_RPC_URL || process.env.RPC_URL;
const rpc = rpcUrl && new URL(rpcUrl);
const localRpc = rpc && rpc.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(rpc.hostname) && rpc.pathname === '/' && !rpc.search;
const testnetRpc = rpc && rpc.protocol === 'https:' && !['127.0.0.1', 'localhost', '[::1]'].includes(rpc.hostname);
if (!rpc || rpc.username || rpc.password || rpc.hash || (config.chainId === 31337 ? !localRpc : !testnetRpc)) throw new Error('MACI deployment RPC does not match the selected network');
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const issuerKey = process.env.MACI_ISSUER_PRIVATE_KEY;
const registrationKey = process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY;
const joinKey = process.env.MACI_JOIN_RELAYER_PRIVATE_KEY;
const messageKey = process.env.MACI_RELAYER_PRIVATE_KEY;
const coordinatorKey = process.env.MACI_COORDINATOR_PRIVATE_KEY;
const coordinatorPublic = process.env.MACI_COORDINATOR_PUBLIC_KEY;
const evmKeys = [deployerKey, issuerKey, registrationKey, joinKey, messageKey];
if (!rpcUrl || evmKeys.some(key => !/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) || new Set(evmKeys.map(key => key.toLowerCase())).size !== evmKeys.length || (!coordinatorPublic && !/^macisk\.[0-9a-fA-F]{64}$/.test(coordinatorKey ?? ''))) {
  throw new Error('Separate deployment signers and a MACI coordinator public key are required');
}
const output = path.join(root, 'research/mvp3/maci/probe-output/deployments', config.runId);
if (fs.existsSync(output) && (!fs.existsSync(path.join(output, 'journal.json')) || fs.existsSync(path.join(output, 'deployment.json')))) throw new Error('Deployment run ID already exists without a resumable journal; preserve its evidence');
fs.mkdirSync(output, { recursive: true });
process.chdir(output);
process.env.HARDHAT_CONFIG = path.join(root, 'research/mvp3/maci/hardhat-persistent.config.cjs');
process.env.HARDHAT_NETWORK = config.chainId === 31337 ? 'persistentLocal' : 'bscTestnet';
const isolated = path.join(root, 'research/mvp3/maci/runtime-env/node_modules');
const hardhat = require(path.join(isolated, '@maci-protocol/contracts/node_modules/hardhat'));
const sdk = require(path.join(isolated, '@maci-protocol/sdk'));
const domainobjs = require(path.join(isolated, '@maci-protocol/domainobjs'));
const contracts = require(path.join(isolated, '@maci-protocol/contracts'));
const { Keypair, PrivateKey, PublicKey, VerifyingKey } = domainobjs;
const { ContractFactory, JsonRpcProvider, Wallet } = hardhat.ethers;
const artifactDir = path.join(root, 'research/mvp3/maci/artifacts');
const expectedVkeys = {
  'polljoining_14.vkey.json': '1e8cdee3cb302f0baa07af6afbac20793e62b15db4370cc16076ab8edbb8b576',
  'polljoined_14.vkey.json': 'c6b0e53aa98f8fbee90e10d117dcaae675fbf8ab96c852f5fc29d006e16d3574',
  'messageprocessorfull_14-25-3.vkey.json': '7494b3a79a5a47655420537d57759b3e57c7c7cd207ec5c41a68bf725d74d2d2',
  'votetallynonqv_14-5-3.vkey.json': '76176f0ced3da8ad4045860087c50316f223b90e81b78050515ea666aba05ee5',
};
function vkey(name) {
  const filename = `${name}.vkey.json`;
  const content = fs.readFileSync(path.join(artifactDir, filename));
  if (createHash('sha256').update(content).digest('hex') !== expectedVkeys[filename]) throw new Error(`VKey hash mismatch: ${filename}`);
  return VerifyingKey.fromObj(JSON.parse(content.toString('utf8')));
}
function localArtifact(name) {
  const artifact = JSON.parse(fs.readFileSync(path.join(root, 'packages/contracts/generated', `${name}.json`), 'utf8'));
  if (!Array.isArray(artifact.abi) || !/^0x[0-9a-f]+$/i.test(artifact.bytecode)) throw new Error(`Compile ${name} before deployment`);
  return artifact;
}
function save(stage, detail) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'checkpoint.json'), `${JSON.stringify({ stage, ...detail }, null, 2)}\n`);
  process.stdout.write(`MACI deployment: ${stage}\n`);
}
let releaseSignerLock;
async function main() {
  const provider = new JsonRpcProvider(rpcUrl, config.chainId, { batchMaxCount: 1 });
  if (Number((await provider.getNetwork()).chainId) !== config.chainId || Number(BigInt(await provider.send('eth_chainId', []))) !== config.chainId) throw new Error('RPC chain mismatch');
  const [hardhatDeployer] = await hardhat.ethers.getSigners();
  const deployerAddress = await hardhatDeployer.getAddress();
  if (deployerAddress.toLowerCase() !== new Wallet(deployerKey).address.toLowerCase()) throw new Error('Hardhat deployer key mismatch');
  if (config.chainId === 97 && await provider.getBalance(deployerAddress) === 0n) throw new Error('BSC Testnet deployer has no tBNB');
  const issuer = new Wallet(issuerKey, provider);
  const registrationSponsor = new Wallet(registrationKey, provider);
  const joinSponsor = new Wallet(joinKey, provider);
  const messageSponsor = new Wallet(messageKey, provider);
  const coordinatorKeyObject = coordinatorPublic ? PublicKey.deserialize(coordinatorPublic) : new Keypair(PrivateKey.deserialize(coordinatorKey)).publicKey;
  if (coordinatorKey && coordinatorPublic && new Keypair(PrivateKey.deserialize(coordinatorKey)).publicKey.serialize() !== coordinatorPublic) throw new Error('Coordinator public/private key mismatch');
  const genesisHash = (await provider.getBlock(0)).hash;
  releaseSignerLock = acquireDeploymentSignerLock(path.join(root, 'research/mvp3/maci/probe-output/deployment-locks'), config.chainId, genesisHash, deployerAddress);
  const confirmations = Number(process.env.CHAIN_CONFIRMATIONS ?? (config.chainId === 97 ? 3 : 1));
  if (!Number.isSafeInteger(confirmations) || confirmations < 1 || confirmations > 100) throw new Error('Invalid deployment confirmation count');
  const maxGasPriceWei = config.chainId === 97 ? process.env.MACI_DEPLOYMENT_MAX_GAS_PRICE_WEI : undefined;
  const maxCostWei = config.chainId === 97 ? process.env.MACI_DEPLOYMENT_MAX_COST_WEI : undefined;
  if (config.chainId === 97 && (!/^[1-9][0-9]*$/.test(maxGasPriceWei ?? '') || !/^[1-9][0-9]*$/.test(maxCostWei ?? ''))) throw new Error('BSC deployment fee limits are required');
  const deployer = new Wallet(deployerKey, provider);
  const localFaultIndex = process.env.MACI_LOCAL_FAULT_AFTER_BROADCAST;
  if (localFaultIndex && (config.chainId !== 31337 || !/^\d+$/.test(localFaultIndex))) throw new Error('Invalid local-only deployment fault injection');
  const journal = new MaciDeploymentJournal({
    file: path.join(output, 'journal.json'), chainId: config.chainId, genesisHash, runId: config.runId,
    signerAddress: deployerAddress, configuration: config, confirmations, provider, wallet: deployer,
    onBroadcast: localFaultIndex === undefined ? undefined : index => { if (index === Number(localFaultIndex)) process.exit(86); },
    maxGasPriceWei, maxCostWei,
  });
  deployer.sendTransaction = transaction => journal.send(transaction);
  journal.setStage('policies');
  const registration = await new ContractFactory(localArtifact('SponsoredMaciRegistration').abi, localArtifact('SponsoredMaciRegistration').bytecode, deployer).deploy(issuer.address);
  await registration.waitForDeployment();
  const joinPolicy = await new ContractFactory(localArtifact('OpenMaciPollJoinPolicy').abi, localArtifact('OpenMaciPollJoinPolicy').bytecode, deployer).deploy();
  await joinPolicy.waitForDeployment();
  save('policies-deployed', { registrationAddress: await registration.getAddress(), joinPolicyAddress: await joinPolicy.getAddress() });
  journal.setStage('maci');
  const maci = await sdk.deployMaci({ stateTreeDepth: 14, signupPolicyAddress: await registration.getAddress(), signer: deployer });
  const registrationTarget = await registration.guarded();
  if (registrationTarget === '0x0000000000000000000000000000000000000000') await (await registration.setTarget(maci.maciContractAddress)).wait();
  else if (registrationTarget.toLowerCase() !== maci.maciContractAddress.toLowerCase()) throw new Error('MACI registration target mismatch');
  save('maci-deployed', { maciAddress: maci.maciContractAddress, verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress });
  journal.setStage('vkeys');
  if (journal.record.entries[journal.cursor]?.stage === 'vkeys') await journal.consumeConfirmed('vkeys');
  else await sdk.setVerifyingKeys({
    stateTreeDepth: 14, pollStateTreeDepth: 14, tallyProcessingStateTreeDepth: 5,
    voteOptionTreeDepth: 3, messageBatchSize: 25,
    pollJoiningVerifyingKey: vkey('polljoining_14'), pollJoinedVerifyingKey: vkey('polljoined_14'),
    processMessagesVerifyingKeys: [vkey('messageprocessorfull_14-25-3')],
    tallyVotesVerifyingKeys: [vkey('votetallynonqv_14-5-3')], modes: [sdk.EMode.FULL],
    verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress, signer: deployer,
  });
  const onChainKeys = await sdk.getAllOnChainVerifyingKeys({
    verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress,
    stateTreeDepth: 14, tallyProcessingStateTreeDepth: 5, voteOptionTreeDepth: 3,
    messageBatchSize: 25, mode: sdk.EMode.FULL, signer: deployer,
  });
  if ([
    [onChainKeys.pollJoiningVerifyingKeyOnChain, 'polljoining_14'],
    [onChainKeys.pollJoinedVerifyingKeyOnChain, 'polljoined_14'],
    [onChainKeys.processVerifyingKeyOnChain, 'messageprocessorfull_14-25-3'],
    [onChainKeys.tallyVerifyingKeyOnChain, 'votetallynonqv_14-5-3'],
  ].some(([chainKey, name]) => !sdk.compareVerifyingKeys(chainKey, vkey(name)))) throw new Error('On-chain verifying key mismatch');
  save('verifying-keys-set', {});
  journal.setStage('poll');
  const poll = await sdk.deployPoll({
    maciAddress: maci.maciContractAddress,
    pollStartTimestamp: config.startTimestamp, pollEndTimestamp: config.endTimestamp,
    tallyProcessingStateTreeDepth: 5, voteOptionTreeDepth: 3, messageBatchSize: 25,
    stateTreeDepth: 14, coordinatorPublicKey: coordinatorKeyObject,
    mode: sdk.EMode.FULL, policyContractAddress: await joinPolicy.getAddress(),
    relayers: [joinSponsor.address, messageSponsor.address],
    voteOptions: config.candidates.length, initialVoiceCredits: 1, signer: deployer,
  });
  const maciContract = contracts.MACI__factory.connect(maci.maciContractAddress, provider);
  const deployedPoll = await maciContract.getPoll(poll.pollId);
  if (deployedPoll.poll.toLowerCase() !== poll.pollContractAddress.toLowerCase()) throw new Error('Deployed poll address mismatch');
  const pollContract = contracts.Poll__factory.connect(deployedPoll.poll, provider);
  const publicKey = await pollContract.coordinatorPublicKey();
  if (publicKey.x !== coordinatorKeyObject.raw[0] || publicKey.y !== coordinatorKeyObject.raw[1]) throw new Error('Coordinator binding mismatch');
  const transactions = (await journal.confirmAll()).map(entry => ({
    hash: entry.hash, nonce: entry.nonce, blockNumber: entry.receipt.blockNumber,
    blockHash: entry.receipt.blockHash, contractAddress: entry.receipt.contractAddress,
    gasUsed: entry.receipt.gasUsed, codeHash: entry.receipt.codeHash,
  }));
  const deployment = {
    protocol: 'maci-v3.0.0-full-v1', researchClassification: 'synthetic-prototype', chainId: config.chainId, genesisHash,
    runId: config.runId, title: config.title ?? 'Synthetic MACI election', candidates: config.candidates,
    deploymentBlock: transactions[0]?.blockNumber, maciAddress: maci.maciContractAddress,
    registrationAddress: await registration.getAddress(), joinPolicyAddress: await joinPolicy.getAddress(),
    pollId: poll.pollId.toString(), pollAddress: deployedPoll.poll,
    messageProcessorAddress: deployedPoll.messageProcessor, tallyAddress: deployedPoll.tally,
    coordinatorPublicKey: { x: publicKey.x.toString(), y: publicKey.y.toString() },
    startTimestamp: config.startTimestamp, endTimestamp: config.endTimestamp,
    sponsorAddresses: { registration: registrationSponsor.address, join: joinSponsor.address, message: messageSponsor.address },
    transactions,
  };
  fs.writeFileSync(path.join(output, 'deployment.json'), `${JSON.stringify(deployment, null, 2)}\n`);
  save('complete', { publicDeployment: path.join(output, 'deployment.json') });
}
main().catch(error => {
  const summary = String(error.shortMessage ?? error.message ?? error.code ?? 'unknown error').split('(transaction=')[0].slice(0, 500);
  const rpcCode = error.info?.error?.code ?? error.error?.code ?? null;
  const rpcMessage = String(error.info?.error?.message ?? error.error?.message ?? '').slice(0, 180);
  const rpcMethod = error.info?.payload?.method ?? error.payload?.method ?? null;
  process.stderr.write(`MACI deployment failed: ${summary}; code=${error.code ?? 'unknown'}; rpcCode=${rpcCode ?? 'none'}; rpcMethod=${rpcMethod ?? 'none'}; rpcMessage=${rpcMessage}\n`);
  process.exitCode = 1;
}).finally(async () => { releaseSignerLock?.(); await contracts.cleanThreads(); });

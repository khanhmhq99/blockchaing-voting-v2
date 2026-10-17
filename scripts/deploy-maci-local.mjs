// Explicit, synthetic-only MACI v3 deployment to a persistent local Hardhat RPC.
// This command never runs at API startup and refuses every chain except 31337.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const configFile = process.argv[2];
if (!configFile) throw new Error('Usage: node scripts/deploy-maci-local.mjs <synthetic-poll-config.json>');
const config = JSON.parse(fs.readFileSync(path.resolve(configFile), 'utf8'));
const now = Math.floor(Date.now() / 1000);
if (!config || !/^[a-z0-9_-]{1,64}$/.test(config.runId) || config.chainId !== 31337 || !Array.isArray(config.candidates) || config.candidates.length < 2 || config.candidates.length > 125 || config.candidates.some(name => typeof name !== 'string' || name.trim().length < 1 || name.length > 120) || !Number.isSafeInteger(config.startTimestamp) || !Number.isSafeInteger(config.endTimestamp) || config.startTimestamp <= now + 60 || config.endTimestamp <= config.startTimestamp + 120) {
  throw new Error('Invalid local synthetic MACI poll configuration or voting window');
}
const rpcUrl = process.env.MACI_RPC_URL || process.env.RPC_URL;
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const issuerKey = process.env.MACI_ISSUER_PRIVATE_KEY;
const registrationKey = process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY;
const joinKey = process.env.MACI_JOIN_RELAYER_PRIVATE_KEY;
const messageKey = process.env.MACI_RELAYER_PRIVATE_KEY;
const coordinatorKey = process.env.MACI_COORDINATOR_PRIVATE_KEY;
const evmKeys = [deployerKey, issuerKey, registrationKey, joinKey, messageKey];
if (!rpcUrl || evmKeys.some(key => !/^0x[0-9a-fA-F]{64}$/.test(key ?? '')) || new Set(evmKeys.map(key => key.toLowerCase())).size !== evmKeys.length || !/^macisk\.[0-9a-fA-F]{64}$/.test(coordinatorKey ?? '')) {
  throw new Error('Separate local deployer, issuer, registration, join, message and coordinator keys are required');
}
const output = path.join(root, 'research/mvp3/maci/probe-output/deployments', config.runId);
if (fs.existsSync(output)) throw new Error('Deployment run ID already exists; preserve its evidence');
fs.mkdirSync(output, { recursive: true });
process.chdir(output);
process.env.HARDHAT_CONFIG = path.join(root, 'research/mvp3/maci/hardhat-persistent.config.cjs');
process.env.HARDHAT_NETWORK = 'persistentLocal';
const isolated = path.join(root, 'research/mvp3/maci/runtime-env/node_modules');
const hardhat = require(path.join(isolated, '@maci-protocol/contracts/node_modules/hardhat'));
const sdk = require(path.join(isolated, '@maci-protocol/sdk'));
const domainobjs = require(path.join(isolated, '@maci-protocol/domainobjs'));
const contracts = require(path.join(isolated, '@maci-protocol/contracts'));
const { Keypair, PrivateKey, VerifyingKey } = domainobjs;
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
  if (!Array.isArray(artifact.abi) || !/^0x[0-9a-f]+$/i.test(artifact.bytecode)) throw new Error(`Compile ${name} before local deployment`);
  return artifact;
}
function save(stage, detail) {
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'checkpoint.json'), `${JSON.stringify({ stage, ...detail }, null, 2)}\n`);
  process.stdout.write(`MACI local deployment: ${stage}\n`);
}
async function main() {
  const provider = new JsonRpcProvider(rpcUrl, 31337);
  if (Number((await provider.getNetwork()).chainId) !== 31337) throw new Error('Refusing a non-local RPC chain');
  const [deployer] = await hardhat.ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  if (deployerAddress.toLowerCase() !== new Wallet(deployerKey).address.toLowerCase()) throw new Error('Hardhat deployer key mismatch');
  const issuer = new Wallet(issuerKey, provider);
  const registrationSponsor = new Wallet(registrationKey, provider);
  const joinSponsor = new Wallet(joinKey, provider);
  const messageSponsor = new Wallet(messageKey, provider);
  const coordinator = new Keypair(PrivateKey.deserialize(coordinatorKey));
  const firstBlock = await provider.getBlockNumber();
  const registration = await new ContractFactory(localArtifact('SponsoredMaciRegistration').abi, localArtifact('SponsoredMaciRegistration').bytecode, deployer).deploy(issuer.address);
  await registration.waitForDeployment();
  const joinPolicy = await new ContractFactory(localArtifact('OpenMaciPollJoinPolicy').abi, localArtifact('OpenMaciPollJoinPolicy').bytecode, deployer).deploy();
  await joinPolicy.waitForDeployment();
  save('policies-deployed', { registrationAddress: await registration.getAddress(), joinPolicyAddress: await joinPolicy.getAddress() });
  const maci = await sdk.deployMaci({ stateTreeDepth: 14, signupPolicyAddress: await registration.getAddress(), signer: deployer });
  const registrationTarget = await registration.guarded();
  if (registrationTarget === '0x0000000000000000000000000000000000000000') await (await registration.setTarget(maci.maciContractAddress)).wait();
  else if (registrationTarget.toLowerCase() !== maci.maciContractAddress.toLowerCase()) throw new Error('MACI registration target mismatch');
  save('maci-deployed', { maciAddress: maci.maciContractAddress, verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress });
  await sdk.setVerifyingKeys({
    stateTreeDepth: 14, pollStateTreeDepth: 14, tallyProcessingStateTreeDepth: 5,
    voteOptionTreeDepth: 3, messageBatchSize: 25,
    pollJoiningVerifyingKey: vkey('polljoining_14'), pollJoinedVerifyingKey: vkey('polljoined_14'),
    processMessagesVerifyingKeys: [vkey('messageprocessorfull_14-25-3')],
    tallyVotesVerifyingKeys: [vkey('votetallynonqv_14-5-3')], modes: [sdk.EMode.FULL],
    verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress, signer: deployer,
  });
  save('verifying-keys-set', {});
  const poll = await sdk.deployPoll({
    maciAddress: maci.maciContractAddress,
    pollStartTimestamp: config.startTimestamp, pollEndTimestamp: config.endTimestamp,
    tallyProcessingStateTreeDepth: 5, voteOptionTreeDepth: 3, messageBatchSize: 25,
    stateTreeDepth: 14, coordinatorPublicKey: coordinator.publicKey,
    mode: sdk.EMode.FULL, policyContractAddress: await joinPolicy.getAddress(),
    relayers: [joinSponsor.address, messageSponsor.address],
    voteOptions: config.candidates.length, initialVoiceCredits: 1, signer: deployer,
  });
  const maciContract = contracts.MACI__factory.connect(maci.maciContractAddress, provider);
  const deployedPoll = await maciContract.getPoll(poll.pollId);
  if (deployedPoll.poll.toLowerCase() !== poll.pollContractAddress.toLowerCase()) throw new Error('Deployed poll address mismatch');
  const pollContract = contracts.Poll__factory.connect(deployedPoll.poll, provider);
  const publicKey = await pollContract.coordinatorPublicKey();
  if (publicKey.x !== coordinator.publicKey.raw[0] || publicKey.y !== coordinator.publicKey.raw[1]) throw new Error('Coordinator binding mismatch');
  const lastBlock = await provider.getBlockNumber();
  const transactions = [];
  for (let number = firstBlock + 1; number <= lastBlock; number += 1) {
    const block = await provider.getBlock(number);
    for (const hash of block.transactions) {
      const tx = await provider.getTransaction(hash);
      if (tx?.from.toLowerCase() !== deployerAddress.toLowerCase()) continue;
      const receipt = await provider.getTransactionReceipt(hash);
      if (receipt?.status !== 1) throw new Error(`Deployment transaction failed: ${hash}`);
      transactions.push({ hash, blockNumber: number, contractAddress: receipt.contractAddress, gasUsed: receipt.gasUsed.toString() });
    }
  }
  const deployment = {
    protocol: 'maci-v3.0.0-full-v1', researchClassification: 'synthetic-prototype', chainId: 31337,
    runId: config.runId, title: config.title ?? 'Synthetic MACI election', candidates: config.candidates,
    deploymentBlock: firstBlock + 1, maciAddress: maci.maciContractAddress,
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
  process.stderr.write(`MACI local deployment failed: ${summary}\n`);
  process.exitCode = 1;
}).finally(async () => { await contracts.cleanThreads(); });

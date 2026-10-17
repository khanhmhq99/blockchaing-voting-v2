// One-shot local research election using MACI v3.0.0 and published ZKeys.
// Generated keys, witnesses, proofs, and results stay under ignored probe-output/.
const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const scratch = path.join(root, 'probe-output');
fs.mkdirSync(scratch, { recursive: true });
process.chdir(scratch);
process.env.HARDHAT_CONFIG = path.join(root, 'hardhat-local.config.cjs');
const envModules = path.join(root, 'runtime-env/node_modules');
const hardhat = require(path.join(envModules, '@maci-protocol/contracts/node_modules/hardhat'));
const sdk = require(path.join(envModules, '@maci-protocol/sdk'));
const { Keypair, VerifyingKey } = require(path.join(envModules, '@maci-protocol/domainobjs'));
const { generateRandomSalt } = require(path.join(envModules, '@maci-protocol/crypto'));
const contracts = require(path.join(envModules, '@maci-protocol/contracts'));
const { Verifier__factory } = require(path.join(envModules, '@maci-protocol/contracts/build/typechain-types'));

const artifacts = path.join(root, 'artifacts');
const circuits = path.join(root, 'probe-output/circuits');
const runId = process.env.MACI_M1_RUN_ID;
if (runId && !/^[a-z0-9_-]+$/.test(runId)) throw new Error('Invalid MACI_M1_RUN_ID');
const output = path.join(root, 'probe-output/local-m1', runId || '');
const zeroData = `0x${'00'.repeat(32)}`;
const pollId = 0n;
const selections = [0n, 1n, 1n];
const startedAt = performance.now();
const key = (name) => path.join(artifacts, `${name}.zkey`);
const wasm = (name) => path.join(circuits, `${name}_js`, `${name}.wasm`);
function checkpoint(stage, detail = {}) {
  fs.mkdirSync(output, { recursive: true });
  const record = JSON.stringify({
    stage, detail, elapsedMs: Math.round(performance.now() - startedAt),
    updatedAt: new Date().toISOString(),
  }, (_, value) => typeof value === 'bigint' ? value.toString() : value);
  fs.writeFileSync(path.join(output, 'checkpoint.json'), `${record}\n`);
  fs.appendFileSync(path.join(output, 'events.ndjson'), `${record}\n`);
  process.stdout.write(`M1 stage: ${stage}\n`);
}
function vk(name) {
  return VerifyingKey.fromObj(JSON.parse(fs.readFileSync(path.join(artifacts, `${name}.vkey.json`), 'utf8')));
}

async function main() {
  const [signer, ...sponsors] = await hardhat.ethers.getSigners();
  const gasUsed = { signup: 0n, join: 0n, publish: 0n };
  async function addGas(category, hash) {
    const receipt = await signer.provider.getTransactionReceipt(hash);
    if (!receipt) throw new Error(`Missing ${category} receipt`);
    gasUsed[category] += receipt.gasUsed;
  }
  const coordinator = new Keypair();
  const voters = selections.map(() => new Keypair());
  const [signupPolicy, , policyFactory, checkerFactory] = await sdk.deployFreeForAllSignUpPolicy({}, signer, true);
  const [pollPolicy] = await sdk.deployFreeForAllSignUpPolicy({ policy: policyFactory, checker: checkerFactory }, signer, true);
  const maci = await sdk.deployMaci({
    stateTreeDepth: 14,
    signupPolicyAddress: await signupPolicy.getAddress(),
    signer,
  });
  checkpoint('contracts-deployed', { maci: maci.maciContractAddress });

  await sdk.setVerifyingKeys({
    stateTreeDepth: 14,
    pollStateTreeDepth: 14,
    tallyProcessingStateTreeDepth: 5,
    voteOptionTreeDepth: 3,
    messageBatchSize: 25,
    pollJoiningVerifyingKey: vk('polljoining_14'),
    pollJoinedVerifyingKey: vk('polljoined_14'),
    processMessagesVerifyingKeys: [vk('messageprocessorfull_14-25-3')],
    tallyVotesVerifyingKeys: [vk('votetallynonqv_14-5-3')],
    modes: [sdk.EMode.FULL],
    verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress,
    signer,
  });
  const onChainKeys = await sdk.getAllOnChainVerifyingKeys({
    verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress,
    stateTreeDepth: 14,
    tallyProcessingStateTreeDepth: 5,
    voteOptionTreeDepth: 3,
    messageBatchSize: 25,
    mode: sdk.EMode.FULL,
    signer,
  });
  const keyPairs = [
    [onChainKeys.pollJoiningVerifyingKeyOnChain, 'polljoining_14'],
    [onChainKeys.pollJoinedVerifyingKeyOnChain, 'polljoined_14'],
    [onChainKeys.processVerifyingKeyOnChain, 'messageprocessorfull_14-25-3'],
    [onChainKeys.tallyVerifyingKeyOnChain, 'votetallynonqv_14-5-3'],
  ];
  if (keyPairs.some(([chainKey, name]) => !sdk.compareVerifyingKeys(chainKey, vk(name)))) {
    throw new Error('On-chain verification key mismatch');
  }
  checkpoint('verifying-keys-registered');

  const start = Math.floor(Date.now() / 1000) + 120;
  const end = start + 300;
  const poll = await sdk.deployPoll({
    maciAddress: maci.maciContractAddress,
    pollStartTimestamp: start,
    pollEndTimestamp: end,
    tallyProcessingStateTreeDepth: 5,
    voteOptionTreeDepth: 3,
    messageBatchSize: 25,
    stateTreeDepth: 14,
    coordinatorPublicKey: coordinator.publicKey,
    mode: sdk.EMode.FULL,
    policyContractAddress: await pollPolicy.getAddress(),
    relayers: [await signer.getAddress()],
    voteOptions: 3,
    initialVoiceCredits: 1,
    signer,
  });
  if (poll.pollId !== pollId) throw new Error('Unexpected poll ID');
  checkpoint('poll-deployed', { poll: poll.pollContractAddress });

  for (let i = 0; i < voters.length; i += 1) {
    const voter = voters[i];
    const signup = await sdk.signup({
      maciPublicKey: voter.publicKey.serialize(),
      maciAddress: maci.maciContractAddress,
      sgData: zeroData,
      signer: sponsors[i],
    });
    await addGas('signup', signup.transactionHash);
  }
  checkpoint('three-synthetic-signups', {
    count: voters.length, sponsorCount: voters.length, policy: 'free-for-all', gasUsed: gasUsed.signup,
  });
  await sdk.timeTravel({ seconds: 121, signer });

  const pollIndexes = [];
  for (let i = 0; i < voters.length; i += 1) {
    const voter = voters[i];
    const joined = await sdk.joinPoll({
      maciAddress: maci.maciContractAddress,
      privateKey: voter.privateKey.serialize(),
      pollId,
      pollJoiningZkey: key('polljoining_14'),
      pollJoiningWasm: wasm('PollJoining_14'),
      useWasm: true,
      sgDataArg: zeroData,
      ivcpDataArg: zeroData,
      signer: sponsors[i],
    });
    if (BigInt(joined.voiceCredits) !== 1n) throw new Error('Expected one voice credit');
    pollIndexes.push(BigInt(joined.pollStateIndex));
    await addGas('join', joined.hash);
  }
  checkpoint('three-synthetic-joins', { count: pollIndexes.length, gasUsed: gasUsed.join });

  for (let i = 0; i < voters.length; i += 1) {
    const published = await sdk.publish({
      publicKey: voters[i].publicKey.serialize(),
      stateIndex: pollIndexes[i],
      voteOptionIndex: selections[i],
      nonce: 1n,
      pollId,
      newVoteWeight: 1n,
      maciAddress: maci.maciContractAddress,
      salt: generateRandomSalt(),
      privateKey: voters[i].privateKey.serialize(),
      signer,
    });
    await addGas('publish', published.hash);
  }
  checkpoint('three-encrypted-commands-published', { count: voters.length, gasUsed: gasUsed.publish });

  await sdk.timeTravel({ seconds: 301, signer });
  await sdk.mergeSignups({ pollId, maciAddress: maci.maciContractAddress, signer });
  checkpoint('signups-merged');

  const proofs = await sdk.generateProofs({
    outputDir: path.join(output, 'proofs'),
    tallyFile: path.join(output, 'tally.json'),
    voteTallyZkey: key('votetallynonqv_14-5-3'),
    messageProcessorZkey: key('messageprocessorfull_14-25-3'),
    pollId,
    coordinatorPrivateKey: coordinator.privateKey.serialize(),
    messageProcessorWasm: wasm('MessageProcessorFull_14-25-3'),
    voteTallyWasm: wasm('VoteTallyNonQv_14-5-3'),
    useWasm: true,
    mode: sdk.EMode.FULL,
    maciAddress: maci.maciContractAddress,
    signer,
  });
  checkpoint('processing-and-tally-proofs-generated');
  const proofStartBlock = await signer.provider.getBlockNumber();
  await sdk.proveOnChain({
    pollId,
    proofDir: path.join(output, 'proofs'),
    tallyFile: path.join(output, 'tally.json'),
    maciAddress: maci.maciContractAddress,
    signer,
  });
  const proofEndBlock = await signer.provider.getBlockNumber();
  let proofGasUsed = 0n;
  for (let blockNumber = proofStartBlock + 1; blockNumber <= proofEndBlock; blockNumber += 1) {
    const block = await signer.provider.getBlock(blockNumber);
    if (!block) throw new Error('Missing proof block');
    proofGasUsed += block.gasUsed;
  }
  checkpoint('processing-and-tally-proofs-on-chain', { gasUsed: proofGasUsed });

  const processRecord = JSON.parse(fs.readFileSync(path.join(output, 'proofs/process_0.json'), 'utf8'));
  const processProof = contracts.formatProofForVerifierContract(processRecord.proof);
  const processInputs = processRecord.publicInputs.map(value => BigInt(value));
  const verifier = Verifier__factory.connect(maci.verifierContractAddress, signer);
  const processKey = vk('messageprocessorfull_14-25-3').asContractParam();
  if (!await verifier.verify(processProof, processKey, processInputs)) {
    throw new Error('Local Solidity verifier rejected valid processing proof');
  }
  const alteredInputs = [...processInputs];
  alteredInputs[0] += 1n;
  let invalidRejected = false;
  try {
    invalidRejected = !await verifier.verify(processProof, processKey, alteredInputs);
  } catch {
    invalidRejected = true;
  }
  if (!invalidRejected) throw new Error('Local Solidity verifier accepted altered public input');
  checkpoint('altered-processing-input-rejected');

  const tally = proofs.tallyData;
  const commitments = sdk.generateTallyCommitments({ tallyData: tally, voteOptionTreeDepth: 3 });
  const verified = await sdk.verify({
    pollId,
    tallyData: tally,
    tallyCommitments: commitments,
    totalVoteOptions: tally.results.tally.length,
    voteOptionTreeDepth: 3,
    signer,
  });
  const result = tally.results.tally.map(value => BigInt(value));
  if (!verified || result[0] !== 1n || result[1] !== 2n || result[2] !== 0n) {
    throw new Error('Verified tally differs from synthetic selections');
  }
  checkpoint('complete', { verified, expected: [1, 2, 0], actual: result.slice(0, 3) });
}

main().catch(error => {
  process.stderr.write(`M1 failed: ${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => { await contracts.cleanThreads(); });

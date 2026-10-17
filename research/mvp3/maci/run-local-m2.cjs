// Focused synthetic M2 probe: three MACI credentials, one sponsor, on-chain policy checks.
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const root = __dirname;
process.chdir(path.join(root, 'probe-output'));
process.env.HARDHAT_CONFIG = path.join(root, 'hardhat-local.config.cjs');
const modules = path.join(root, 'runtime-env/node_modules');
const hardhat = require(path.join(modules, '@maci-protocol/contracts/node_modules/hardhat'));
const sdk = require(path.join(modules, '@maci-protocol/sdk'));
const { Keypair, VerifyingKey } = require(path.join(modules, '@maci-protocol/domainobjs'));
const { generateRandomSalt } = require(path.join(modules, '@maci-protocol/crypto'));
const { ContractFactory } = hardhat.ethers;
const generated = path.join(root, '../../../packages/contracts/generated');
const artifacts = path.join(root, 'artifacts');
const circuits = path.join(root, 'probe-output/circuits');
const runId = process.env.MACI_M2_RUN_ID;
if (runId && !/^[a-z0-9_-]+$/.test(runId)) throw new Error('Invalid MACI_M2_RUN_ID');
const output = path.join(root, 'probe-output/local-m2', runId || '');
const voterCount = 3;
const started = performance.now();

function artifact(name) { return JSON.parse(fs.readFileSync(path.join(generated, `${name}.json`), 'utf8')); }
function vk(name) { return VerifyingKey.fromObj(JSON.parse(fs.readFileSync(path.join(artifacts, `${name}.vkey.json`), 'utf8'))); }
function record(stage, detail = {}) {
  fs.mkdirSync(output, { recursive: true });
  const row = JSON.stringify({ stage, detail, elapsedMs: Math.round(performance.now() - started) }, (_, value) => typeof value === 'bigint' ? value.toString() : value);
  fs.appendFileSync(path.join(output, 'events.ndjson'), `${row}\n`);
  process.stdout.write(`M2 ${stage}\n`);
}
async function rejects(action, label) {
  try { await action(); } catch { record(`${label}-rejected`); return; }
  throw new Error(`${label} was accepted`);
}

async function main() {
  const [deployer, issuer, sponsor] = await hardhat.ethers.getSigners();
  const registrationArtifact = artifact('SponsoredMaciRegistration');
  const registration = await new ContractFactory(registrationArtifact.abi, registrationArtifact.bytecode, deployer).deploy(await issuer.getAddress());
  await registration.waitForDeployment();
  const pollArtifact = artifact('OpenMaciPollJoinPolicy');
  const pollPolicy = await new ContractFactory(pollArtifact.abi, pollArtifact.bytecode, deployer).deploy();
  await pollPolicy.waitForDeployment();
  const maci = await sdk.deployMaci({ stateTreeDepth: 14, signupPolicyAddress: await registration.getAddress(), signer: deployer });
  const domain = { name: 'HCMUT MACI Registration', version: '1', chainId: 31337n, verifyingContract: await registration.getAddress() };
  const types = { Registration: [
    { name: 'ticket', type: 'bytes32' }, { name: 'publicKeyX', type: 'uint256' },
    { name: 'publicKeyY', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
  ] };
  const credentials = Array.from({ length: voterCount }, () => new Keypair());
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const tickets = credentials.map(() => `0x${randomBytes(32).toString('hex')}`);
  const keyParams = credentials.map(credential => credential.publicKey.asContractParam());
  const values = keyParams.map((key, index) => ({ ticket: tickets[index], publicKeyX: key.x, publicKeyY: key.y, deadline }));
  const signatures = [];
  for (const value of values) signatures.push(await issuer.signTypedData(domain, types, value));

  await rejects(() => registration.connect(sponsor).register.staticCall(keyParams[0], tickets[0], deadline, signatures[1]), 'wrong-issuer-authorization');
  const forgedSignature = await sponsor.signTypedData(domain, types, values[0]);
  await rejects(() => registration.connect(sponsor).register.staticCall(keyParams[0], tickets[0], deadline, forgedSignature), 'unauthorized-signer');
  await rejects(() => registration.connect(sponsor).register.staticCall(keyParams[1], tickets[0], deadline, signatures[0]), 'altered-public-key');
  await rejects(() => registration.connect(sponsor).register.staticCall(keyParams[0], tickets[0], 1n, signatures[0]), 'expired-authorization');
  const maciContract = new hardhat.ethers.Contract(maci.maciContractAddress, ['function signUp((uint256 x,uint256 y),bytes)'], sponsor);
  await rejects(() => maciContract.signUp.staticCall(keyParams[0], '0x'), 'direct-maci-signup');

  let signupGas = 0n;
  for (let i = 0; i < voterCount; i += 1) {
    const receipt = await registration.connect(sponsor).register(keyParams[i], tickets[i], deadline, signatures[i]).then(tx => tx.wait());
    if (receipt.status !== 1) throw new Error('Signup reverted');
    signupGas += receipt.gasUsed;
  }
  record('three-eligible-signups-one-sponsor', { signupGas, sponsor: await sponsor.getAddress() });
  await rejects(() => registration.connect(sponsor).register.staticCall(keyParams[0], tickets[0], deadline, signatures[0]), 'ticket-replay');
  const freshTicket = `0x${randomBytes(32).toString('hex')}`;
  const duplicateKeySignature = await issuer.signTypedData(domain, types, { ...values[0], ticket: freshTicket });
  await rejects(() => registration.connect(sponsor).register.staticCall(keyParams[0], freshTicket, deadline, duplicateKeySignature), 'duplicate-key');

  await sdk.setVerifyingKeys({
    stateTreeDepth: 14, pollStateTreeDepth: 14, tallyProcessingStateTreeDepth: 5,
    voteOptionTreeDepth: 3, messageBatchSize: 25,
    pollJoiningVerifyingKey: vk('polljoining_14'), pollJoinedVerifyingKey: vk('polljoined_14'),
    processMessagesVerifyingKeys: [vk('messageprocessorfull_14-25-3')],
    tallyVotesVerifyingKeys: [vk('votetallynonqv_14-5-3')], modes: [sdk.EMode.FULL],
    verifyingKeysRegistryAddress: maci.verifyingKeysRegistryContractAddress, signer: deployer,
  });
  const coordinator = new Keypair();
  const start = Math.floor(Date.now() / 1000) + 120;
  const poll = await sdk.deployPoll({
    maciAddress: maci.maciContractAddress, pollStartTimestamp: start, pollEndTimestamp: start + 300,
    tallyProcessingStateTreeDepth: 5, voteOptionTreeDepth: 3, messageBatchSize: 25,
    stateTreeDepth: 14, coordinatorPublicKey: coordinator.publicKey,
    mode: sdk.EMode.FULL, policyContractAddress: await pollPolicy.getAddress(),
    relayers: [await sponsor.getAddress()], voteOptions: 3, initialVoiceCredits: 1, signer: deployer,
  });
  await sdk.timeTravel({ seconds: 121, signer: deployer });
  let joinGas = 0n;
  for (const credential of credentials) {
    const joined = await sdk.joinPoll({
      maciAddress: maci.maciContractAddress, privateKey: credential.privateKey.serialize(),
      pollId: poll.pollId, pollJoiningZkey: path.join(artifacts, 'polljoining_14.zkey'),
      pollJoiningWasm: path.join(circuits, 'PollJoining_14_js/PollJoining_14.wasm'),
      useWasm: true, sgDataArg: '0x', ivcpDataArg: '0x', signer: sponsor,
    });
    if (BigInt(joined.voiceCredits) !== 1n) throw new Error('Wrong voice credit balance');
    const receipt = await sponsor.provider.getTransactionReceipt(joined.hash);
    joinGas += receipt.gasUsed;
  }
  record('three-proof-backed-poll-joins-one-sponsor', { joinGas, count: voterCount });
  if (process.env.MACI_M2_FULL_PROOF !== 'true') return;

  const indexes = [];
  for (const credential of credentials) {
    const joined = await sdk.getJoinedUserData({
      maciAddress: maci.maciContractAddress, pollId: poll.pollId,
      pollPublicKey: credential.publicKey.serialize(), signer: sponsor,
    });
    if (!joined.isJoined || !joined.pollStateIndex) throw new Error('Joined user index missing');
    indexes.push(BigInt(joined.pollStateIndex));
  }
  const selections = [0n, 1n, 1n];
  for (let i = 0; i < voterCount; i += 1) {
    await sdk.publish({
      publicKey: credentials[i].publicKey.serialize(), privateKey: credentials[i].privateKey.serialize(),
      stateIndex: indexes[i], voteOptionIndex: selections[i], nonce: 1n,
      pollId: poll.pollId, newVoteWeight: 1n, maciAddress: maci.maciContractAddress,
      salt: generateRandomSalt(), signer: sponsor,
    });
  }
  if (process.env.MACI_M2_REVOTE_PROBE === 'true') {
    await sdk.publish({
      publicKey: credentials[0].publicKey.serialize(), privateKey: credentials[0].privateKey.serialize(),
      stateIndex: indexes[0], voteOptionIndex: 2n, nonce: 1n,
      pollId: poll.pollId, newVoteWeight: 1n, maciAddress: maci.maciContractAddress,
      salt: generateRandomSalt(), signer: sponsor,
    });
    record('later-nonce-one-command-published');
  }
  record('three-encrypted-commands-one-sponsor');
  await sdk.timeTravel({ seconds: 301, signer: deployer });
  await sdk.mergeSignups({ pollId: poll.pollId, maciAddress: maci.maciContractAddress, signer: deployer });
  const proofs = await sdk.generateProofs({
    outputDir: path.join(output, 'proofs'), tallyFile: path.join(output, 'tally.json'),
    voteTallyZkey: path.join(artifacts, 'votetallynonqv_14-5-3.zkey'),
    messageProcessorZkey: path.join(artifacts, 'messageprocessorfull_14-25-3.zkey'),
    pollId: poll.pollId, coordinatorPrivateKey: coordinator.privateKey.serialize(),
    messageProcessorWasm: path.join(circuits, 'MessageProcessorFull_14-25-3_js/MessageProcessorFull_14-25-3.wasm'),
    voteTallyWasm: path.join(circuits, 'VoteTallyNonQv_14-5-3_js/VoteTallyNonQv_14-5-3.wasm'),
    useWasm: true, mode: sdk.EMode.FULL, maciAddress: maci.maciContractAddress, signer: deployer,
  });
  record('m2-processing-and-tally-proofs-generated');
  await sdk.proveOnChain({
    pollId: poll.pollId, proofDir: path.join(output, 'proofs'), tallyFile: path.join(output, 'tally.json'),
    maciAddress: maci.maciContractAddress, signer: deployer,
  });
  const commitments = sdk.generateTallyCommitments({ tallyData: proofs.tallyData, voteOptionTreeDepth: 3 });
  const verified = await sdk.verify({
    pollId: poll.pollId, tallyData: proofs.tallyData, tallyCommitments: commitments,
    totalVoteOptions: proofs.tallyData.results.tally.length, voteOptionTreeDepth: 3, signer: deployer,
  });
  const result = proofs.tallyData.results.tally.slice(0, 3).map(BigInt);
  const expected = process.env.MACI_M2_REVOTE_PROBE === 'true' ? [0n, 2n, 1n] : [1n, 2n, 0n];
  if (!verified || result.some((value, index) => value !== expected[index])) throw new Error('M2 verified tally mismatch');
  record('m2-full-proof-complete', { verified, result });
}

main().catch(error => { process.stderr.write(`M2 failed: ${error.message}\n`); process.exitCode = 1; });

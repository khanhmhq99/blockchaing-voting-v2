// Genuine local Semaphore proof -> MACI v3 signup probe. Synthetic identities only.
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = __dirname;
const maciRoot = path.resolve(root, '../maci');
const semaphoreModules = path.join(root, 'node_modules');
const runtimeModules = semaphoreModules;
process.chdir(path.join(maciRoot, 'probe-output'));
process.env.HARDHAT_CONFIG = path.join(maciRoot, 'hardhat-local.config.cjs');
const hardhat = require(path.join(runtimeModules, '@maci-protocol/contracts/node_modules/hardhat'));
const sdk = require(path.join(runtimeModules, '@maci-protocol/sdk'));
const { Keypair, VerifyingKey } = require(path.join(runtimeModules, '@maci-protocol/domainobjs'));
const { generateRandomSalt } = require(path.join(runtimeModules, '@maci-protocol/crypto'));
const solc = require(path.join(runtimeModules, 'solc'));
const { ContractFactory } = hardhat.ethers;
let stage = 'initialization';
const maciArtifacts = path.join(maciRoot, 'artifacts');
const circuits = path.join(maciRoot, 'probe-output/circuits');
function vk(name) { return VerifyingKey.fromObj(JSON.parse(fs.readFileSync(path.join(maciArtifacts, `${name}.vkey.json`), 'utf8'))); }

function compile() {
  const sourceNames = ['@semaphore-protocol/contracts/Semaphore.sol', '@semaphore-protocol/contracts/base/SemaphoreVerifier.sol'];
  const sources = Object.fromEntries(sourceNames.map(name => [name, { content: fs.readFileSync(path.join(semaphoreModules, name), 'utf8') }]));
  sources['SemaphoreMaciRegistration.sol'] = { content: fs.readFileSync(path.join(root, 'SemaphoreMaciRegistration.sol'), 'utf8') };
  sources['ResearchOpenPollJoinPolicy.sol'] = { content: fs.readFileSync(path.join(root, 'ResearchOpenPollJoinPolicy.sol'), 'utf8') };
  const input = { language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences'] } } } };
  const compiled = JSON.parse(solc.compile(JSON.stringify(input), { import: name => {
    try { return { contents: fs.readFileSync(path.join(semaphoreModules, name), 'utf8') }; }
    catch { return { error: `Missing import ${name}` }; }
  } }));
  const errors = (compiled.errors ?? []).filter(item => item.severity === 'error');
  if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
  return {
    wrapper: compiled.contracts['SemaphoreMaciRegistration.sol'].SemaphoreMaciRegistration,
    pollPolicy: compiled.contracts['ResearchOpenPollJoinPolicy.sol'].ResearchOpenPollJoinPolicy,
    verifier: compiled.contracts[sourceNames[1]].SemaphoreVerifier,
    semaphore: compiled.contracts[sourceNames[0]].Semaphore,
    poseidon: compiled.contracts['poseidon-solidity/PoseidonT3.sol'].PoseidonT3,
  };
}

function asProof(proof) {
  return {
    merkleTreeDepth: BigInt(proof.merkleTreeDepth), merkleTreeRoot: BigInt(proof.merkleTreeRoot),
    nullifier: BigInt(proof.nullifier), message: BigInt(proof.message), scope: BigInt(proof.scope),
    points: proof.points.map(BigInt),
  };
}

async function rejects(action, label) {
  try { await action(); } catch { return true; }
  throw new Error(`${label} was accepted`);
}

async function main() {
  stage = 'compile and load dependencies';
  const { Identity, Group, generateProof, verifyProof } = await import(pathToFileURL(path.join(semaphoreModules, '@semaphore-protocol/core/src/index.js')).href);
  const artifact = compile();
  const [deployer, sponsor] = await hardhat.ethers.getSigners();
  const deploy = async (compiled, args = [], bytecode = compiled.evm.bytecode.object) => {
    const contract = await new ContractFactory(compiled.abi, `0x${bytecode}`, deployer).deploy(...args);
    await contract.waitForDeployment();
    return contract;
  };
  const poseidon = await deploy(artifact.poseidon);
  stage = 'deploy Semaphore verifier and group';
  const verifier = await deploy(artifact.verifier);
  let bytecode = artifact.semaphore.evm.bytecode.object;
  const refs = artifact.semaphore.evm.bytecode.linkReferences['poseidon-solidity/PoseidonT3.sol'].PoseidonT3;
  for (const { start, length } of refs) {
    if (length !== 20) throw new Error('Unexpected Poseidon library link');
    bytecode = `${bytecode.slice(0, start * 2)}${(await poseidon.getAddress()).slice(2).toLowerCase()}${bytecode.slice((start + length) * 2)}`;
  }
  const semaphore = await deploy(artifact.semaphore, [await verifier.getAddress()], bytecode);
  await (await semaphore['createGroup()']()).wait();
  const groupId = 0n;
  const identities = [new Identity(), new Identity()];
  const group = new Group(identities.map(item => item.commitment));
  await (await semaphore.addMembers(groupId, identities.map(item => item.commitment))).wait();
  const chainRoot = await semaphore.getMerkleTreeRoot(groupId);
  if (chainRoot !== BigInt(group.root)) throw new Error('Semaphore group root mismatch');

  stage = 'deploy MACI and wrapper';
  const wrapper = await deploy(artifact.wrapper, [await semaphore.getAddress(), groupId]);
  stage = 'SDK deployMaci';
  const maci = await sdk.deployMaci({ stateTreeDepth: 14, signupPolicyAddress: await wrapper.getAddress(), signer: deployer });
  stage = 'set MACI target';
  const guarded = await wrapper.guarded();
  if (guarded === hardhat.ethers.ZeroAddress) await (await wrapper.setTarget(maci.maciContractAddress)).wait();
  else if (guarded.toLowerCase() !== maci.maciContractAddress.toLowerCase()) throw new Error('MACI SDK set an unexpected registration target');
  stage = 'generate Semaphore proofs';
  const credentials = [new Keypair(), new Keypair()];
  const keys = credentials.map(item => item.publicKey.asContractParam());
  const messages = await Promise.all(keys.map(key => wrapper.keyMessage(key)));
  const scope = await wrapper.scope();
  const proofs = await Promise.all(identities.map((identity, index) => generateProof(identity, group, messages[index], scope)));
  for (const proof of proofs) if (!await verifyProof(proof)) throw new Error('Semaphore proof failed off-chain verification');
  const formatted = proofs.map(asProof);

  stage = 'negative proof checks';
  const changedKeyRejected = await rejects(() => wrapper.connect(sponsor).register.staticCall(keys[1], formatted[0]), 'changed key');
  const wrongScopeRejected = await rejects(() => wrapper.connect(sponsor).register.staticCall(keys[0], { ...formatted[0], scope: scope + 1n }), 'wrong scope');
  const wrongRootRejected = await rejects(() => wrapper.connect(sponsor).register.staticCall(keys[0], { ...formatted[0], merkleTreeRoot: formatted[0].merkleTreeRoot + 1n }), 'wrong root');
  const directMaci = new hardhat.ethers.Contract(maci.maciContractAddress, ['function signUp((uint256 x,uint256 y),bytes)'], sponsor);
  const directRejected = await rejects(() => directMaci.signUp.staticCall(keys[0], '0x'), 'direct MACI signup');
  const nonMemberRejected = await rejects(() => generateProof(new Identity(), group, messages[0], scope), 'non-member proof');
  const secondWrapper = await deploy(artifact.wrapper, [await semaphore.getAddress(), groupId]);
  const otherScope = await secondWrapper.scope();
  const electionScopeIsolated = scope !== otherScope && BigInt((await generateProof(identities[0], group, messages[0], otherScope)).nullifier) !== formatted[0].nullifier;
  if (!electionScopeIsolated) throw new Error('Election scope did not isolate nullifiers');

  const invalidKey = { x: 0n, y: 0n };
  const invalidKeyProof = asProof(await generateProof(identities[0], group, await wrapper.keyMessage(invalidKey), scope));
  const invalidCurveRejected = await rejects(() => wrapper.connect(sponsor).register(invalidKey, invalidKeyProof, { gasLimit: 1000000 }), 'invalid MACI public key');
  const rollbackPreserved = !(await wrapper.spentNullifiers(invalidKeyProof.nullifier));
  if (!rollbackPreserved) throw new Error('Rejected MACI signup consumed the wrapper nullifier');

  await (await semaphore.connect(sponsor).validateProof(groupId, formatted[0])).wait();
  const globalNullifierFrontRunResisted = !(await wrapper.spentNullifiers(formatted[0].nullifier));
  if (!globalNullifierFrontRunResisted) throw new Error('Public Semaphore validation changed wrapper nullifier state');

  stage = 'genuine signup transactions';
  const gas = [];
  for (let index = 0; index < keys.length; index += 1) {
    const receipt = await wrapper.connect(sponsor).register(keys[index], formatted[index]).then(tx => tx.wait());
    if (receipt.status !== 1) throw new Error('MACI signup transaction failed');
    gas.push(receipt.gasUsed.toString());
  }
  stage = 'post-signup checks';
  const duplicateRejected = await rejects(() => wrapper.connect(sponsor).register.staticCall(keys[0], formatted[0]), 'duplicate nullifier');
  const maciContract = new hardhat.ethers.Contract(maci.maciContractAddress, ['function getStateIndex(uint256) view returns (uint256)'], deployer);
  const stateIndexes = [];
  for (const credential of credentials) stateIndexes.push((await maciContract.getStateIndex(credential.publicKey.hash())).toString());
  if (new Set(stateIndexes).size !== 2 || stateIndexes.some(value => value === '0')) throw new Error('MACI signup indexes missing or duplicated');

  process.stdout.write(`${JSON.stringify({ chainId: 31337, compiler: solc.version(), semaphoreVersion: '4.14.4', maciVersion: '3.0.0', proofCount: 4, groupRootMatched: true, changedKeyRejected, wrongScopeRejected, wrongRootRejected, directRejected, nonMemberRejected, invalidCurveRejected, rollbackPreserved, electionScopeIsolated, globalNullifierFrontRunResisted, duplicateRejected, signupGas: gas, stateIndexes })}\n`);
  if (process.env.SEMAPHORE_MACI_FULL_PROOF !== 'true') return;

  stage = 'configure MACI proving keys and poll';
  const pollPolicy = await deploy(artifact.pollPolicy);
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
  stage = 'join MACI poll and publish encrypted commands';
  for (const credential of credentials) {
    await sdk.joinPoll({
      maciAddress: maci.maciContractAddress, privateKey: credential.privateKey.serialize(),
      pollId: poll.pollId, pollJoiningZkey: path.join(maciArtifacts, 'polljoining_14.zkey'),
      pollJoiningWasm: path.join(circuits, 'PollJoining_14_js/PollJoining_14.wasm'),
      useWasm: true, sgDataArg: '0x', ivcpDataArg: '0x', signer: sponsor,
    });
  }
  const joinedIndexes = [];
  for (const credential of credentials) {
    const joined = await sdk.getJoinedUserData({
      maciAddress: maci.maciContractAddress, pollId: poll.pollId,
      pollPublicKey: credential.publicKey.serialize(), signer: sponsor,
    });
    if (!joined.isJoined || !joined.pollStateIndex) throw new Error('MACI joined state index missing');
    joinedIndexes.push(BigInt(joined.pollStateIndex));
  }
  for (let index = 0; index < credentials.length; index += 1) {
    await sdk.publish({
      publicKey: credentials[index].publicKey.serialize(), privateKey: credentials[index].privateKey.serialize(),
      stateIndex: joinedIndexes[index], voteOptionIndex: BigInt(index), nonce: 1n,
      pollId: poll.pollId, newVoteWeight: 1n, maciAddress: maci.maciContractAddress,
      salt: generateRandomSalt(), signer: sponsor,
    });
  }
  await sdk.timeTravel({ seconds: 301, signer: deployer });
  await sdk.mergeSignups({ pollId: poll.pollId, maciAddress: maci.maciContractAddress, signer: deployer });
  stage = 'generate and verify MACI processing/tally proofs';
  const output = path.join(root, 'outputs', `full-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const result = await sdk.generateProofs({
    outputDir: path.join(output, 'proofs'), tallyFile: path.join(output, 'tally.json'),
    voteTallyZkey: path.join(maciArtifacts, 'votetallynonqv_14-5-3.zkey'),
    messageProcessorZkey: path.join(maciArtifacts, 'messageprocessorfull_14-25-3.zkey'),
    pollId: poll.pollId, coordinatorPrivateKey: coordinator.privateKey.serialize(),
    messageProcessorWasm: path.join(circuits, 'MessageProcessorFull_14-25-3_js/MessageProcessorFull_14-25-3.wasm'),
    voteTallyWasm: path.join(circuits, 'VoteTallyNonQv_14-5-3_js/VoteTallyNonQv_14-5-3.wasm'),
    useWasm: true, mode: sdk.EMode.FULL, maciAddress: maci.maciContractAddress, signer: deployer,
  });
  await sdk.proveOnChain({
    pollId: poll.pollId, proofDir: path.join(output, 'proofs'), tallyFile: path.join(output, 'tally.json'),
    maciAddress: maci.maciContractAddress, signer: deployer,
  });
  const commitments = sdk.generateTallyCommitments({ tallyData: result.tallyData, voteOptionTreeDepth: 3 });
  const verified = await sdk.verify({
    pollId: poll.pollId, tallyData: result.tallyData, tallyCommitments: commitments,
    totalVoteOptions: result.tallyData.results.tally.length, voteOptionTreeDepth: 3, signer: deployer,
  });
  const tally = result.tallyData.results.tally.slice(0, 3).map(BigInt);
  if (!verified || tally[0] !== 1n || tally[1] !== 1n || tally[2] !== 0n) throw new Error('MACI tally verification mismatch');
  process.stdout.write(`${JSON.stringify({ fullProof: true, chainId: 31337, verified, tally: tally.map(String), output })}\n`);
}

main().then(() => process.exit(0)).catch(error => { process.stderr.write(`Semaphore-MACI local probe failed at ${stage}: ${String(error.message).slice(0, 1000)}\n`); process.exit(1); });

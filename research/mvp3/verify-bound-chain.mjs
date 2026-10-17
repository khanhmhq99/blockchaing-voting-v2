// Isolated synthetic full-record probe. Never use these contracts for real votes.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import solc from 'solc';
import { createPublicClient, createWalletClient, decodeEventLog, decodeFunctionData, encodeAbiParameters, encodeFunctionData, http, keccak256, stringToHex } from 'viem';
import { Identity, Group, generateProof } from './semaphore-probe/node_modules/@semaphore-protocol/core/src/index.js';
import { BallotBuilder } from './davinci-circom/js/src/builder.ts';
import * as snarkjs from './davinci-circom/js/node_modules/snarkjs/main.js';

const ballotZkey = process.env.MVP3_BALLOT_ZKEY ?? 'research/mvp3/davinci-circom/artifacts-public/ballot_final_pkey.zkey';
const ballotVkey = process.env.MVP3_BALLOT_VKEY ?? 'research/mvp3/davinci-circom/artifacts-public/ballot_final_vkey.json';
const ballotVerifierSource = process.env.MVP3_BALLOT_VERIFIER ?? 'research/mvp3/davinci-circom/artifacts-public/ballot_final_verifier.sol';

const dep = resolve('research/mvp3/semaphore-probe/node_modules');
const names = ['@semaphore-protocol/contracts/base/SemaphoreVerifier.sol', '@semaphore-protocol/contracts/Semaphore.sol'];
const sources = Object.fromEntries(names.map(name => [name, { content: readFileSync(resolve(dep, name), 'utf8') }]));
sources['BallotPublicVerifier.sol'] = { content: readFileSync(ballotVerifierSource, 'utf8') };
sources['BoundBallotProbe.sol'] = { content: readFileSync('research/mvp3/BoundBallotProbe.sol', 'utf8') };
const compiled = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object'] } } } }), { import: name => {
  try { return { contents: readFileSync(resolve(dep, name), 'utf8') }; }
  catch { return { error: `Missing import: ${name}` }; }
} }));
const errors = (compiled.errors ?? []).filter(item => item.severity === 'error');
if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
const verifier = compiled.contracts[names[0]].SemaphoreVerifier;
const semaphore = compiled.contracts[names[1]].Semaphore;
const poseidon = compiled.contracts['poseidon-solidity/PoseidonT3.sol'].PoseidonT3;
const ballotVerifier = compiled.contracts['BallotPublicVerifier.sol'].Groth16Verifier;
const bound = compiled.contracts['BoundBallotProbe.sol'].BoundBallotProbe;

const port = 18679;
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ['node_modules/hardhat/dist/src/cli.js', 'node', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: 'ignore', windowsHide: true });
const client = createPublicClient({ transport: http(url, { retryCount: 0 }), pollingInterval: 20 });
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { ready = (await client.getChainId()) === 31337; if (ready) break; } catch { /* wait */ }
    if (child.exitCode !== null) break;
    await delay(100);
  }
  if (!ready) throw new Error('Hardhat local chain unavailable');
  const wallet = createWalletClient({ transport: http(url), pollingInterval: 20 });
  const [account] = await wallet.getAddresses();
  const deploy = async (artifact, args = [], bytecode = artifact.evm.bytecode.object) => {
    const tx = await wallet.deployContract({ account, chain: null, abi: artifact.abi, bytecode: `0x${bytecode}`, args });
    const receipt = await client.waitForTransactionReceipt({ hash: tx });
    if (receipt.status !== 'success' || !receipt.contractAddress) throw new Error('Deployment failed');
    return receipt;
  };
  const poseidonReceipt = await deploy(poseidon);
  const semaphoreVerifierReceipt = await deploy(verifier);
  const ballotVerifierReceipt = await deploy(ballotVerifier);
  let linked = semaphore.evm.bytecode.object;
  for (const { start, length } of semaphore.evm.bytecode.linkReferences['poseidon-solidity/PoseidonT3.sol'].PoseidonT3) {
    if (length !== 20) throw new Error('Unexpected Poseidon link length');
    linked = `${linked.slice(0, 2 * start)}${poseidonReceipt.contractAddress.slice(2)}${linked.slice(2 * (start + length))}`;
  }
  const semaphoreReceipt = await deploy(semaphore, [semaphoreVerifierReceipt.contractAddress], linked);
  const onchain = semaphoreReceipt.contractAddress;
  const writeGroup = async (functionName, args) => {
    const hash = await wallet.writeContract({ account, chain: null, address: onchain, abi: semaphore.abi, functionName, args });
    return client.waitForTransactionReceipt({ hash });
  };
  await writeGroup('createGroup', []);
  const voter = new Identity();
  const secondVoter = new Identity();
  const group = new Group([voter.commitment, secondVoter.commitment, new Identity().commitment]);
  await writeGroup('addMembers', [0n, group.members.map(BigInt)]);
  const root = await client.readContract({ address: onchain, abi: semaphore.abi, functionName: 'getMerkleTreeRoot', args: [0n] });
  if (root !== group.root) throw new Error('Merkle root mismatch');
  const builder = await BallotBuilder.build();
  const { privKey, pubKey } = builder.elgamal.generateKeyPair();
  const key = pubKey.map(point => BigInt(builder.elgamal.F.toString(point, 10)));
  const candidates = [keccak256(stringToHex('synthetic-candidate-A')), keccak256(stringToHex('synthetic-candidate-B'))];
  const manifest = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint64' }, { type: 'bytes32[2]' }],
    [1, 1n, candidates],
  );
  const boundReceipt = await deploy(bound, [onchain, ballotVerifierReceipt.contractAddress, 0n, root, manifest, key]);
  const address = boundReceipt.contractAddress;
  const scope = await client.readContract({ address, abi: bound.abi, functionName: 'electionScope' });
  const processId = await client.readContract({ address, abi: bound.abi, functionName: 'processId' });
  const expectedMode = await client.readContract({ address, abi: bound.abi, functionName: 'packedBallotMode' });
  const config = { numFields: 2, groupSize: 2, uniqueValues: 0, maxValue: 1, minValue: 0, maxValueSum: 1, minValueSum: 1, costExponent: 1 };
  const inputStart = performance.now();
  const inputs = builder.generateInputs([0, 1], 1, pubKey, processId.toString(), '0', builder.randomK(), config);
  const inputMs = performance.now() - inputStart;
  if (BigInt(inputs.packed_ballot_mode) !== expectedMode) throw new Error('Ballot mode mismatch');
  const proofStart = performance.now();
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, 'research/mvp3/davinci-circom/ballot_proof_js/ballot_proof.wasm', ballotZkey);
  const ballotProvingMs = performance.now() - proofStart;
  const vkey = JSON.parse(readFileSync(ballotVkey, 'utf8'));
  if (!(await snarkjs.groth16.verify(vkey, publicSignals, proof))) throw new Error('Revised ballot proof invalid off-chain');
  if (publicSignals.length !== 72) throw new Error('Unexpected public signal length');
  const ciphertext = inputs.cipherfields.map(field => field.flat().map(BigInt));
  const expected = [expectedMode, 0n, 1n, processId, BigInt(inputs.vote_id), ...key, ...ciphertext.flat(), BigInt(inputs.inputs_hash)];
  if (expected.some((value, i) => value !== BigInt(publicSignals[i]))) throw new Error('Public record differs from proof signals');
  const memberStart = performance.now();
  const membershipRaw = await generateProof(voter, group, BigInt(inputs.inputs_hash), scope);
  const membershipProvingMs = performance.now() - memberStart;
  const membership = {
    merkleTreeDepth: BigInt(membershipRaw.merkleTreeDepth), merkleTreeRoot: BigInt(membershipRaw.merkleTreeRoot),
    nullifier: BigInt(membershipRaw.nullifier), message: BigInt(membershipRaw.message), scope: BigInt(membershipRaw.scope),
    points: membershipRaw.points.map(BigInt),
  };
  const a = [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])];
  const b = [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])], [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]];
  const c = [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])];
  const args = [membership, a, b, c, BigInt(inputs.vote_id), ciphertext, manifest];
  const check = async changed => {
    try { await client.simulateContract({ account, address, abi: bound.abi, functionName: 'accept', args: changed }); return false; }
    catch { return true; }
  };
  const alteredCipher = structuredClone(ciphertext);
  alteredCipher[0][0] += 1n;
  const wrongCiphertext = await check([membership, a, b, c, BigInt(inputs.vote_id), alteredCipher, manifest]);
  const alteredPadding = structuredClone(ciphertext);
  alteredPadding[2][0] += 1n;
  const wrongPaddedCiphertext = await check([membership, a, b, c, BigInt(inputs.vote_id), alteredPadding, manifest]);
  const noncanonicalCipher = structuredClone(ciphertext);
  noncanonicalCipher[0][0] = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
  const noncanonicalRejected = await check([membership, a, b, c, BigInt(inputs.vote_id), noncanonicalCipher, manifest]);
  const wrongManifest = await check([membership, a, b, c, BigInt(inputs.vote_id), ciphertext, stringToHex('changed manifest')]);
  const swappedManifest = encodeAbiParameters(
    [{ type: 'uint8' }, { type: 'uint64' }, { type: 'bytes32[2]' }],
    [1, 1n, [candidates[1], candidates[0]]],
  );
  const wrongCandidateOrder = await check([membership, a, b, c, BigInt(inputs.vote_id), ciphertext, swappedManifest]);
  const wrongScope = await check([{ ...membership, scope: scope + 1n }, ...args.slice(1)]);
  const wrongRoot = await check([{ ...membership, merkleTreeRoot: root + 1n }, ...args.slice(1)]);
  const badA = [...a]; badA[0] += 1n;
  const wrongProof = await check([membership, badA, ...args.slice(2)]);
  const badVoteId = await check([membership, a, b, c, BigInt(inputs.vote_id) + 1n, ciphertext, manifest]);
  const badMembershipMessage = await check([{ ...membership, message: membership.message + 1n }, ...args.slice(1)]);
  // Probe a valid proof under a different key before the nullifier is spent.
  const otherInputs = builder.generateInputs([0, 1], 1, builder.elgamal.generateKeyPair().pubKey, processId.toString(), '0', builder.randomK(), config);
  const other = await snarkjs.groth16.fullProve(otherInputs, 'research/mvp3/davinci-circom/ballot_proof_js/ballot_proof.wasm', ballotZkey);
  const otherProof = other.proof;
  const otherArgs = [membership,
    [BigInt(otherProof.pi_a[0]), BigInt(otherProof.pi_a[1])],
    [[BigInt(otherProof.pi_b[0][1]), BigInt(otherProof.pi_b[0][0])], [BigInt(otherProof.pi_b[1][1]), BigInt(otherProof.pi_b[1][0])]],
    [BigInt(otherProof.pi_c[0]), BigInt(otherProof.pi_c[1])],
    BigInt(otherInputs.vote_id), otherInputs.cipherfields.map(field => field.flat().map(BigInt)), manifest];
  const wrongKey = await check(otherArgs);
  const invalidChoices = [];
  for (const [label, fields] of [['missing', [0, 0]], ['multiple', [1, 1]], ['outOfRange', [2, 0]], ['nonzeroPadding', [0, 1, 1]]]) {
    const badInputs = builder.generateInputs(fields, 1, pubKey, processId.toString(), '0', builder.randomK(), config);
    try {
      await snarkjs.groth16.fullProve(badInputs, 'research/mvp3/davinci-circom/ballot_proof_js/ballot_proof.wasm', ballotZkey);
      invalidChoices.push({ label, rejected: false });
    } catch { invalidChoices.push({ label, rejected: true }); }
  }
  const calldata = encodeFunctionData({ abi: bound.abi, functionName: 'accept', args });
  const transactionHash = await wallet.writeContract({ account, chain: null, address, abi: bound.abi, functionName: 'accept', args });
  const acceptance = await client.waitForTransactionReceipt({ hash: transactionHash });
  const acceptedEvents = acceptance.logs.filter(log => log.address.toLowerCase() === address.toLowerCase());
  if (acceptance.status !== 'success' || acceptedEvents.length !== 1) throw new Error('Accepted ciphertext event missing');
  const acceptedEvent = decodeEventLog({ abi: bound.abi, data: acceptedEvents[0].data, topics: acceptedEvents[0].topics });
  const eventMatchesRecord = acceptedEvent.eventName === 'BallotAccepted'
    && acceptedEvent.args.nullifier === membership.nullifier
    && acceptedEvent.args.voteId === BigInt(inputs.vote_id)
    && acceptedEvent.args.inputsHash === membership.message
    && acceptedEvent.args.ciphertext.flat().every((value, index) => value === ciphertext.flat()[index]);
  const secondInputs = builder.generateInputs([1, 0], 1, pubKey, processId.toString(), '0', builder.randomK(), config);
  const secondProof = await snarkjs.groth16.fullProve(secondInputs,
    'research/mvp3/davinci-circom/ballot_proof_js/ballot_proof.wasm',
    ballotZkey);
  const secondMembershipRaw = await generateProof(secondVoter, group, BigInt(secondInputs.inputs_hash), scope);
  const secondMembership = {
    merkleTreeDepth: BigInt(secondMembershipRaw.merkleTreeDepth), merkleTreeRoot: BigInt(secondMembershipRaw.merkleTreeRoot),
    nullifier: BigInt(secondMembershipRaw.nullifier), message: BigInt(secondMembershipRaw.message), scope: BigInt(secondMembershipRaw.scope),
    points: secondMembershipRaw.points.map(BigInt),
  };
  const secondCiphertext = secondInputs.cipherfields.map(field => field.flat().map(BigInt));
  const sp = secondProof.proof;
  const secondArgs = [secondMembership,
    [BigInt(sp.pi_a[0]), BigInt(sp.pi_a[1])],
    [[BigInt(sp.pi_b[0][1]), BigInt(sp.pi_b[0][0])], [BigInt(sp.pi_b[1][1]), BigInt(sp.pi_b[1][0])]],
    [BigInt(sp.pi_c[0]), BigInt(sp.pi_c[1])],
    BigInt(secondInputs.vote_id), secondCiphertext, manifest];
  const secondHash = await wallet.writeContract({ account, chain: null, address, abi: bound.abi, functionName: 'accept', args: secondArgs });
  const secondReceipt = await client.waitForTransactionReceipt({ hash: secondHash });
  if (secondReceipt.status !== 'success') throw new Error('Second ballot was not accepted');
  // Reconstruct the tally solely from canonical accepted logs and their successful transactions.
  const acceptedLogAbi = bound.abi.find(item => item.type === 'event' && item.name === 'BallotAccepted');
  const logs = await client.getLogs({ address, event: acceptedLogAbi, fromBlock: boundReceipt.blockNumber, toBlock: secondReceipt.blockNumber });
  const seenNullifiers = new Set();
  const acceptedRecords = [];
  for (const log of logs) {
    const receipt = await client.getTransactionReceipt({ hash: log.transactionHash });
    const tx = await client.getTransaction({ hash: log.transactionHash });
    const block = await client.getBlock({ blockNumber: receipt.blockNumber });
    const decoded = decodeFunctionData({ abi: bound.abi, data: tx.input });
    const matchingLog = receipt.logs.some(item => item.logIndex === log.logIndex && item.address.toLowerCase() === address.toLowerCase());
    if (receipt.status !== 'success' || block.hash !== receipt.blockHash || tx.to?.toLowerCase() !== address.toLowerCase()
      || decoded.functionName !== 'accept' || !matchingLog || decoded.args[0].nullifier !== log.args.nullifier
      || decoded.args[4] !== log.args.voteId || keccak256(decoded.args[6]) !== log.args.manifestDigest
      || decoded.args[0].message !== log.args.inputsHash
      || decoded.args[5].flat().some((value, i) => value !== log.args.ciphertext.flat()[i])
      || seenNullifiers.has(log.args.nullifier.toString())) throw new Error('Noncanonical accepted record');
    seenNullifiers.add(log.args.nullifier.toString());
    acceptedRecords.push(log.args.ciphertext);
  }
  if (acceptedRecords.length !== 2) throw new Error('Accepted-set reconstruction mismatch');
  const { babyjub, F } = builder.elgamal;
  const point = (x, y) => [F.e(x), F.e(y)];
  const pointEqual = (left, right) => F.eq(left[0], right[0]) && F.eq(left[1], right[1]);
  const aggregateFor = records => {
    const result = Array.from({ length: 2 }, () => [point(0n, 1n), point(0n, 1n)]);
    for (const record of records) {
      for (let candidate = 0; candidate < 2; candidate++) {
        result[candidate][0] = babyjub.addPoint(result[candidate][0], point(record[candidate][0], record[candidate][1]));
        result[candidate][1] = babyjub.addPoint(result[candidate][1], point(record[candidate][2], record[candidate][3]));
      }
    }
    return result;
  };
  const decodeAggregate = (aggregate, secret) => aggregate.map(([c1, c2]) => {
    const shared = babyjub.mulPointEscalar(c1, secret);
    const plaintext = babyjub.addPoint(c2, [F.neg(shared[0]), shared[1]]);
    for (let count = 0; count <= acceptedRecords.length; count++) {
      if (pointEqual(plaintext, babyjub.mulPointEscalar(babyjub.Base8, BigInt(count)))) return count;
    }
    throw new Error('Aggregate plaintext outside accepted-ballot bound');
  });
  const aggregate = aggregateFor(acceptedRecords);
  const totals = decodeAggregate(aggregate, privKey);
  if (totals[0] !== 1 || totals[1] !== 1 || totals.reduce((sum, value) => sum + value, 0) !== acceptedRecords.length) {
    throw new Error('Aggregate tally mismatch');
  }
  const omissionRejected = decodeAggregate(aggregateFor(acceptedRecords.slice(1)), privKey)
    .reduce((sum, value) => sum + value, 0) !== acceptedRecords.length;
  const additionRejected = decodeAggregate(aggregateFor([...acceptedRecords, acceptedRecords[0]]), privKey)
    .reduce((sum, value) => sum + value, 0) !== acceptedRecords.length;
  const swappedCountsRejected = totals[0] !== 2 || totals[1] !== 0;
  let wrongDecryptionKeyRejected = false;
  try {
    const wrong = decodeAggregate(aggregate, builder.elgamal.generateKeyPair().privKey);
    wrongDecryptionKeyRejected = wrong.some((value, i) => value !== totals[i]);
  } catch { wrongDecryptionKeyRejected = true; }
  if (!omissionRejected || !additionRejected || !swappedCountsRejected || !wrongDecryptionKeyRejected) {
    throw new Error('Internal tally mutation not detected');
  }
  const duplicateRejected = await check(args);
  const secondBound = await deploy(bound, [onchain, ballotVerifierReceipt.contractAddress, 0n, root, manifest, key]);
  let crossDeploymentRejected;
  try { await client.simulateContract({ account, address: secondBound.contractAddress, abi: bound.abi, functionName: 'accept', args }); crossDeploymentRejected = false; }
  catch { crossDeploymentRejected = true; }
  const output = { chainId: 31337, compiler: solc.version(), evmVersion: 'cancun', publicSignals: publicSignals.length,
    ballotVerifierCreationCodeHash: keccak256(`0x${ballotVerifier.evm.bytecode.object}`),
    ballotVerifierRuntimeCodeHash: keccak256(`0x${ballotVerifier.evm.deployedBytecode.object}`),
    inputMs, ballotProvingMs, membershipProvingMs, ballotProofBytes: Buffer.byteLength(JSON.stringify(proof)),
    membershipProofBytes: Buffer.byteLength(JSON.stringify(membershipRaw)), calldataBytes: (calldata.length - 2) / 2,
    poseidonDeploymentGas: poseidonReceipt.gasUsed.toString(), semaphoreVerifierDeploymentGas: semaphoreVerifierReceipt.gasUsed.toString(),
    ballotVerifierDeploymentGas: ballotVerifierReceipt.gasUsed.toString(), semaphoreDeploymentGas: semaphoreReceipt.gasUsed.toString(),
    boundContractDeploymentGas: boundReceipt.gasUsed.toString(), acceptedVoteGas: acceptance.gasUsed.toString(),
    acceptedEventCount: logs.length, eventMatchesRecord, acceptedSetTally: totals, acceptedSetProvenanceChecked: true,
    omissionRejected, additionRejected, swappedCountsRejected, wrongDecryptionKeyRejected,
    secondVoteGas: secondReceipt.gasUsed.toString(), wrongCiphertext, wrongPaddedCiphertext, noncanonicalRejected,
    wrongManifest, wrongCandidateOrder, wrongScope, wrongRoot,
    wrongProof, badVoteId, badMembershipMessage, wrongKey, duplicateRejected, crossDeploymentRejected, invalidChoices,
    ballotVerifierRuntimeBytes: ballotVerifier.evm.deployedBytecode.object.length / 2,
    boundRuntimeBytes: bound.evm.deployedBytecode.object.length / 2 };
  console.log(JSON.stringify(output));
  if (Object.values({ eventMatchesRecord, wrongCiphertext, wrongPaddedCiphertext, noncanonicalRejected, wrongManifest,
    wrongCandidateOrder, wrongScope, wrongRoot, wrongProof, badVoteId, badMembershipMessage, wrongKey,
    duplicateRejected, crossDeploymentRejected }).some(value => !value) || invalidChoices.some(item => !item.rejected)) process.exitCode = 1;
} finally {
  child.kill();
}
process.exit(process.exitCode ?? 0);

// Local-only probe of Semaphore's published Solidity contracts.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';

const dependencyRoot = resolve('research/mvp3/semaphore-probe/node_modules');
const names = ['@semaphore-protocol/contracts/base/SemaphoreVerifier.sol', '@semaphore-protocol/contracts/Semaphore.sol'];
const sources = Object.fromEntries(names.map(name => [name, { content: readFileSync(resolve(dependencyRoot, name), 'utf8') }]));
sources['BallotVerifier.sol'] = { content: readFileSync('research/mvp3/ballot-verifier.sol', 'utf8') };
sources['CompositionProbe.sol'] = { content: readFileSync('research/mvp3/CompositionProbe.sol', 'utf8') };
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences'] } } } }), { import: name => {
  try { return { contents: readFileSync(resolve(dependencyRoot, name), 'utf8') }; }
  catch { return { error: `Import not found: ${name}` }; }
} }));
const errors = (output.errors ?? []).filter(item => item.severity === 'error');
if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
const verifier = output.contracts[names[0]].SemaphoreVerifier;
const semaphore = output.contracts[names[1]].Semaphore;
const poseidon = output.contracts['poseidon-solidity/PoseidonT3.sol'].PoseidonT3;
const ballotVerifier = output.contracts['BallotVerifier.sol'].Groth16Verifier;
const composition = output.contracts['CompositionProbe.sol'].CompositionProbe;
const proofRaw = JSON.parse(readFileSync('research/mvp3/probe-output/membership-proof.json', 'utf8'));
const info = JSON.parse(readFileSync('research/mvp3/probe-output/membership-public.json', 'utf8'));
const ballotProofRaw = JSON.parse(readFileSync('research/mvp3/probe-output/ballot-proof.json', 'utf8'));
const ballotPublic = JSON.parse(readFileSync('research/mvp3/probe-output/ballot-public.json', 'utf8'));
const ballotArgs = [
  [BigInt(ballotProofRaw.pi_a[0]), BigInt(ballotProofRaw.pi_a[1])],
  [[BigInt(ballotProofRaw.pi_b[0][1]), BigInt(ballotProofRaw.pi_b[0][0])], [BigInt(ballotProofRaw.pi_b[1][1]), BigInt(ballotProofRaw.pi_b[1][0])]],
  [BigInt(ballotProofRaw.pi_c[0]), BigInt(ballotProofRaw.pi_c[1])],
  ballotPublic.publicSignals.map(BigInt),
];
const proof = {
  merkleTreeDepth: BigInt(proofRaw.merkleTreeDepth),
  merkleTreeRoot: BigInt(proofRaw.merkleTreeRoot),
  nullifier: BigInt(proofRaw.nullifier),
  message: BigInt(proofRaw.message),
  scope: BigInt(proofRaw.scope),
  points: proofRaw.points.map(BigInt),
};
const port = 18678;
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
  if (!ready) throw new Error('Local Hardhat chain unavailable');
  const wallet = createWalletClient({ transport: http(url), pollingInterval: 20 });
  const [account] = await wallet.getAddresses();
  const deploy = async (artifact, args = [], bytecode = artifact.evm.bytecode.object) => {
    const hash = await wallet.deployContract({ account, chain: null, abi: artifact.abi, bytecode: `0x${bytecode}`, args });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error('Contract deployment failed');
    return receipt;
  };
  const poseidonReceipt = await deploy(poseidon);
  const verifierReceipt = await deploy(verifier);
  const ballotReceipt = await deploy(ballotVerifier);
  let linkedBytecode = semaphore.evm.bytecode.object;
  const addressHex = poseidonReceipt.contractAddress.slice(2).toLowerCase();
  const references = semaphore.evm.bytecode.linkReferences['poseidon-solidity/PoseidonT3.sol'].PoseidonT3;
  for (const { start, length } of references) {
    if (length !== 20) throw new Error('Unexpected Poseidon link length');
    linkedBytecode = `${linkedBytecode.slice(0, start * 2)}${addressHex}${linkedBytecode.slice((start + length) * 2)}`;
  }
  const semaphoreReceipt = await deploy(semaphore, [verifierReceipt.contractAddress], linkedBytecode);
  const address = semaphoreReceipt.contractAddress;
  const write = async (functionName, args) => {
    const hash = await wallet.writeContract({ account, chain: null, address, abi: semaphore.abi, functionName, args });
    return client.waitForTransactionReceipt({ hash });
  };
  await write('createGroup', []);
  const groupId = 0n;
  await write('addMembers', [groupId, info.commitments.map(BigInt)]);
  const root = await client.readContract({ address, abi: semaphore.abi, functionName: 'getMerkleTreeRoot', args: [groupId] });
  if (root !== proof.merkleTreeRoot) throw new Error('On-chain root mismatch');
  const good = await client.readContract({ address, abi: semaphore.abi, functionName: 'verifyProof', args: [groupId, proof] });
  const rejected = async altered => {
    try { return !(await client.readContract({ address, abi: semaphore.abi, functionName: 'verifyProof', args: [groupId, altered] })); }
    catch { return true; }
  };
  const wrongRoot = await rejected({ ...proof, merkleTreeRoot: proof.merkleTreeRoot + 1n });
  const wrongScope = await rejected({ ...proof, scope: proof.scope + 1n });
  const wrongMessage = await rejected({ ...proof, message: proof.message + 1n });
  const acceptance = await write('validateProof', [groupId, proof]);
  let duplicateRejected = false;
  try { await write('validateProof', [groupId, proof]); }
  catch { duplicateRejected = true; }
  await write('createGroup', []);
  const compositeGroupId = 1n;
  await write('addMembers', [compositeGroupId, info.commitments.map(BigInt)]);
  const compositionReceipt = await deploy(composition, [address, ballotReceipt.contractAddress, compositeGroupId, proof.merkleTreeRoot, proof.scope]);
  const compositeAddress = compositionReceipt.contractAddress;
  const compositeArgs = [proof, ...ballotArgs];
  const compositeCalldata = (await import('viem')).encodeFunctionData({ abi: composition.abi, functionName: 'validate', args: compositeArgs });
  const compositeRejects = async altered => {
    try { await client.simulateContract({ account, address: compositeAddress, abi: composition.abi, functionName: 'validate', args: altered }); return false; }
    catch { return true; }
  };
  const badCompositeRoot = await compositeRejects([{ ...proof, merkleTreeRoot: proof.merkleTreeRoot + 1n }, ...ballotArgs]);
  const badCompositeScope = await compositeRejects([{ ...proof, scope: proof.scope + 1n }, ...ballotArgs]);
  const badCompositeHash = await compositeRejects([proof, ...ballotArgs.slice(0, 3), [ballotArgs[3][0], ballotArgs[3][1], ballotArgs[3][2] + 1n]]);
  const compositeHash = await wallet.writeContract({ account, chain: null, address: compositeAddress, abi: composition.abi, functionName: 'validate', args: compositeArgs });
  const compositeAcceptance = await client.waitForTransactionReceipt({ hash: compositeHash });
  let compositeDuplicateRejected = false;
  try { await wallet.writeContract({ account, chain: null, address: compositeAddress, abi: composition.abi, functionName: 'validate', args: compositeArgs }); }
  catch { compositeDuplicateRejected = true; }
  console.log(JSON.stringify({ chainId: 31337, compiler: solc.version(), evmVersion: 'cancun', poseidonDeploymentGas: poseidonReceipt.gasUsed.toString(), verifierDeploymentGas: verifierReceipt.gasUsed.toString(), semaphoreDeploymentGas: semaphoreReceipt.gasUsed.toString(), ballotVerifierDeploymentGas: ballotReceipt.gasUsed.toString(), compositionDeploymentGas: compositionReceipt.gasUsed.toString(), membershipValidationGas: acceptance.gasUsed.toString(), compositeValidationGas: compositeAcceptance.gasUsed.toString(), compositeCalldataBytes: (compositeCalldata.length - 2) / 2, good, wrongRoot, wrongScope, wrongMessage, duplicateRejected, compositeDuplicateRejected, badCompositeRoot, badCompositeScope, badCompositeHash, rootMatches: root === proof.merkleTreeRoot, verifierBytecodeBytes: verifier.evm.bytecode.object.length / 2, semaphoreBytecodeBytes: semaphore.evm.bytecode.object.length / 2, compositionBytecodeBytes: composition.evm.bytecode.object.length / 2 }));
  if (!good || !wrongRoot || !wrongScope || !wrongMessage || !duplicateRejected || !compositeDuplicateRejected || !badCompositeRoot || !badCompositeScope || !badCompositeHash) process.exitCode = 1;
} finally {
  child.kill();
}

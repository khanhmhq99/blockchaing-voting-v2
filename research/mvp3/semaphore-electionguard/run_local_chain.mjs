import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import solc from 'solc';
import { createPublicClient, createWalletClient, encodeFunctionData, http } from 'viem';

const base = resolve(import.meta.dirname);
const repo = resolve(base, '../../..');
const dependencyRoot = resolve(base, 'node_modules');
const semaphoreSource = '@semaphore-protocol/contracts/Semaphore.sol';
const verifierSource = '@semaphore-protocol/contracts/base/SemaphoreVerifier.sol';
const sourceNames = [semaphoreSource, verifierSource];
const sources = Object.fromEntries(sourceNames.map(name => [name, { content: readFileSync(resolve(dependencyRoot, name), 'utf8') }]));
sources['BoundBallotRegistry.sol'] = { content: readFileSync(resolve(base, 'BoundBallotRegistry.sol'), 'utf8') };
const compilerInput = {
  language: 'Solidity', sources,
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.bytecode.linkReferences', 'evm.deployedBytecode.object'] } } },
};
const compiled = JSON.parse(solc.compile(JSON.stringify(compilerInput), { import: name => {
  try { return { contents: readFileSync(resolve(dependencyRoot, name), 'utf8') }; }
  catch { return { error: `Missing import: ${name}` }; }
} }));
const errors = (compiled.errors ?? []).filter(item => item.severity === 'error');
if (errors.length) throw new Error(errors.map(item => item.formattedMessage).join('\n'));
const verifier = compiled.contracts[verifierSource].SemaphoreVerifier;
const semaphore = compiled.contracts[semaphoreSource].Semaphore;
const poseidon = compiled.contracts['poseidon-solidity/PoseidonT3.sol'].PoseidonT3;
const registry = compiled.contracts['BoundBallotRegistry.sol'].BoundBallotRegistry;
const info = JSON.parse(readFileSync(resolve(base, 'outputs/semaphore/proofs.json'), 'utf8'));
const proofOf = raw => ({
  merkleTreeDepth: BigInt(raw.merkleTreeDepth), merkleTreeRoot: BigInt(raw.merkleTreeRoot),
  nullifier: BigInt(raw.nullifier), message: BigInt(raw.message), scope: BigInt(raw.scope),
  points: raw.points.map(BigInt),
});
const port = 18717;
const url = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, [resolve(repo, 'node_modules/hardhat/dist/src/cli.js'), 'node', '--hostname', '127.0.0.1', '--port', String(port)],
  { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let hardhatError = '';
child.stderr.on('data', chunk => { hardhatError = `${hardhatError}${chunk}`.slice(-3000); });
const publicClient = createPublicClient({ transport: http(url, { retryCount: 0 }), pollingInterval: 20 });
try {
  let ready = false;
  for (let i = 0; i < 100; i += 1) {
    try { ready = (await publicClient.getChainId()) === 31337; if (ready) break; } catch { /* starting */ }
    if (child.exitCode !== null) break;
    await delay(100);
  }
  if (!ready) throw new Error(`Hardhat chain unavailable: ${hardhatError}`);
  const wallet = createWalletClient({ transport: http(url), pollingInterval: 20 });
  const [account] = await wallet.getAddresses();
  const deploy = async (artifact, args = [], bytecode = artifact.evm.bytecode.object) => {
    const hash = await wallet.deployContract({ account, chain: null, abi: artifact.abi, bytecode: `0x${bytecode}`, args });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (!receipt.contractAddress) throw new Error('Deployment failed');
    return receipt;
  };
  const write = async (address, abi, functionName, args) => {
    const hash = await wallet.writeContract({ account, chain: null, address, abi, functionName, args });
    return publicClient.waitForTransactionReceipt({ hash });
  };
  const poseidonTx = await deploy(poseidon);
  const verifierTx = await deploy(verifier);
  let semaphoreBytecode = semaphore.evm.bytecode.object;
  const references = semaphore.evm.bytecode.linkReferences['poseidon-solidity/PoseidonT3.sol'].PoseidonT3;
  for (const { start, length } of references) {
    if (length !== 20) throw new Error('Unexpected Poseidon link');
    semaphoreBytecode = `${semaphoreBytecode.slice(0, start * 2)}${poseidonTx.contractAddress.slice(2).toLowerCase()}${semaphoreBytecode.slice((start + length) * 2)}`;
  }
  writeFileSync(resolve(base, 'outputs/creation-code.json'), JSON.stringify({
    poseidon: { abi: poseidon.abi, bytecode: `0x${poseidon.evm.bytecode.object}` },
    verifier: { abi: verifier.abi, bytecode: `0x${verifier.evm.bytecode.object}` },
    semaphore: { abi: semaphore.abi, bytecode: `0x${semaphoreBytecode}` },
    registry: { abi: registry.abi, bytecode: `0x${registry.evm.bytecode.object}` },
  }));
  const semaphoreTx = await deploy(semaphore, [verifierTx.contractAddress], semaphoreBytecode);
  const semaphoreAddress = semaphoreTx.contractAddress;
  await write(semaphoreAddress, semaphore.abi, 'createGroup', []);
  const addTx = await write(semaphoreAddress, semaphore.abi, 'addMembers', [0n, info.commitments.map(BigInt)]);
  const root = await publicClient.readContract({ address: semaphoreAddress, abi: semaphore.abi, functionName: 'getMerkleTreeRoot', args: [0n] });
  if (root !== BigInt(info.groupRoot)) throw new Error('Group root mismatch');
  const registryTx = await deploy(registry, [semaphoreAddress, 0n, root, info.electionId, info.manifestDigest, info.contextDigest]);
  const registryAddress = registryTx.contractAddress;
  const expectedScope = await publicClient.readContract({ address: registryAddress, abi: registry.abi, functionName: 'electionScope' });
  if (expectedScope !== BigInt(info.scope)) throw new Error('Election scope mismatch');
  const first = info.proofs[0];
  const firstProof = proofOf(first.proof);
  const expectedMessage = await publicClient.readContract({ address: registryAddress, abi: registry.abi, functionName: 'expectedMessage', args: [first.ballotDigest] });
  if (expectedMessage !== firstProof.message) throw new Error('Ballot message mismatch');
  const rejected = async (digest, proof) => {
    try { await publicClient.simulateContract({ account, address: registryAddress, abi: registry.abi, functionName: 'submit', args: [digest, proof] }); return false; }
    catch { return true; }
  };
  const wrongRoot = await rejected(first.ballotDigest, { ...firstProof, merkleTreeRoot: firstProof.merkleTreeRoot + 1n });
  const wrongScope = await rejected(first.ballotDigest, { ...firstProof, scope: firstProof.scope + 1n });
  const changedCiphertext = await rejected(info.proofs[1].ballotDigest, firstProof);
  const invalidProof = await rejected(first.ballotDigest, { ...firstProof, points: firstProof.points.map((x, i) => i === 0 ? x + 1n : x) });
  const gas = [];
  const acceptedReceipts = [];
  for (const item of info.proofs) {
    const receipt = await write(registryAddress, registry.abi, 'submit', [item.ballotDigest, proofOf(item.proof)]);
    gas.push(receipt.gasUsed.toString());
    acceptedReceipts.push(receipt);
  }
  const duplicate = await rejected(first.ballotDigest, firstProof);
  const count = await publicClient.readContract({ address: registryAddress, abi: registry.abi, functionName: 'acceptedCount' });
  const acceptedBallots = [];
  for (let index = 0n; index < count; index += 1n) {
    const digest = await publicClient.readContract({ address: registryAddress, abi: registry.abi, functionName: 'acceptedBallots', args: [index] });
    if (digest !== info.proofs[Number(index)].ballotDigest) throw new Error('Accepted digest differs from public ballot');
    acceptedBallots.push(digest);
  }
  writeFileSync(resolve(base, 'outputs/chain-accepted.json'), JSON.stringify({
    chainId: 31337, registryAddress, groupRoot: root.toString(), electionScope: expectedScope.toString(),
    electionId: info.electionId, manifestDigest: info.manifestDigest, contextDigest: info.contextDigest,
    acceptedBallots, receipts: acceptedReceipts.map(receipt => ({
      transactionHash: receipt.transactionHash, blockNumber: receipt.blockNumber.toString(),
    })),
  }));
  await write(registryAddress, registry.abi, 'close', []);
  const closed = await rejected(first.ballotDigest, firstProof);
  const allPassed = wrongRoot && wrongScope && changedCiphertext && invalidProof && duplicate && closed && count === 3n;
  const calldata = encodeFunctionData({ abi: registry.abi, functionName: 'submit', args: [first.ballotDigest, firstProof] });
  console.log(JSON.stringify({ chainId: 31337, compiler: solc.version(), evmVersion: 'cancun',
    deploymentGas: { poseidon: poseidonTx.gasUsed.toString(), verifier: verifierTx.gasUsed.toString(), semaphore: semaphoreTx.gasUsed.toString(), registry: registryTx.gasUsed.toString() },
    addMembersGas: addTx.gasUsed.toString(), ballotGas: gas, calldataBytes: (calldata.length - 2) / 2,
    deployedBytecodeBytes: { verifier: verifier.evm.deployedBytecode.object.length / 2, registry: registry.evm.deployedBytecode.object.length / 2 },
    accepted: count.toString(), acceptedSetMatched: acceptedBallots.length === 3,
    wrongRoot, wrongScope, changedCiphertext, invalidProof, duplicate, closed, allPassed }));
  if (!allPassed) process.exitCode = 1;
} finally {
  child.kill();
}

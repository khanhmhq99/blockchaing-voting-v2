// Local-only feasibility probe of the upstream generated Groth16 verifier.
import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import solc from 'solc';
import { createPublicClient, createWalletClient, http } from 'viem';

const source = readFileSync('research/mvp3/ballot-verifier.sol', 'utf8');
const result = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'BallotVerifier.sol': { content: source } }, settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } } })));
const errors = (result.errors ?? []).filter(item => item.severity === 'error');
if (errors.length) throw new Error(`Solidity compilation failed: ${errors.map(item => item.formattedMessage).join('\n')}`);
const artifact = result.contracts['BallotVerifier.sol'].Groth16Verifier;
const proof = JSON.parse(readFileSync('research/mvp3/probe-output/ballot-proof.json', 'utf8'));
const record = JSON.parse(readFileSync('research/mvp3/probe-output/ballot-public.json', 'utf8'));
const args = [
  [BigInt(proof.pi_a[0]), BigInt(proof.pi_a[1])],
  [[BigInt(proof.pi_b[0][1]), BigInt(proof.pi_b[0][0])], [BigInt(proof.pi_b[1][1]), BigInt(proof.pi_b[1][0])]],
  [BigInt(proof.pi_c[0]), BigInt(proof.pi_c[1])],
  record.publicSignals.map(BigInt),
];
const port = 18677;
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
  const deploymentHash = await wallet.deployContract({ account, chain: null, abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}` });
  const deployment = await client.waitForTransactionReceipt({ hash: deploymentHash });
  if (!deployment.contractAddress) throw new Error('Verifier deployment failed');
  const address = deployment.contractAddress;
  const good = await client.readContract({ address, abi: artifact.abi, functionName: 'verifyProof', args });
  const alteredSignals = [...args[3]];
  alteredSignals[2] += 1n;
  const badHash = await client.readContract({ address, abi: artifact.abi, functionName: 'verifyProof', args: [...args.slice(0, 3), alteredSignals] });
  const voteHash = await wallet.writeContract({ account, chain: null, address, abi: artifact.abi, functionName: 'verifyProof', args });
  const voteReceipt = await client.waitForTransactionReceipt({ hash: voteHash });
  const mutatedRecord = structuredClone(record);
  mutatedRecord.cipherfields[0][0][0] = (BigInt(mutatedRecord.cipherfields[0][0][0]) + 1n).toString();
  const mutatedKeyRecord = structuredClone(record);
  mutatedKeyRecord.encryptionPubkey[0] = (BigInt(mutatedKeyRecord.encryptionPubkey[0]) + 1n).toString();
  const mutatedModeRecord = structuredClone(record);
  mutatedModeRecord.packedBallotMode = (BigInt(mutatedModeRecord.packedBallotMode) + 1n).toString();
  // This verifier accepts the unchanged proof because ciphertext is not a direct
  // Solidity input. A production wrapper must authenticate its public hash.
  const unchangedProofWithMutatedRecord = await client.readContract({ address, abi: artifact.abi, functionName: 'verifyProof', args });
  const unchangedProofWithMutatedKey = await client.readContract({ address, abi: artifact.abi, functionName: 'verifyProof', args });
  const unchangedProofWithMutatedMode = await client.readContract({ address, abi: artifact.abi, functionName: 'verifyProof', args });
  console.log(JSON.stringify({ chainId: 31337, compiler: solc.version(), evmVersion: 'paris', deploymentGas: deployment.gasUsed.toString(), ballotVerifierGas: voteReceipt.gasUsed.toString(), good, badHash, unchangedProofWithMutatedRecord, unchangedProofWithMutatedKey, unchangedProofWithMutatedMode, solidityBytecodeBytes: artifact.evm.bytecode.object.length / 2, proofBytes: Buffer.byteLength(JSON.stringify(proof)), publicRecordBytes: Buffer.byteLength(JSON.stringify(record)) }));
  if (!good || badHash || !unchangedProofWithMutatedRecord) process.exitCode = 1;
} finally {
  child.kill();
}

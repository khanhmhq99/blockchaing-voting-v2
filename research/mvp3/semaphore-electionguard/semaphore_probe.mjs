import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { Identity, Group, generateProof, verifyProof } from '@semaphore-protocol/core';
import { encodeAbiParameters, keccak256, parseAbiParameters, stringToHex } from 'viem';

const base = resolve(import.meta.dirname);
const record = resolve(base, 'outputs/electionguard-record');
const output = resolve(base, 'outputs/semaphore');
await mkdir(output, { recursive: true });
const electionId = keccak256(stringToHex('HCMUT synthetic ElectionGuard election 1'));
const manifestDigest = keccak256(await readFile(resolve(record, 'manifest.json')));
const contextDigest = keccak256(await readFile(resolve(record, 'context.json')));
const ballotDomain = keccak256(stringToHex('HCMUT-SEG-BALLOT-V1'));
const scopeDomain = keccak256(stringToHex('HCMUT-SEG-SCOPE-V1'));
const chainId = 31337n;
const scope = BigInt(keccak256(encodeAbiParameters(parseAbiParameters('bytes32,uint256,bytes32'), [scopeDomain, chainId, electionId])));
const identities = [new Identity(), new Identity(), new Identity()];
const group = new Group(identities.map(item => item.commitment));
const proofs = [];
const nullifiers = new Set();
const started = performance.now();
for (let i = 0; i < identities.length; i += 1) {
  const ballotDigest = keccak256(await readFile(resolve(record, `accepted-ballot-${i}.json`)));
  const message = BigInt(keccak256(encodeAbiParameters(
    parseAbiParameters('bytes32,uint256,bytes32,bytes32,bytes32,bytes32'),
    [ballotDomain, chainId, electionId, manifestDigest, contextDigest, ballotDigest],
  )));
  const proof = await generateProof(identities[i], group, message, scope);
  if (!(await verifyProof(proof))) throw new Error(`Semaphore proof ${i} failed`);
  if (nullifiers.has(proof.nullifier)) throw new Error('Duplicate nullifier');
  nullifiers.add(proof.nullifier);
  proofs.push({ ballotDigest, proof });
}
const modifiedMessageRejected = !(await verifyProof({ ...proofs[0].proof, message: (BigInt(proofs[0].proof.message) + 1n).toString() }));
const wrongScopeRejected = !(await verifyProof({ ...proofs[0].proof, scope: (scope + 1n).toString() }));
let nonMemberRejected = false;
try { await generateProof(new Identity(), group, 1n, scope); } catch { nonMemberRejected = true; }
if (!modifiedMessageRejected || !wrongScopeRejected || !nonMemberRejected) throw new Error('Negative proof gate failed');
const payload = {
  chainId: Number(chainId), electionId, manifestDigest, contextDigest,
  groupRoot: group.root.toString(), commitments: identities.map(item => item.commitment.toString()),
  scope: scope.toString(), proofs,
};
await writeFile(resolve(output, 'proofs.json'), JSON.stringify(payload));
console.log(JSON.stringify({ version: '4.14.4', proofCount: proofs.length, groupSize: group.size,
  proofMs: Math.round(performance.now() - started), modifiedMessageRejected, wrongScopeRejected,
  nonMemberRejected, distinctNullifiers: nullifiers.size === 3, publicProofBytes: Buffer.byteLength(JSON.stringify(payload)) }));
process.exit(0);

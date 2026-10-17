// Isolated, synthetic feasibility probe. This is not a production voting path.
import { performance } from 'node:perf_hooks';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import * as snarkjs from './davinci-circom/js/node_modules/snarkjs/main.js';
import { BallotBuilder } from './davinci-circom/js/src/builder.ts';

const root = resolve(import.meta.dirname, 'davinci-circom');
const output = resolve(import.meta.dirname, 'probe-output');
const wasm = resolve(root, 'artifacts/ballot_proof.wasm');
const zkey = resolve(root, 'artifacts/ballot_proof_pkey.zkey');
const builder = await BallotBuilder.build();
const { pubKey } = builder.elgamal.generateKeyPair();
const config = {
  numFields: 2,
  groupSize: 2,
  uniqueValues: 0,
  maxValue: 1,
  minValue: 0,
  maxValueSum: 1,
  minValueSum: 1,
  costExponent: 1,
};
const started = performance.now();
const inputs = builder.generateInputs([0, 1], 1, pubKey, '12345', '0', builder.randomK(), config);
const encryptionMs = performance.now() - started;
const provingStart = performance.now();
const { proof, publicSignals } = await snarkjs.groth16.fullProve(inputs, wasm, zkey);
const provingMs = performance.now() - provingStart;
const vkey = JSON.parse(await (await import('node:fs/promises')).readFile(resolve(root, 'artifacts/ballot_proof_vkey.json'), 'utf8'));
const verificationStart = performance.now();
const verified = await snarkjs.groth16.verify(vkey, publicSignals, proof);
const verificationMs = performance.now() - verificationStart;
if (!verified) throw new Error('Generated ballot proof failed verification');
await mkdir(output, { recursive: true });
await writeFile(resolve(output, 'ballot-proof.json'), JSON.stringify(proof));
await writeFile(resolve(output, 'ballot-public.json'), JSON.stringify({
  publicSignals,
  processId: inputs.process_id,
  packedBallotMode: inputs.packed_ballot_mode,
  encryptionPubkey: inputs.encryption_pubkey,
  cipherfields: inputs.cipherfields,
  weight: inputs.weight,
  address: inputs.address,
  voteId: inputs.vote_id,
}));
console.log(JSON.stringify({ verified, encryptionMs, provingMs, verificationMs, publicSignals, proofBytes: Buffer.byteLength(JSON.stringify(proof)), publicSignalBytes: Buffer.byteLength(JSON.stringify(publicSignals)), wasmBytes: (await (await import('node:fs/promises')).stat(wasm)).size, zkeyBytes: (await (await import('node:fs/promises')).stat(zkey)).size }));
process.exit(0);

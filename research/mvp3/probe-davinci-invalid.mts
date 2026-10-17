// Focused invalid-input witness probes, not an automated test suite.
import { resolve } from 'node:path';
import * as snarkjs from './davinci-circom/js/node_modules/snarkjs/main.js';
import { BallotBuilder } from './davinci-circom/js/src/builder.ts';

const root = resolve(import.meta.dirname, 'davinci-circom');
const wasm = resolve(root, 'artifacts/ballot_proof.wasm');
const zkey = resolve(root, 'artifacts/ballot_proof_pkey.zkey');
const builder = await BallotBuilder.build();
const { pubKey } = builder.elgamal.generateKeyPair();
const config = { numFields: 2, groupSize: 2, uniqueValues: 0, maxValue: 1, minValue: 0, maxValueSum: 1, minValueSum: 1, costExponent: 1 };
const cases = [
  ['missing selection', [0, 0]],
  ['multiple selections', [1, 1]],
  ['out of range selection', [2, 0]],
] as const;
const results: { case: string; rejected: boolean }[] = [];
for (const [name, fields] of cases) {
  const inputs = builder.generateInputs([...fields], 1, pubKey, '12345', '0', builder.randomK(), config);
  try { await snarkjs.groth16.fullProve(inputs, wasm, zkey); results.push({ case: name, rejected: false }); }
  catch { results.push({ case: name, rejected: true }); }
}
const changedCipher = builder.generateInputs([0, 1], 1, pubKey, '12345', '0', builder.randomK(), config);
changedCipher.cipherfields[0][0][0] = (BigInt(changedCipher.cipherfields[0][0][0]) + 1n).toString();
try { await snarkjs.groth16.fullProve(changedCipher, wasm, zkey); results.push({ case: 'ciphertext witness mutation', rejected: false }); }
catch { results.push({ case: 'ciphertext witness mutation', rejected: true }); }
console.log(JSON.stringify(results));
if (results.some(row => !row.rejected)) process.exit(1);
process.exit(0);

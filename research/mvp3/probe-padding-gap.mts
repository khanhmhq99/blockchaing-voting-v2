// Focused synthetic contrast: the first public-signal patch permitted a third
// nonzero plaintext outside the two active candidates; the revised circuit
// must reject it even when all 16 ciphertexts and inputs_hash are consistent.
import * as snarkjs from './davinci-circom/js/node_modules/snarkjs/main.js';
import { BallotBuilder } from './davinci-circom/js/src/builder.ts';

const builder = await BallotBuilder.build();
const { pubKey } = builder.elgamal.generateKeyPair();
const mode = { numFields: 2, groupSize: 2, uniqueValues: 0, maxValue: 1, minValue: 0, maxValueSum: 1, minValueSum: 1, costExponent: 1 };
const witness = builder.generateInputs([0, 1, 1], 1, pubKey, '12345', '0', builder.randomK(), mode);
const old = await snarkjs.groth16.fullProve(witness,
  'research/mvp3/davinci-circom/artifacts-public/v1/ballot_proof.wasm',
  'research/mvp3/davinci-circom/artifacts-public/ballot_public_pkey.zkey');
const oldAccepted = old.publicSignals.length === 72;
let revisedRejected = false;
try {
  await snarkjs.groth16.fullProve(witness,
    'research/mvp3/davinci-circom/ballot_proof_js/ballot_proof.wasm',
    'research/mvp3/davinci-circom/artifacts-public/ballot_final_pkey.zkey');
} catch { revisedRejected = true; }
console.log(JSON.stringify({ case: 'nonzero third field when candidateCount=2', oldAccepted, revisedRejected }));
if (!oldAccepted || !revisedRejected) process.exitCode = 1;
process.exit(process.exitCode ?? 0);

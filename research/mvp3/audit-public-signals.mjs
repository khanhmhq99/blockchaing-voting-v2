// Focused, read-only review aid for the pinned research circuit and contract.
import { readFileSync } from 'node:fs';

const symbolFile = 'research/mvp3/davinci-circom/circuits/ballot_proof.sym';
const vkeyFile = 'research/mvp3/ceremony/ballot_final_vkey.json';
const lines = readFileSync(symbolFile, 'utf8').split(/\r?\n/);
const expected = [
  'packed_ballot_mode', 'address', 'weight', 'process_id', 'vote_id',
  'encryption_pubkey[0]', 'encryption_pubkey[1]',
];
for (let field = 0; field < 16; field++) {
  for (let point = 0; point < 2; point++) {
    for (let coordinate = 0; coordinate < 2; coordinate++) {
      expected.push(`cipherfields[${field}][${point}][${coordinate}]`);
    }
  }
}
expected.push('inputs_hash');
if (expected.length !== 72) throw new Error('Expected signal mapping must contain 72 elements');
for (let index = 0; index < expected.length; index++) {
  const columns = lines[index]?.split(',');
  if (columns?.length !== 4 || Number(columns[0]) !== index + 1
    || Number(columns[1]) !== index + 1 || columns[3] !== `main.${expected[index]}`) {
    throw new Error(`Public signal ${index} differs: expected main.${expected[index]}, got ${lines[index]}`);
  }
}
const vkey = JSON.parse(readFileSync(vkeyFile, 'utf8'));
if (vkey.nPublic !== 72 || vkey.IC.length !== 73) throw new Error('Final verification key does not match 72 public signals');
console.log(JSON.stringify({ publicSignals: 72, symbolOrderMatched: true, vkeyInputCountMatched: true,
  first: expected[0], last: expected.at(-1), ciphertextRange: [7, 70] }));

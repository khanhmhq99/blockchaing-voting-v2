// Run from the ignored DAVINCI clone root. The npm circom2 CLI has a Windows
// witness-WASM output-path issue; its programmatic WASI runner writes the WASM.
// Generate R1CS and .sym separately with the circom2 CLI using `-o .`.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { CircomRunner, bindings } = require('./davinci-circom/node_modules/circom2');

const wasmPath = 'ballot_proof_js/ballot_proof.wasm';
if (fs.existsSync(wasmPath)) {
  const actual = createHash('sha256').update(fs.readFileSync(wasmPath)).digest('hex');
  if (actual !== 'f472e9583cc88f1cb0ffed435bd9c43479690d16f0001c01768a946a417e6e4c') {
    throw new Error('Existing research witness WASM has an unexpected hash');
  }
  process.stdout.write('Pinned research witness WASM already exists; no regeneration needed.\n');
  process.exit(0);
}

const preopens = {};
let cwd = process.cwd();
while (true) {
  const segment = path.relative(process.cwd(), cwd) || '.';
  preopens[segment] = segment;
  const next = path.dirname(cwd);
  if (next === cwd) break;
  cwd = next;
}
const runner = new CircomRunner({
  args: ['circuits/ballot_proof.circom', '--wasm', '-o', '.', '-l', 'circuits', '-l', 'node_modules'],
  env: process.env,
  preopens,
  bindings: { ...bindings, fs },
});
runner.execute(fs.readFileSync(require.resolve('./davinci-circom/node_modules/circom2/circom.wasm')))
  .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });

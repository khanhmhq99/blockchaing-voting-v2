// One-time local research ceremony preparation. Never logs or persists entropy.
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { zKey } from './davinci-circom/js/node_modules/snarkjs/main.js';

const root = resolve('research/mvp3');
const upstream = resolve(root, 'davinci-circom');
const inputs = {
  r1cs: [resolve(upstream, 'circuits/ballot_proof.r1cs'), '42081cdba74a1e0cce3b688fcc23fc4b7399b278be7995b7b0be8af7d4bcdd10'],
  ptau: [resolve(upstream, 'artifacts-public/ptau_final.ptau'), '9693220206afab749e3d88d4ab5fdf5d36120ea102e7e587ccea0e7a5208e711'],
  zeroKey: [resolve(upstream, 'artifacts-public/ballot_final_pkey.zkey'), '8805314124beabe73f21a902d8823e7f45742aba0954735649b0c8b7743d12a8'],
  wasm: [resolve(upstream, 'ballot_proof_js/ballot_proof.wasm'), 'f472e9583cc88f1cb0ffed435bd9c43479690d16f0001c01768a946a417e6e4c'],
  patch: [resolve(root, 'ballot-public-signals.patch'), '8b948152b2abdb4d9447f8d4d0b5e8701c4518de637b09b7a12ae17ac2e243d9'],
};
const ceremony = resolve(root, 'ceremony');
const handoff = resolve(ceremony, 'handoff-0001');
const ownerKey = resolve(ceremony, 'ballot_0001.zkey');
const manifestPath = resolve(ceremony, 'manifest-0001.json');

async function sha256(path) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(path)) digest.update(chunk);
  return digest.digest('hex');
}

for (const [label, [path, expected]] of Object.entries(inputs)) {
  if (!existsSync(path) || await sha256(path) !== expected) throw new Error(`Frozen ${label} missing or SHA-256 mismatch`);
}
if (existsSync(ownerKey) || existsSync(manifestPath) || existsSync(handoff)) {
  if (!existsSync(ownerKey) || !existsSync(manifestPath) || !existsSync(handoff)) {
    throw new Error('Partial ceremony output exists; inspect it before rerunning');
  }
  const previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
  if (previous.schema !== 'hcmut-mvp3-phase2-handoff-v1'
    || previous.ownerContribution.independentlyControlled !== false
    || previous.phase2IndependentContributionComplete !== false
    || await sha256(ownerKey) !== previous.files['ballot_0001.zkey'].sha256) {
    throw new Error('Existing ceremony manifest or owner key is inconsistent');
  }
  for (const [name, metadata] of Object.entries(previous.files)) {
    const path = resolve(handoff, name);
    if (!existsSync(path) || statSync(path).size !== metadata.bytes || await sha256(path) !== metadata.sha256) {
      throw new Error(`Existing handoff file is inconsistent: ${name}`);
    }
  }
  if (await sha256(resolve(handoff, 'manifest-0001.json')) !== await sha256(manifestPath)) {
    throw new Error('Existing handoff manifest differs from local manifest');
  }
  console.log(JSON.stringify({ reused: true, handoff, ownerKeySha256: previous.files['ballot_0001.zkey'].sha256,
    contributionHash: previous.ownerContribution.contributionHash, verified: previous.ownerZkeyVerifiedAgainstR1csAndPtau }));
  process.exit(0);
}

mkdirSync(ceremony, { recursive: true });
const tempKey = resolve(ceremony, 'ballot_0001.incomplete.zkey');
if (existsSync(tempKey)) throw new Error('Incomplete contribution exists; inspect it before rerunning');

// snarkjs mixes this OS CSPRNG entropy with its own random bytes in getRandomRng.
// The entropy remains in process memory and is never placed on a command line.
const contributionHash = Buffer.from(await zKey.contribute(
  inputs.zeroKey[0], tempKey, 'Owner workstation 1 (automated)', randomBytes(64).toString('hex'),
)).toString('hex');
renameSync(tempKey, ownerKey);
const verified = await zKey.verifyFromR1cs(inputs.r1cs[0], inputs.ptau[0], ownerKey);
if (!verified) throw new Error('Owner contribution failed snarkjs zkey verification');

mkdirSync(handoff);
const names = {
  r1cs: 'ballot_proof.r1cs',
  ptau: 'ptau_final.ptau',
  ownerKey: 'ballot_0001.zkey',
  wasm: 'ballot_proof.wasm',
  patch: 'ballot-public-signals.patch',
};
for (const [label, name] of Object.entries(names)) {
  copyFileSync(label === 'ownerKey' ? ownerKey : inputs[label][0], resolve(handoff, name));
}
const files = {};
for (const name of Object.values(names)) {
  const path = resolve(handoff, name);
  files[name] = { bytes: statSync(path).size, sha256: await sha256(path) };
}
const manifest = {
  schema: 'hcmut-mvp3-phase2-handoff-v1',
  createdAt: new Date().toISOString(),
  node: process.version,
  snarkjs: '0.7.6',
  upstreamCommit: 'a39a9f9867bb70726ad2137ed536d75670e042b9',
  circuitHash: 'fc26682b66eb5f71597a56683abb58c618340528923761b1fd8ffe407b343ae50c29e355010a6e1748d4d321f9a306e4a17195718481b65b3678ed12c8380069',
  zeroKeySha256: inputs.zeroKey[1],
  ownerContribution: { label: 'Owner workstation 1 (automated)', contributionHash, independentlyControlled: false },
  ownerZkeyVerifiedAgainstR1csAndPtau: true,
  phase2IndependentContributionComplete: false,
  finalBeaconComplete: false,
  files,
};
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
copyFileSync(manifestPath, resolve(handoff, 'manifest-0001.json'));
const guide = resolve('docs/mvp3/SECOND_CONTRIBUTOR_GUIDE.md');
if (existsSync(guide)) copyFileSync(guide, resolve(handoff, 'SECOND_CONTRIBUTOR_GUIDE.md'));
console.log(JSON.stringify({ handoff, ownerKeySha256: files[names.ownerKey].sha256, contributionHash,
  verified, files: Object.fromEntries(Object.entries(files).map(([name, value]) => [name, value.sha256])) }));
// snarkjs/ffjavascript can leave worker handles alive after the ceremony is complete.
process.exit(0);

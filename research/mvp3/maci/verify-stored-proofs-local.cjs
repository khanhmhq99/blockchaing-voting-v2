// Verify stored synthetic MACI proofs against the actual Solidity verifier on an ephemeral local EVM.
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../..');
const runtime = path.join(__dirname, 'runtime-env/node_modules');
process.env.HARDHAT_CONFIG = path.join(__dirname, 'hardhat-persistent.config.cjs');
process.env.HARDHAT_NETWORK = 'hardhat';
const hardhat = require(path.join(runtime, '@maci-protocol/contracts/node_modules/hardhat'));
const contracts = require(path.join(runtime, '@maci-protocol/contracts'));
const { VerifyingKey } = require(path.join(runtime, '@maci-protocol/domainobjs'));
const proofDir = path.join(__dirname, 'probe-output/local-m1/invalid-proof-probe/proofs');

async function main() {
  if (Number((await hardhat.ethers.provider.getNetwork()).chainId) !== 31337) throw new Error('Local proof verification requires chain 31337');
  const [signer] = await hardhat.ethers.getSigners();
  const verifier = await new contracts.Verifier__factory(signer).deploy();
  await verifier.waitForDeployment();
  const results = [];
  for (const [kind, keyName] of [
    ['process', 'messageprocessorfull_14-25-3'],
    ['tally', 'votetallynonqv_14-5-3'],
  ]) {
    const record = JSON.parse(fs.readFileSync(path.join(proofDir, `${kind}_0.json`), 'utf8'));
    const key = VerifyingKey.fromObj(JSON.parse(fs.readFileSync(path.join(root, 'research/mvp3/maci/artifacts', `${keyName}.vkey.json`), 'utf8'))).asContractParam();
    const proof = contracts.formatProofForVerifierContract(record.proof);
    const inputs = record.publicInputs.map(value => BigInt(value));
    const valid = await verifier.verify(proof, key, inputs);
    const altered = [...inputs];
    altered[0] += 1n;
    let mutatedAccepted = false;
    try { mutatedAccepted = await verifier.verify(proof, key, altered); }
    catch { /* A revert also rejects the modified proof. */ }
    results.push({ kind, valid, mutatedAccepted });
    if (!valid || mutatedAccepted) throw new Error(`Solidity verifier outcome was incorrect for ${kind}`);
  }
  process.stdout.write(`${JSON.stringify({ chainId: 31337, results })}\n`);
}
main().catch(error => {
  process.stderr.write(`Local proof verification failed: ${error.message}\n`);
  process.exitCode = 1;
}).finally(async () => { await contracts.cleanThreads(); });

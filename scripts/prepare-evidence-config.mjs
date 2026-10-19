// Prepare a historical public configuration descriptor without claiming retroactive binding.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, part, index, all) => {
  if (index % 2 === 0) pairs.push([part, all[index + 1]]);
  return pairs;
}, []));
if (!args['--deployment'] || !args['--manifest'] || !args['--election-id'] || !args['--out'] || !/^[0-9a-f-]{36}$/i.test(args['--election-id'])) {
  process.stderr.write('Usage: node scripts/prepare-evidence-config.mjs --deployment <deployment.json> --manifest <manifest.json> --election-id <uuid> --out <config.json>\n');
  process.exit(1);
}
const deployment = JSON.parse(fs.readFileSync(args['--deployment'], 'utf8'));
const manifest = JSON.parse(fs.readFileSync(args['--manifest'], 'utf8'));
if (!Array.isArray(deployment.candidates) || deployment.candidates.length !== manifest.tally?.length || deployment.pollId !== manifest.pollId || deployment.chainId !== manifest.chainId || deployment.maciAddress.toLowerCase() !== manifest.maciAddress.toLowerCase()) throw new Error('Deployment and public evidence do not match');
const config = {
  format: 'maci-election-config-v1', candidateBinding: 'legacy-unbound', electionId: args['--election-id'],
  protocol: manifest.protocol, chainId: String(manifest.chainId), maciAddress: manifest.maciAddress,
  pollAddress: manifest.pollAddress, pollId: manifest.pollId, deploymentBlock: String(manifest.deploymentBlock),
  coordinatorKeyX: deployment.coordinatorPublicKey.x, coordinatorKeyY: deployment.coordinatorPublicKey.y,
  startTimestamp: String(deployment.startTimestamp), endTimestamp: String(deployment.endTimestamp),
  voteOptions: deployment.candidates.length,
  candidates: deployment.candidates.map((name, optionIndex) => ({ id: `legacy-option-${optionIndex}`, optionIndex, name })),
  artifactHashes: manifest.artifactHashes,
};
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const bytes = `${canonical(config)}\n`;
fs.writeFileSync(args['--out'], bytes, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ path: args['--out'], canonicalSha256: createHash('sha256').update(bytes).digest('hex'), candidateBinding: 'legacy-unbound' })}\n`);

// Prepare public coordinator inputs from a verified deployment record.
// This command never reads or writes coordinator secrets and never submits a transaction.
import fs from 'node:fs';
import path from 'node:path';
const inputPath = process.argv[2];
if (!inputPath) throw new Error('Usage: node scripts/prepare-maci-coordinator-config.mjs <deployment.json>');
const deployment = JSON.parse(fs.readFileSync(path.resolve(inputPath), 'utf8'));
if (![31337, 97].includes(deployment.chainId) || !/^[a-z0-9_-]{1,64}$/.test(deployment.runId) || !/^0x[0-9a-fA-F]{40}$/.test(deployment.maciAddress) || !/^(0|[1-9][0-9]*)$/.test(deployment.pollId) || !Number.isSafeInteger(deployment.deploymentBlock) || deployment.deploymentBlock < 0 || !Array.isArray(deployment.candidates) || deployment.candidates.length < 2 || deployment.candidates.length > 125) throw new Error('Invalid MACI deployment record');
const config = {
  runId: deployment.runId, chainId: deployment.chainId, maciAddress: deployment.maciAddress,
  ...(deployment.genesisHash ? { genesisHash: deployment.genesisHash } : {}),
  pollId: deployment.pollId, deploymentBlock: deployment.deploymentBlock, voteOptions: deployment.candidates.length,
};
const output = path.join(path.dirname(path.resolve(inputPath)), 'coordinator-config.json');
fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`Public coordinator configuration written: ${output}\n`);

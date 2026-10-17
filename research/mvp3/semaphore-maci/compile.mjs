import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import solc from 'solc';

const filename = 'SemaphoreMaciRegistration.sol';
const pollFilename = 'ResearchOpenPollJoinPolicy.sol';
const input = {
  language: 'Solidity',
  sources: {
    [filename]: { content: readFileSync(resolve(import.meta.dirname, filename), 'utf8') },
    [pollFilename]: { content: readFileSync(resolve(import.meta.dirname, pollFilename), 'utf8') },
  },
  settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
for (const issue of output.errors ?? []) process.stderr.write(`${issue.formattedMessage}\n`);
if (output.errors?.some(issue => issue.severity === 'error')) process.exit(1);
const contract = output.contracts[filename].SemaphoreMaciRegistration;
const poll = output.contracts[pollFilename].ResearchOpenPollJoinPolicy;
process.stdout.write(`${JSON.stringify({ compiler: solc.version(), wrapperBytecodeBytes: contract.evm.bytecode.object.length / 2, pollPolicyBytecodeBytes: poll.evm.bytecode.object.length / 2, functions: contract.abi.filter(item => item.type === 'function').map(item => item.name) })}\n`);

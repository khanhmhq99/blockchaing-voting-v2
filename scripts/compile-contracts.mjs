import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import solc from 'solc';

const source = readFileSync('packages/contracts/contracts/BasicVoting.sol', 'utf8');
const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } };
const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { 'BasicVoting.sol': { content: source } }, settings }), { import: path => ({ contents: readFileSync(`node_modules/${path}`, 'utf8') }) }));
for (const error of output.errors ?? []) console.error(error.formattedMessage);
if (output.errors?.some(e => e.severity === 'error')) process.exit(1);
const artifact = output.contracts['BasicVoting.sol'].BasicVoting;
mkdirSync('packages/contracts/generated', { recursive: true });
mkdirSync('packages/contracts/src', { recursive: true });
writeFileSync('packages/contracts/generated/BasicVoting.json', JSON.stringify({ abi: artifact.abi, bytecode: `0x${artifact.evm.bytecode.object}`, compiler: solc.version(), settings }, null, 2) + '\n');
writeFileSync('packages/contracts/src/abi.ts', '// Generated from BasicVoting.sol by npm run build:contracts.\nexport const votingAbi = ' + JSON.stringify(artifact.abi, null, 2) + ' as const;\n');
console.log(`Compiled BasicVoting with ${solc.version()}, EVM paris, optimizer 200.`);

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import solc from 'solc';

const settings = { optimizer: { enabled: true, runs: 200 }, evmVersion: 'cancun', outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } };
mkdirSync('packages/contracts/generated', { recursive: true });
mkdirSync('packages/contracts/src', { recursive: true });
for (const name of ['SponsoredMaciRegistration', 'OpenMaciPollJoinPolicy']) {
  const file = `${name}.sol`;
  const content = readFileSync(`packages/contracts/contracts/${file}`, 'utf8');
  const output = JSON.parse(solc.compile(JSON.stringify({ language: 'Solidity', sources: { [file]: { content } }, settings }), { import: path => ({ contents: readFileSync(`node_modules/${path}`, 'utf8') }) }));
  for (const error of output.errors ?? []) console.error(error.formattedMessage);
  if (output.errors?.some(error => error.severity === 'error')) process.exit(1);
  const contract = output.contracts[file][name];
  writeFileSync(`packages/contracts/generated/${name}.json`, JSON.stringify({ abi: contract.abi, bytecode: `0x${contract.evm.bytecode.object}`, compiler: solc.version(), settings }, null, 2) + '\n');
  const exportName = name === 'SponsoredMaciRegistration' ? 'sponsoredMaciRegistrationAbi' : 'openMaciPollJoinPolicyAbi';
  const outputName = name === 'SponsoredMaciRegistration' ? 'sponsored-maci-registration-abi.ts' : 'open-maci-poll-join-policy-abi.ts';
  writeFileSync(`packages/contracts/src/${outputName}`, `// Generated from ${file} by npm run build:contracts.\nexport const ${exportName} = ${JSON.stringify(contract.abi, null, 2)} as const;\n`);
  console.log(`Compiled ${name} with ${solc.version()}, EVM cancun, optimizer 200.`);
}

// Read-only MACI BSC Testnet deployment preflight. Never sends a transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Interface, Wallet } from 'ethers';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.CHAIN_ID !== '97') throw new Error('BSC preflight requires CHAIN_ID=97');
const rpcUrl = process.env.MACI_RPC_URL ?? process.env.RPC_URL;
const rpc = rpcUrl && new URL(rpcUrl);
if (!rpc || rpc.protocol !== 'https:' || rpc.username || rpc.password || rpc.hash) throw new Error('BSC preflight requires an HTTPS RPC URL');
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;
const issuerKey = process.env.MACI_ISSUER_PRIVATE_KEY;
if (!/^0x[0-9a-fA-F]{64}$/.test(deployerKey ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(issuerKey ?? '')) throw new Error('BSC preflight requires configured EVM keys');
const from = new Wallet(deployerKey).address;
const issuer = new Wallet(issuerKey).address;
let requestId = 0;
async function call(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++requestId, method, params }),
    signal: globalThis.AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status} for ${method}`);
  const data = await response.json();
  if (data.error) throw new Error(`RPC error ${data.error.code} for ${method}`);
  return data.result;
}
const chainId = Number(BigInt(await call('eth_chainId')));
if (chainId !== 97) throw new Error('RPC is not BSC Testnet');
const block = await call('eth_getBlockByNumber', ['latest', false]);
const gasPrice = BigInt(await call('eth_gasPrice'));
const balance = BigInt(await call('eth_getBalance', [from, 'latest']));
const nonce = Number(BigInt(await call('eth_getTransactionCount', [from, 'pending'])));

const upstreamDir = path.join(root, 'node_modules/@maci-protocol/contracts/build/artifacts/contracts');
const buildInfoDir = path.join(root, 'node_modules/@maci-protocol/contracts/build/artifacts/build-info');
const buildInfos = fs.readdirSync(buildInfoDir).filter(name => name.endsWith('.json'));
if (buildInfos.length !== 1) throw new Error('Expected one pinned upstream Solidity build-info file');
const buildInfo = JSON.parse(fs.readFileSync(path.join(buildInfoDir, buildInfos[0]), 'utf8'));
if (buildInfo.solcVersion !== '0.8.28' || buildInfo.input?.settings?.evmVersion !== 'paris' ||
    buildInfo.input?.settings?.optimizer?.enabled !== true || buildInfo.input?.settings?.optimizer?.runs !== 200) {
  throw new Error('Upstream Solidity compiler settings changed');
}
const upstream = new Map();
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (entry.name.endsWith('.json') && !entry.name.endsWith('.dbg.json')) {
      const artifact = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (typeof artifact.bytecode === 'string' && artifact.bytecode.startsWith('0x')) upstream.set(entry.name.slice(0, -5), artifact);
    }
  }
}
walk(upstreamDir);
const stages = [
  ['SponsoredMaciRegistration', 'custom'], ['OpenMaciPollJoinPolicy', 'custom'],
  ['PoseidonT3', 'upstream'], ['PoseidonT4', 'upstream'], ['PoseidonT5', 'upstream'], ['PoseidonT6', 'upstream'],
  ['PollFactory', 'upstream'], ['MessageProcessorFactory', 'upstream'], ['TallyFactory', 'upstream'],
  ['Verifier', 'upstream'], ['VerifyingKeysRegistry', 'upstream'], ['MACI', 'upstream'],
  ['ConstantInitialVoiceCreditProxyFactory', 'upstream'], ['ConstantInitialVoiceCreditProxy', 'upstream'],
  ['Poll', 'upstream'], ['MessageProcessor', 'upstream'], ['Tally', 'upstream'],
];
const contracts = [];
for (const [name, source] of stages) {
  const artifact = source === 'custom'
    ? JSON.parse(fs.readFileSync(path.join(root, 'packages/contracts/generated', `${name}.json`), 'utf8'))
    : upstream.get(name);
  if (!artifact) throw new Error(`Missing compiled artifact ${name}`);
  if (source === 'custom' && (!artifact.compiler?.startsWith('0.8.37+') ||
      artifact.settings?.evmVersion !== 'cancun' || artifact.settings?.optimizer?.runs !== 200)) {
    throw new Error(`Custom Solidity compiler settings changed: ${name}`);
  }
  const creationBytes = (artifact.bytecode.length - 2) / 2;
  const runtimeBytes = artifact.deployedBytecode ? (artifact.deployedBytecode.length - 2) / 2 : null;
  if (creationBytes > 49152 || (runtimeBytes !== null && runtimeBytes > 24576)) throw new Error(`EVM bytecode size limit exceeded: ${name}`);
  const constructor = artifact.abi.find(item => item.type === 'constructor');
  const inputs = constructor?.inputs ?? [];
  const linked = artifact.bytecode.includes('__$');
  const args = name === 'SponsoredMaciRegistration' ? [issuer]
    : name === 'VerifyingKeysRegistry' ? [from] : [];
  const canEstimate = !linked && inputs.length === args.length &&
    (inputs.length === 0 || ['SponsoredMaciRegistration', 'VerifyingKeysRegistry'].includes(name));
  let gasEstimate = null;
  let estimateError = null;
  if (canEstimate) {
    const data = artifact.bytecode + new Interface(artifact.abi).encodeDeploy(args).slice(2);
    try { gasEstimate = BigInt(await call('eth_estimateGas', [{ from, data }])).toString(); }
    catch (error) { estimateError = error instanceof Error ? error.name : 'unknown'; }
  }
  contracts.push({ name, creationBytes, runtimeBytes, linked, gasEstimate, estimateError });
}
const estimatedGas = contracts.reduce((sum, contract) => sum + BigInt(contract.gasEstimate ?? 0), 0n);
const report = {
  chainId, blockNumber: Number(BigInt(block.number)), blockGasLimit: BigInt(block.gasLimit).toString(),
  gasPriceWei: gasPrice.toString(), deployerBalanceWei: balance.toString(), pendingNonce: nonce,
  upstreamCompiler: { solc: buildInfo.solcVersion, evmVersion: buildInfo.input.settings.evmVersion, optimizerRuns: buildInfo.input.settings.optimizer.runs },
  estimatedSubsetGas: estimatedGas.toString(), estimatedSubsetCostWei: (estimatedGas * gasPrice).toString(),
  contracts,
  limitation: 'Read-only estimates exclude linked libraries, constructor-dependent and factory-created contracts; no BSC transaction or proof verification occurred.',
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

// Read-only BSC Testnet RPC probe. Never calls eth_sendTransaction or broadcasts.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { encodeDeployData } from 'viem';

const base = resolve(import.meta.dirname);
const code = JSON.parse(readFileSync(resolve(base, 'outputs/creation-code.json'), 'utf8'));
const info = JSON.parse(readFileSync(resolve(base, 'outputs/semaphore/proofs.json'), 'utf8'));
const endpoint = 'https://bsc-testnet-dataseed.bnbchain.org';
const from = '0x000000000000000000000000000000000000dEaD';
let id = 1;
async function rpc(method, params = []) {
  const response = await fetch(endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: id++, method, params }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${method}: HTTP ${response.status}`);
  const result = await response.json();
  if (result.error) throw new Error(`${method}: ${result.error.code} ${result.error.message}`);
  return result.result;
}
const chainId = Number(BigInt(await rpc('eth_chainId')));
if (chainId !== 97) throw new Error(`Wrong chain: ${chainId}`);
const block = await rpc('eth_getBlockByNumber', ['latest', false]);
const price = BigInt(await rpc('eth_gasPrice'));
const estimates = {};
for (const name of ['poseidon', 'verifier', 'semaphore', 'registry']) {
  const artifact = code[name];
  let args = [];
  if (name === 'semaphore') args = ['0x0000000000000000000000000000000000000001'];
  if (name === 'registry') args = [
    '0x0000000000000000000000000000000000000001', 0n, BigInt(info.groupRoot),
    info.electionId, info.manifestDigest, info.contextDigest,
  ];
  const data = encodeDeployData({ abi: artifact.abi, bytecode: artifact.bytecode, args });
  try { estimates[name] = BigInt(await rpc('eth_estimateGas', [{ from, data }])).toString(); }
  catch (error) { estimates[name] = { error: error.message }; }
}
console.log(JSON.stringify({ endpoint, chainId, block: Number(BigInt(block.number)),
  blockGasLimit: BigInt(block.gasLimit).toString(), gasPriceWei: price.toString(),
  estimates, broadcast: false }));

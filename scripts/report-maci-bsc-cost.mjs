// Read-only receipt measurement for an already journaled chain-97 MACI deployment.
import fs from 'node:fs';
import path from 'node:path';
import { JsonRpcProvider } from 'ethers';

const id = process.argv[2];
if (process.env.CHAIN_ID !== '97' || !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Expected chain 97 and a deployment UUID');
const directory = path.resolve('research/mvp3/maci/probe-output/deployments', id);
const journal = JSON.parse(fs.readFileSync(path.join(directory, 'journal.json'), 'utf8'));
const config = JSON.parse(fs.readFileSync(path.join(directory, 'election-config.json'), 'utf8'));
const provider = new JsonRpcProvider(process.env.MACI_RPC_URL, 97, { batchMaxCount: 1 });
if (Number((await provider.getNetwork()).chainId) !== 97 ||
    (await provider.getBlock(0)).hash.toLowerCase() !== journal.identity.genesisHash) throw new Error('Chain fingerprint mismatch');
let deploymentGas = 0n;
let deploymentFee = 0n;
const transactions = [];
for (const entry of journal.entries) {
  if (entry.status !== 'confirmed') throw new Error('Deployment journal has an unconfirmed transaction');
  const receipt = await provider.getTransactionReceipt(entry.hash);
  if (!receipt || receipt.status !== 1 || receipt.blockHash.toLowerCase() !== entry.receipt.blockHash.toLowerCase()) throw new Error('Deployment receipt mismatch');
  const gas = receipt.gasUsed;
  const fee = receipt.fee;
  deploymentGas += gas;
  deploymentFee += fee;
  transactions.push({ stage: entry.stage, hash: entry.hash, blockNumber: receipt.blockNumber,
    gasUsed: gas.toString(), feeWei: fee.toString() });
}
const anchor = await provider.getTransactionReceipt(config.anchor.transactionHash);
if (!anchor || anchor.status !== 1) throw new Error('Candidate anchor receipt missing or reverted');
process.stdout.write(JSON.stringify({ runId: id, chainId: 97, transactionCount: transactions.length,
  deploymentGasUsed: deploymentGas.toString(), deploymentFeeWei: deploymentFee.toString(),
  anchor: { hash: anchor.hash, blockNumber: anchor.blockNumber, gasUsed: anchor.gasUsed.toString(),
    feeWei: anchor.fee.toString() }, transactions }) + '\n');

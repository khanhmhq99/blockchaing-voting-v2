// Read-only chain-97 deployment journal summary; signed bytes remain private.
import fs from 'node:fs';
import path from 'node:path';
import { JsonRpcProvider } from 'ethers';

const id = process.argv[2];
if (process.env.CHAIN_ID !== '97' || !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Expected chain 97 and a deployment job UUID');
const directory = path.resolve('research/mvp3/maci/probe-output/deployments', id);
const journal = JSON.parse(fs.readFileSync(path.join(directory, 'journal.json'), 'utf8'));
const provider = new JsonRpcProvider(process.env.MACI_RPC_URL);
if (Number((await provider.getNetwork()).chainId) !== 97 || (await provider.getBlock(0)).hash.toLowerCase() !== journal.identity.genesisHash) throw new Error('Journal chain fingerprint mismatch');
const head = await provider.getBlockNumber();
const last = journal.entries.at(-1);
const receipt = last ? await provider.getTransactionReceipt(last.hash) : null;
const transaction = last ? await provider.getTransaction(last.hash) : null;
process.stdout.write(`${JSON.stringify({ runId: id, head, entries: journal.entries.length,
  confirmed: journal.entries.filter(entry => entry.status === 'confirmed').length,
  last: last ? { stage: last.stage, status: last.status, hash: last.hash, nonce: last.nonce,
    transactionKnown: Boolean(transaction), receiptStatus: receipt?.status ?? null,
    receiptBlock: receipt?.blockNumber ?? null, confirmations: receipt ? head - receipt.blockNumber + 1 : 0 } : null,
  deploymentFile: fs.existsSync(path.join(directory, 'deployment.json')),
  anchorFile: fs.existsSync(path.join(directory, 'election-config.json')) })}\n`);

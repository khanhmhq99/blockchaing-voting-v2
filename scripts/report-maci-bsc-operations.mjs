// Read-only gas and fee measurements for synthetic registration/join/vote/proof receipts.
import fs from 'node:fs';
import path from 'node:path';
import { JsonRpcProvider } from 'ethers';
import * as contracts from '@maci-protocol/contracts';

const id = process.argv[2];
if (process.env.CHAIN_ID !== '97' || !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Expected chain 97 and an election UUID');
const mergeHash = process.argv[3];
if (mergeHash && !/^0x[0-9a-fA-F]{64}$/.test(mergeHash)) throw new Error('Optional merge hash must be a transaction hash');
const root = path.resolve('research/mvp3/maci/probe-output');
const directory = path.join(root, 'bsc-integration', id);
const journal = JSON.parse(fs.readFileSync(path.join(root, 'deployments', id, 'journal.json'), 'utf8'));
const registration = JSON.parse(fs.readFileSync(path.join(directory, 'registration-observation.json'), 'utf8'));
const voting = JSON.parse(fs.readFileSync(path.join(directory, 'voting-observation.json'), 'utf8'));
const refs = [
  ...registration.observations.map(row => ({ kind: 'registration', hash: row.registrationTransactionHash })),
  ...Object.values(voting).flatMap(row => [
    { kind: 'join', hash: row.join?.transactionHash },
    { kind: 'encrypted-command', hash: row.vote?.transactionHash },
  ]),
];
const manifestFile = path.join(root, 'coordinator', id, 'public', 'manifest.json');
let manifest;
if (fs.existsSync(manifestFile)) {
  manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  refs.push(...manifest.proofTransactions.map(row => ({ kind: row.kind, hash: row.hash })));
}
const provider = new JsonRpcProvider(process.env.MACI_RPC_URL, 97, { batchMaxCount: 1 });
if (Number((await provider.getNetwork()).chainId) !== 97 ||
    (await provider.getBlock(0)).hash.toLowerCase() !== journal.identity.genesisHash) throw new Error('Chain fingerprint mismatch');
if (manifest) {
  const configuration = JSON.parse(fs.readFileSync(path.join(root, 'deployments', id, 'election-config.json'), 'utf8'));
  if (configuration.chainId !== '97' || configuration.pollAddress.toLowerCase() !== manifest.pollAddress.toLowerCase())
    throw new Error('Candidate configuration scope mismatch');
  const pollInterface = contracts.Poll__factory.createInterface();
  const tallyInterface = contracts.Tally__factory.createInterface();
  const processBlock = manifest.proofTransactions.find(row => row.kind === 'process')?.blockNumber;
  const tallyBlock = manifest.proofTransactions.find(row => row.kind === 'tally')?.blockNumber;
  if (!processBlock || !tallyBlock || tallyBlock < processBlock) throw new Error('Proof block sequence invalid');
  if (mergeHash) {
    const merge = await provider.getTransaction(mergeHash);
    if (!merge || merge.to?.toLowerCase() !== manifest.pollAddress.toLowerCase() ||
        pollInterface.parseTransaction({ data: merge.data, value: merge.value })?.name !== 'mergeState')
      throw new Error('Signup merge transaction mismatch');
    refs.push({ kind: 'signup-merge', hash: mergeHash });
  }
  const updateHashes = [];
  for (let number = processBlock; number <= tallyBlock; number++) {
    const block = await provider.getBlock(number, true);
    if (!block) throw new Error('Proof interval block unavailable');
    for (const tx of block.prefetchedTransactions) {
      if (tx.to?.toLowerCase() !== manifest.tallyAddress.toLowerCase()) continue;
      const decoded = tallyInterface.parseTransaction({ data: tx.data, value: tx.value });
      if (decoded?.name === 'updateSbCommitment') updateHashes.push(tx.hash);
    }
  }
  if (updateHashes.length !== 1) throw new Error('Expected exactly one tally commitment update');
  refs.push({ kind: 'tally-commitment-update', hash: updateHashes[0] });
  const resultTopic = tallyInterface.getEvent('ResultAdded')?.topicHash;
  if (!resultTopic) throw new Error('ResultAdded event unavailable');
  const resultLogs = await provider.getLogs({ address: manifest.tallyAddress,
    topics: [resultTopic], fromBlock: tallyBlock, toBlock: manifest.snapshotBlock });
  const resultHashes = [...new Set(resultLogs.map(log => log.transactionHash))];
  if (resultHashes.length !== 1) throw new Error('Expected exactly one tally result submission');
  const resultTx = await provider.getTransaction(resultHashes[0]);
  if (!resultTx || tallyInterface.parseTransaction({ data: resultTx.data, value: resultTx.value })?.name !== 'addTallyResults')
    throw new Error('Tally result transaction mismatch');
  refs.push({ kind: 'tally-results', hash: resultHashes[0] });
}
if (refs.some(row => !/^0x[0-9a-fA-F]{64}$/.test(row.hash ?? '')) || new Set(refs.map(row => row.hash)).size !== refs.length)
  throw new Error('Missing or duplicate transaction hash');
const rows = [];
const totals = {};
for (const ref of refs) {
  const receipt = await provider.getTransactionReceipt(ref.hash);
  if (!receipt || receipt.status !== 1) throw new Error('Synthetic operation receipt is absent or reverted');
  const record = { kind: ref.kind, hash: ref.hash, blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(), feeWei: receipt.fee.toString() };
  rows.push(record);
  const current = totals[ref.kind] ?? { count: 0, gasUsed: 0n, feeWei: 0n };
  current.count += 1;
  current.gasUsed += receipt.gasUsed;
  current.feeWei += receipt.fee;
  totals[ref.kind] = current;
}
process.stdout.write(JSON.stringify({ electionId: id, chainId: 97,
  totals: Object.fromEntries(Object.entries(totals).map(([kind, row]) =>
    [kind, { count: row.count, gasUsed: row.gasUsed.toString(), feeWei: row.feeWei.toString() }])), rows }) + '\n');
await contracts.cleanThreads();

// Standalone MACI v3 public-evidence verifier. No API, Prisma or coordinator import.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { JsonRpcProvider, VoidSigner, keccak256 } from 'ethers';
import * as contracts from '@maci-protocol/contracts';
import * as sdk from '@maci-protocol/sdk';

const version = 'mvp4-verifier-v1';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  if (typeof value === 'string' || typeof value === 'boolean' || value === null) return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw issue('INVALID', 'NONCANONICAL_VALUE');
};
const issue = (status, code) => Object.assign(new Error(code), { status, code });
const requireThat = (condition, code, status = 'INVALID') => { if (!condition) throw issue(status, code); };
const uint = value => typeof value === 'string' && /^(0|[1-9][0-9]*)$/.test(value);
const addr = value => typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
const hash = value => typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const maxBytes = 2_000_000;
function readFile(dir, name) {
  const full = path.join(dir, name);
  let stat;
  try { stat = fs.statSync(full); } catch { throw issue('INCOMPLETE', `MISSING_${name.toUpperCase().replace(/\W/g, '_')}`); }
  requireThat(stat.isFile() && stat.size <= maxBytes, 'ARTIFACT_SIZE_INVALID');
  return fs.readFileSync(full);
}
function parse(bytes, code) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw issue('INVALID', code); }
}
function parseArgs() {
  const args = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    requireThat(key?.startsWith('--') && process.argv[i + 1] && !args[key.slice(2)], 'CLI_ARGUMENT_INVALID', 'ERROR');
    args[key.slice(2)] = process.argv[i + 1];
  }
  requireThat(args.evidence && args.rpc, 'CLI_ARGUMENT_MISSING', 'ERROR');
  return args;
}
function checkConfiguration(config, manifest, pinned) {
  requireThat(config?.format === 'maci-election-config-v1' && config.protocol === manifest.protocol, 'CONFIG_VERSION_UNSUPPORTED', 'UNSUPPORTED');
  const bytes = Buffer.from(`${canonical(config)}\n`, 'utf8');
  requireThat(sha(bytes) === pinned, 'CONFIG_PIN_MISMATCH');
  requireThat(uint(config.chainId) && uint(config.pollId) && uint(config.deploymentBlock) && uint(config.startTimestamp) && uint(config.endTimestamp), 'CONFIG_FORMAT_INVALID');
  requireThat(Number(config.chainId) === manifest.chainId && config.pollId === manifest.pollId && Number(config.deploymentBlock) === manifest.deploymentBlock && same(config.maciAddress, manifest.maciAddress) && same(config.pollAddress, manifest.pollAddress), 'CONFIG_SCOPE_MISMATCH');
  requireThat(Array.isArray(config.candidates) && config.candidates.length === manifest.tally.length && config.candidates.length === config.voteOptions, 'CANDIDATE_COUNT_MISMATCH');
  const ids = new Set();
  for (let i = 0; i < config.candidates.length; i++) {
    const row = config.candidates[i];
    requireThat(row && typeof row.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(row.id) && row.optionIndex === i && !ids.has(row.id), 'CANDIDATE_MAPPING_INVALID');
    ids.add(row.id);
  }
  requireThat(config.candidateBinding === 'onchain-pre-election-hash-v1', 'CANDIDATE_BINDING_UNSUPPORTED', 'UNSUPPORTED');
  requireThat(config.anchor && hash(config.anchor.transactionHash) && addr(config.anchor.sender), 'ANCHOR_REFERENCE_MISSING', 'INCOMPLETE');
  requireThat(config.artifactHashes && canonical(config.artifactHashes) === canonical(manifest.artifactHashes), 'ARTIFACT_IDENTITY_MISMATCH');
  requireThat(config.codeHashes && ['maci', 'poll', 'messageProcessor', 'tally'].every(key => hash(config.codeHashes[key])), 'CODE_HASH_PIN_MISSING', 'UNSUPPORTED');
  return sha(bytes);
}
async function replayLogs(provider, manifest, events) {
  const groups = [
    ['SignUp', manifest.maciAddress, contracts.MACI__factory.createInterface()],
    ['PollJoined', manifest.pollAddress, contracts.Poll__factory.createInterface()],
    ['PublishMessage', manifest.pollAddress, contracts.Poll__factory.createInterface()],
  ];
  requireThat(Array.isArray(events) && events.length <= 100_000, 'EVENT_FORMAT_INVALID');
  requireThat(events.length === Object.values(manifest.eventCounts).reduce((a, b) => a + b, 0), 'EVENT_COUNT_MISMATCH');
  const seen = new Set();
  for (const [event, address, iface] of groups) {
    const expected = events.filter(row => row.event === event);
    const topic = iface.getEvent(event)?.topicHash;
    requireThat(!!topic, 'EVENT_TOPIC_UNSUPPORTED', 'UNSUPPORTED');
    const chain = [];
    for (let first = manifest.deploymentBlock; first <= manifest.snapshotBlock; first += 1000) {
      chain.push(...await provider.getLogs({ address, topics: [topic], fromBlock: first, toBlock: Math.min(first + 999, manifest.snapshotBlock) }));
    }
    requireThat(chain.length === expected.length && chain.length === manifest.eventCounts[event], 'EVENT_SET_MISMATCH');
    for (let i = 0; i < chain.length; i++) {
      const a = expected[i]; const b = chain[i];
      requireThat(a && b && Array.isArray(a.topics) && a.topics.every(hash) && same(a.address, b.address) && same(a.blockHash, b.blockHash) && same(a.transactionHash, b.transactionHash) && a.blockNumber === b.blockNumber && a.logIndex === b.index && same(a.data, b.data) && JSON.stringify(a.topics.map(x => x.toLowerCase())) === JSON.stringify(b.topics.map(x => x.toLowerCase())), 'EVENT_MISMATCH');
      const key = `${a.transactionHash}:${a.logIndex}`;
      requireThat(!seen.has(key), 'DUPLICATE_EVENT'); seen.add(key);
      const receipt = await provider.getTransactionReceipt(a.transactionHash);
      requireThat(!!receipt, 'EVENT_RECEIPT_MISSING', 'INCOMPLETE');
      requireThat(receipt.status === 1 && receipt.blockNumber === a.blockNumber && same(receipt.blockHash, a.blockHash) && receipt.logs.some(log => log.index === a.logIndex && same(log.address, a.address) && same(log.data, a.data)), 'EVENT_RECEIPT_MISMATCH');
    }
  }
}
async function proofChecks(provider, manifest, proofs, maci, addresses, tallyData) {
  const runner = provider;
  const processor = contracts.MessageProcessor__factory.connect(addresses.messageProcessor, runner);
  const tally = contracts.Tally__factory.connect(addresses.tally, runner);
  const poll = contracts.Poll__factory.connect(addresses.poll, runner);
  requireThat(await processor.processingComplete() && await tally.isTallied(), 'PROCESSING_INCOMPLETE', 'INCOMPLETE');
  requireThat(BigInt(manifest.eventCounts.PublishMessage) === await poll.numMessages() && BigInt(manifest.eventCounts.SignUp + 1) === await maci.totalSignups(), 'CHAIN_EVENT_COUNT_MISMATCH');
  requireThat(Array.isArray(proofs) && proofs.length === manifest.proofTransactions.length && proofs.length <= 128, 'PROOF_SET_MISMATCH');
  const ordered = ['process', 'tally'].flatMap(kind => proofs.filter(row => row.name?.startsWith(`${kind}_`)).sort((a, b) => Number(a.name.match(/\d+/)?.[0]) - Number(b.name.match(/\d+/)?.[0])));
  const refs = ['process', 'tally'].flatMap(kind => manifest.proofTransactions.filter(row => row.kind === kind));
  for (const kind of ['process', 'tally']) {
    const subset = ordered.filter(row => row.name.startsWith(`${kind}_`));
    requireThat(subset.length > 0 && subset.every((row, i) => row.name === `${kind}_${i}.json`), 'PROOF_BATCH_GAP');
  }
  requireThat(refs.filter(x => x.kind === 'process').length === Number(await processor.totalBatchesProcessed()) && refs.filter(x => x.kind === 'tally').length === Number(await tally.tallyBatchNum()), 'PROOF_BATCH_INCOMPLETE', 'INCOMPLETE');
  const signer = new VoidSigner('0x0000000000000000000000000000000000000001', provider);
  const keys = await sdk.getAllOnChainVerifyingKeys({ verifyingKeysRegistryAddress: await maci.verifyingKeysRegistry(), signer, stateTreeDepth: 14, tallyProcessingStateTreeDepth: 5, voteOptionTreeDepth: 3, messageBatchSize: 25, mode: sdk.EMode.FULL });
  const verifier = contracts.Verifier__factory.connect(await maci.verifier(), runner);
  const allProofTxs = [];
  for (let blockNum = manifest.deploymentBlock; blockNum <= manifest.snapshotBlock; blockNum++) {
    const block = await provider.getBlock(blockNum);
    requireThat(!!block, 'CHAIN_HISTORY_MISSING', 'INCOMPLETE');
    for (const txHash of block.transactions) {
      const tx = await provider.getTransaction(txHash);
      if (tx?.to && [addresses.messageProcessor, addresses.tally].some(x => same(x, tx.to))) {
        const kind = same(tx.to, addresses.messageProcessor) ? 'process' : 'tally';
        const decoded = (kind === 'process' ? processor.interface : tally.interface).parseTransaction({ data: tx.data, value: tx.value });
        if (decoded?.name === (kind === 'process' ? 'processMessages' : 'tallyVotes')) allProofTxs.push(txHash.toLowerCase());
      }
    }
  }
  requireThat(JSON.stringify(allProofTxs) === JSON.stringify(manifest.proofTransactions.map(x => x.hash.toLowerCase())), 'PROOF_TX_SET_MISMATCH');
  for (let i = 0; i < ordered.length; i++) {
    const row = ordered[i]; const ref = refs[i];
    requireThat(row && ref && row.name === `${ref.kind}_${i - refs.findIndex(x => x.kind === ref.kind)}.json` && hash(ref.hash), 'PROOF_ORDER_INVALID');
    const tx = await provider.getTransaction(ref.hash);
    const receipt = await provider.getTransactionReceipt(ref.hash);
    const target = ref.kind === 'process' ? addresses.messageProcessor : addresses.tally;
    const decoded = tx && (ref.kind === 'process' ? processor.interface : tally.interface).parseTransaction({ data: tx.data, value: tx.value });
    requireThat(!!tx && !!receipt, 'PROOF_TRANSACTION_OR_RECEIPT_MISSING', 'INCOMPLETE');
    requireThat(receipt.status === 1 && same(tx.to, target) && receipt.blockNumber === ref.blockNumber && receipt.blockNumber <= manifest.snapshotBlock && same(receipt.blockHash, (await provider.getBlock(receipt.blockNumber))?.hash) && receipt.gasUsed.toString() === ref.gasUsed && decoded?.name === (ref.kind === 'process' ? 'processMessages' : 'tallyVotes'), 'PROOF_RECEIPT_MISMATCH');
    let published;
    try { published = contracts.formatProofForVerifierContract(row.proof); }
    catch { throw issue('INVALID', 'PROOF_FORMAT_INVALID'); }
    requireThat(JSON.stringify(Array.from(decoded.args[1], String)) === JSON.stringify(published), 'PROOF_CALLDATA_MISMATCH');
    requireThat(Array.isArray(row.publicInputs) && row.publicInputs.every(uint), 'PROOF_INPUT_INVALID');
    const key = ref.kind === 'process' ? keys.processVerifyingKeyOnChain : keys.tallyVerifyingKeyOnChain;
    const mutable = value => Array.isArray(value) ? Array.from(value, mutable) : value;
    requireThat(await verifier.verify(published, mutable(key), row.publicInputs.map(BigInt)).catch(() => false), ref.kind === 'process' ? 'PROCESS_PROOF_INVALID' : 'TALLY_PROOF_INVALID');
  }
  const commitments = sdk.generateTallyCommitments({ tallyData, voteOptionTreeDepth: 3 });
  requireThat(await sdk.verify({ maciAddress: manifest.maciAddress, pollId: BigInt(manifest.pollId), tallyData, tallyCommitments: commitments, totalVoteOptions: tallyData.results.tally.length, voteOptionTreeDepth: 3, signer }), 'TALLY_COMMITMENT_INVALID');
}
async function verify(args, checks, report) {
  const dir = path.resolve(args.evidence);
  const raw = Object.fromEntries(['manifest.json', 'events.ndjson', 'proofs.json', 'tally.json'].map(name => [name, readFile(dir, name)]));
  const manifest = parse(raw['manifest.json'], 'MANIFEST_JSON_INVALID');
  report.electionId = null;
  report.pollId = manifest.pollId ?? null; report.chainId = manifest.chainId ?? null;
  report.snapshot = { number: manifest.snapshotBlock ?? null, hash: manifest.snapshotBlockHash ?? null };
  report.evidenceManifestHash = sha(raw['manifest.json']);
  requireThat(manifest.protocol === 'maci-v3.0.0-full-v1', 'PROTOCOL_UNSUPPORTED', 'UNSUPPORTED');
  requireThat(Number.isSafeInteger(manifest.chainId) && Number.isSafeInteger(manifest.deploymentBlock) && Number.isSafeInteger(manifest.snapshotBlock) && manifest.snapshotBlock >= manifest.deploymentBlock && uint(manifest.pollId) && [manifest.maciAddress, manifest.pollAddress, manifest.messageProcessorAddress, manifest.tallyAddress].every(addr) && hash(manifest.snapshotBlockHash), 'MANIFEST_FORMAT_INVALID');
  requireThat(manifest.eventCounts && ['SignUp', 'PollJoined', 'PublishMessage'].every(key => Number.isSafeInteger(manifest.eventCounts[key]) && manifest.eventCounts[key] >= 0) && Array.isArray(manifest.proofTransactions) && manifest.proofTransactions.length >= 2 && manifest.proofTransactions.length <= 128 && manifest.proofTransactions.every(row => row && ['process', 'tally'].includes(row.kind) && hash(row.hash) && Number.isSafeInteger(row.blockNumber) && uint(row.gasUsed)) && manifest.evidenceHashes && manifest.artifactHashes, 'MANIFEST_FORMAT_INVALID');
  for (const [name, field] of [['events.ndjson', 'events'], ['proofs.json', 'proofs'], ['tally.json', 'tally']]) requireThat(sha(raw[name]) === manifest.evidenceHashes?.[field], 'ARTIFACT_HASH_MISMATCH');
  checks.push({ code: 'ARTIFACT_HASHES', status: 'PASS' });
  const events = raw['events.ndjson'].toString('utf8').trimEnd().split('\n').map(x => parse(Buffer.from(x), 'EVENT_JSON_INVALID'));
  const proofs = parse(raw['proofs.json'], 'PROOFS_JSON_INVALID');
  const tallyData = parse(raw['tally.json'], 'TALLY_JSON_INVALID');
  requireThat(tallyData && typeof tallyData === 'object' && tallyData.results && Array.isArray(tallyData.results.tally), 'TALLY_FORMAT_INVALID');
  requireThat(Array.isArray(manifest.tally) && manifest.tally.every(uint) && Array.isArray(tallyData.results?.tally) && tallyData.results.tally.slice(0, manifest.tally.length).every((x, i) => x === manifest.tally[i]) && tallyData.results.tally.slice(manifest.tally.length).every(x => x === '0'), 'TALLY_VALUES_MISMATCH');
  requireThat(args.config && args['config-sha256'], 'CONFIG_PIN_REQUIRED', 'UNSUPPORTED');
  const config = parse(readFile(path.dirname(path.resolve(args.config)), path.basename(args.config)), 'CONFIG_JSON_INVALID');
  report.electionId = config.electionId ?? null;
  report.configurationHash = checkConfiguration(config, manifest, args['config-sha256']);
  checks.push({ code: 'CANDIDATE_CONFIGURATION', status: 'PASS', trust: 'caller supplied hash; on-chain pre-election anchor still required' });
  const provider = new JsonRpcProvider(args.rpc);
  requireThat(Number((await provider.getNetwork()).chainId) === manifest.chainId, 'CHAIN_ID_MISMATCH');
  const head = await provider.getBlockNumber();
  const depth = Number(args.confirmations ?? 1);
  requireThat(Number.isSafeInteger(depth) && depth >= 1 && depth <= 100_000, 'CONFIRMATION_ARGUMENT_INVALID', 'ERROR');
  requireThat(head >= manifest.snapshotBlock + depth - 1, 'INSUFFICIENT_CONFIRMATIONS', 'INCOMPLETE');
  const snapshot = await provider.getBlock(manifest.snapshotBlock);
  requireThat(snapshot && same(snapshot.hash, manifest.snapshotBlockHash), 'SNAPSHOT_HASH_MISMATCH', 'INCOMPLETE');
  checks.push({ code: 'CANONICAL_SNAPSHOT', status: 'PASS', confirmations: head - manifest.snapshotBlock + 1 });
  const baseConfig = { ...config };
  delete baseConfig.anchor;
  const anchoredHash = sha(Buffer.from(`${canonical(baseConfig)}\n`, 'utf8'));
  const anchorTx = await provider.getTransaction(config.anchor.transactionHash);
  const anchorReceipt = await provider.getTransactionReceipt(config.anchor.transactionHash);
  requireThat(anchorTx && anchorReceipt && anchorReceipt.status === 1 && same(anchorTx.from, config.anchor.sender) && same(anchorTx.to, config.anchor.sender) && anchorTx.value === 0n && same(anchorTx.data, `0x${anchoredHash}`) && anchorReceipt.blockNumber <= manifest.snapshotBlock, 'CONFIG_ANCHOR_INVALID');
  const anchorBlock = await provider.getBlock(anchorReceipt.blockNumber);
  requireThat(anchorBlock && same(anchorBlock.hash, anchorReceipt.blockHash) && BigInt(anchorBlock.timestamp) < BigInt(config.startTimestamp), 'CONFIG_ANCHOR_LATE_OR_REORGED');
  checks.push({ code: 'PRE_ELECTION_CONFIG_ANCHOR', status: 'PASS', transactionHash: config.anchor.transactionHash });
  for (const [name, address] of [['maci', manifest.maciAddress], ['poll', manifest.pollAddress], ['messageProcessor', manifest.messageProcessorAddress], ['tally', manifest.tallyAddress]]) {
    const code = await provider.getCode(address, manifest.snapshotBlock);
    requireThat(code !== '0x', 'CONTRACT_CODE_MISSING');
    requireThat(same(keccak256(code), config.codeHashes[name]), 'CONTRACT_CODE_HASH_MISMATCH');
  }
  const maci = contracts.MACI__factory.connect(manifest.maciAddress, provider);
  const addresses = await maci.getPoll(BigInt(manifest.pollId), { blockTag: manifest.snapshotBlock });
  requireThat(same(addresses.poll, manifest.pollAddress) && same(addresses.messageProcessor, manifest.messageProcessorAddress) && same(addresses.tally, manifest.tallyAddress), 'POLL_ADDRESS_MISMATCH');
  const poll = contracts.Poll__factory.connect(addresses.poll, provider);
  const [key, start, end, options] = await Promise.all([poll.coordinatorPublicKey({ blockTag: manifest.snapshotBlock }), poll.startDate({ blockTag: manifest.snapshotBlock }), poll.endDate({ blockTag: manifest.snapshotBlock }), poll.voteOptions({ blockTag: manifest.snapshotBlock })]);
  requireThat(key.x.toString() === config.coordinatorKeyX && key.y.toString() === config.coordinatorKeyY && start.toString() === config.startTimestamp && end.toString() === config.endTimestamp && Number(options) === config.voteOptions, 'POLL_CONFIGURATION_MISMATCH');
  checks.push({ code: 'ONCHAIN_CONFIGURATION', status: 'PASS' });
  await replayLogs(provider, manifest, events);
  checks.push({ code: 'CANONICAL_EVENTS_AND_RECEIPTS', status: 'PASS' });
  await proofChecks(provider, manifest, proofs, maci, addresses, tallyData);
  checks.push({ code: 'MACI_PROOFS_AND_TALLY', status: 'PASS' });
  report.verifiedAggregateTally = config.candidates.map(row => ({ candidateId: row.id, optionIndex: row.optionIndex, tallyValue: manifest.tally[row.optionIndex] }));
}
const report = { verifierVersion: version, verifiedAt: new Date().toISOString(), verdict: 'ERROR', electionId: null, pollId: null, chainId: null, snapshot: null, evidenceManifestHash: null, checks: [], reasonCodes: [] };
try {
  await Promise.race([
    verify(parseArgs(), report.checks, report),
    new Promise((_, reject) => setTimeout(() => reject(issue('ERROR', 'RPC_OR_VERIFICATION_TIMEOUT')), 180_000)),
  ]);
  report.verdict = 'PASS';
} catch (error) {
  report.verdict = error?.status ?? 'ERROR';
  report.reasonCodes.push(error?.status ? error.code : 'RPC_OR_RUNTIME_ERROR');
  report.checks.push({ code: report.reasonCodes[0], status: report.verdict });
  delete report.verifiedAggregateTally;
  process.exitCode = { PASS: 0, INVALID: 2, INCOMPLETE: 3, UNSUPPORTED: 4, ERROR: 5 }[report.verdict];
} finally {
  await contracts.cleanThreads().catch(() => undefined);
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(process.exitCode ?? 0);
}

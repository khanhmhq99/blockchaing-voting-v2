// Explicit MACI v3 coordinator command. Never run automatically at API startup.
// Private witnesses remain in ignored research storage; public evidence is filtered.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import sdk from '@maci-protocol/sdk';
import domainobjs from '@maci-protocol/domainobjs';
import contracts from '@maci-protocol/contracts';
import { JsonRpcProvider, Wallet, NonceManager } from 'ethers';

const { Keypair, PrivateKey } = domainobjs;
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const configPath = process.argv[2];
if (!configPath) throw new Error('Usage: node scripts/maci-coordinator.mjs <public-election-config.json>');
const config = JSON.parse(fs.readFileSync(path.resolve(configPath), 'utf8'));
if (!config || !/^[a-z0-9_-]{1,64}$/.test(config.runId) || ![31337, 97].includes(config.chainId) || !/^0x[0-9a-fA-F]{40}$/.test(config.maciAddress) || !/^(0|[1-9][0-9]*)$/.test(config.pollId) || !Number.isSafeInteger(config.deploymentBlock) || config.deploymentBlock < 0 || !Number.isInteger(config.voteOptions) || config.voteOptions < 2 || config.voteOptions > 125) throw new Error('Invalid MACI coordinator configuration');
const coordinatorSecret = process.env.MACI_COORDINATOR_PRIVATE_KEY;
const proverKey = process.env.MACI_PROVER_PRIVATE_KEY;
const rpcUrl = process.env.MACI_RPC_URL || process.env.RPC_URL;
if (!coordinatorSecret || !/^macisk\.[0-9a-fA-F]{64}$/.test(coordinatorSecret) || !proverKey || !/^0x[0-9a-fA-F]{64}$/.test(proverKey) || !rpcUrl) throw new Error('MACI coordinator secrets or RPC are not configured');
if ([process.env.MACI_ISSUER_PRIVATE_KEY, process.env.MACI_RELAYER_PRIVATE_KEY, process.env.MACI_REGISTRATION_RELAYER_PRIVATE_KEY, process.env.MACI_JOIN_RELAYER_PRIVATE_KEY].some(value => value?.toLowerCase() === proverKey.toLowerCase())) throw new Error('MACI prover EVM key must be separate from issuer and relayers');
const output = path.join(repo, 'research/mvp3/maci/probe-output/coordinator', config.runId);
const resume = fs.existsSync(output) && JSON.parse(fs.readFileSync(path.join(output, 'checkpoint.json'), 'utf8')).stage === 'proofs-generated';
if (fs.existsSync(output) && !resume) throw new Error('Coordinator run ID already exists; use a fresh ID to preserve evidence');
fs.mkdirSync(path.join(output, 'private'), { recursive: true });
fs.mkdirSync(path.join(output, 'public'), { recursive: true });
process.chdir(output);

const artifactDir = path.join(repo, 'research/mvp3/maci/artifacts');
const circuitDir = path.join(repo, 'research/mvp3/maci/probe-output/circuits');
const key = name => path.join(artifactDir, `${name}.zkey`);
const wasm = name => path.join(circuitDir, `${name}_js`, `${name}.wasm`);
const stringify = value => JSON.stringify(value, (_, part) => typeof part === 'bigint' ? part.toString() : part, 2);
const line = value => JSON.stringify(value, (_, part) => typeof part === 'bigint' ? part.toString() : part);
function checkpoint(stage, extra = {}) {
  fs.writeFileSync(path.join(output, 'checkpoint.json'), `${stringify({ stage, ...extra, at: new Date().toISOString() })}\n`);
  process.stdout.write(`MACI coordinator: ${stage}\n`);
}
async function sha256(file) {
  const hash = createHash('sha256');
  for await (const part of fs.createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}
async function events(provider, address, topic, fromBlock, toBlock) {
  const rows = [];
  for (let start = fromBlock; start <= toBlock; start += 1000) {
    const stop = Math.min(start + 999, toBlock);
    for (const log of await provider.getLogs({ address, topics: [topic], fromBlock: start, toBlock: stop })) {
      rows.push({ address: log.address, blockNumber: log.blockNumber, blockHash: log.blockHash, transactionHash: log.transactionHash, logIndex: log.index, topics: log.topics, data: log.data });
    }
  }
  return rows;
}

async function main() {
  const provider = new JsonRpcProvider(rpcUrl, config.chainId);
  if (Number((await provider.getNetwork()).chainId) !== config.chainId) throw new Error('RPC chain mismatch');
  const signer = new NonceManager(new Wallet(proverKey, provider));
  const maci = contracts.MACI__factory.connect(config.maciAddress, signer);
  const pollAddresses = await maci.getPoll(BigInt(config.pollId));
  if (pollAddresses.poll === '0x0000000000000000000000000000000000000000') throw new Error('MACI poll does not exist');
  const poll = contracts.Poll__factory.connect(pollAddresses.poll, signer);
  const coordinator = new Keypair(PrivateKey.deserialize(coordinatorSecret));
  const onChainKey = await poll.coordinatorPublicKey();
  if (onChainKey.x !== coordinator.publicKey.raw[0] || onChainKey.y !== coordinator.publicKey.raw[1]) throw new Error('Coordinator key does not match the poll');
  if (Number(await poll.voteOptions()) !== config.voteOptions) throw new Error('Vote option count mismatch');
  if ((await provider.getBlock('latest')).timestamp <= Number(await poll.endDate())) throw new Error('Poll has not closed on chain');
  checkpoint('poll-checked', { poll: pollAddresses.poll });

  const artifactHashes = {};
  for (const file of [key('messageprocessorfull_14-25-3'), key('votetallynonqv_14-5-3'), wasm('MessageProcessorFull_14-25-3'), wasm('VoteTallyNonQv_14-5-3')]) {
    if (!fs.existsSync(file)) throw new Error('Required MACI artifact missing');
    artifactHashes[path.basename(file)] = await sha256(file);
  }
  if (artifactHashes['messageprocessorfull_14-25-3.zkey'] !== '4448ddd83afb0d01dae23d414d3494df4657393f1fabedb5fffc7afcbd9076a2' || artifactHashes['votetallynonqv_14-5-3.zkey'] !== '41ba81f30f724aaba6ec5b005ff58222f66cf530c3f97f8e28011b229107ab87' || artifactHashes['MessageProcessorFull_14-25-3.wasm'] !== '56ec3fdb59c1848f679304a94ae3cd9ecd0768b89cbffddb9f9e596d2fd104de' || artifactHashes['VoteTallyNonQv_14-5-3.wasm'] !== '9d6210fc3c81cd0b6393c48670056f5dc6b7e9e60f8392b7db94c01a185812a3') throw new Error('MACI artifact hash mismatch');
  checkpoint('artifacts-checked');

  if (!await poll.stateMerged()) {
    const mergeReceipt = await sdk.mergeSignups({ pollId: BigInt(config.pollId), maciAddress: config.maciAddress, signer });
    checkpoint('signups-merged', { transactionHash: mergeReceipt.hash, gasUsed: mergeReceipt.gasUsed.toString() });
  } else checkpoint('signups-already-merged');
  const proofDir = path.join(output, 'private/proofs');
  const tallyFile = path.join(output, 'private/tally.json');
  const generated = resume ? {
    processProofs: fs.readdirSync(proofDir).filter(name => /^process_\d+\.json$/.test(name)),
    tallyProofs: fs.readdirSync(proofDir).filter(name => /^tally_\d+\.json$/.test(name)),
    tallyData: JSON.parse(fs.readFileSync(tallyFile, 'utf8')),
  } : await sdk.generateProofs({
    outputDir: proofDir, tallyFile, voteTallyZkey: key('votetallynonqv_14-5-3'),
    messageProcessorZkey: key('messageprocessorfull_14-25-3'),
    pollId: BigInt(config.pollId), coordinatorPrivateKey: coordinatorSecret,
    messageProcessorWasm: wasm('MessageProcessorFull_14-25-3'),
    voteTallyWasm: wasm('VoteTallyNonQv_14-5-3'), useWasm: true,
    mode: sdk.EMode.FULL, maciAddress: config.maciAddress, signer,
    startBlock: config.deploymentBlock, blocksPerBatch: 500,
  });
  checkpoint('proofs-generated', { processProofs: generated.processProofs.length, tallyProofs: generated.tallyProofs.length, resumed: resume });
  if (resume) {
    // The processing transaction is already final. The upstream proveOnChain
    // helper repeats a processed batch on restart, so submit the saved tally
    // proof through its same Prover class and on-chain verifier checks.
    const processor = contracts.MessageProcessor__factory.connect(pollAddresses.messageProcessor, signer);
    const tally = contracts.Tally__factory.connect(pollAddresses.tally, signer);
    const registry = contracts.VerifyingKeysRegistry__factory.connect(await tally.verifyingKeysRegistry(), signer);
    const verifier = contracts.Verifier__factory.connect(await processor.verifier(), signer);
    const prover = new contracts.Prover({ maciContract: maci, pollContract: poll,
      messageProcessorContract: processor, tallyContract: tally,
      verifyingKeysRegistryContract: registry, verifierContract: verifier });
    await prover.proveTally([JSON.parse(fs.readFileSync(path.join(proofDir, 'tally_0.json'), 'utf8'))]);
    await prover.submitResults(generated.tallyData, { start: 0, end: config.voteOptions });
  } else await sdk.proveOnChain({ pollId: BigInt(config.pollId), proofDir, tallyFile, maciAddress: config.maciAddress, signer });
  const afterProve = await provider.getBlockNumber();
  const proofTransactions = [];
  for (let number = config.deploymentBlock; number <= afterProve; number += 1) {
    const block = await provider.getBlock(number);
    for (const hash of block.transactions) {
      const tx = await provider.getTransaction(hash);
      if (!tx || !tx.to) continue;
      const target = tx.to.toLowerCase();
      const kind = target === pollAddresses.messageProcessor.toLowerCase() ? 'process' : target === pollAddresses.tally.toLowerCase() ? 'tally' : null;
      if (!kind) continue;
      const iface = kind === 'process' ? contracts.MessageProcessor__factory.createInterface() : contracts.Tally__factory.createInterface();
      const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
      if ((kind === 'process' && decoded?.name !== 'processMessages') || (kind === 'tally' && decoded?.name !== 'tallyVotes')) continue;
      const receipt = await provider.getTransactionReceipt(hash);
      if (receipt.status !== 1) throw new Error('MACI proof transaction failed');
      proofTransactions.push({ kind, hash, blockNumber: number, gasUsed: receipt.gasUsed.toString() });
    }
  }
  if (proofTransactions.filter(tx => tx.kind === 'process').length !== generated.processProofs.length || proofTransactions.filter(tx => tx.kind === 'tally').length !== generated.tallyProofs.length) throw new Error('Proof transaction set is incomplete');
  checkpoint('proofs-submitted', { proofTransactions });
  const commitments = sdk.generateTallyCommitments({ tallyData: generated.tallyData, voteOptionTreeDepth: 3 });
  const verified = await sdk.verify({ pollId: BigInt(config.pollId), tallyData: generated.tallyData, tallyCommitments: commitments, totalVoteOptions: generated.tallyData.results.tally.length, voteOptionTreeDepth: 3, signer });
  if (!verified) throw new Error('SDK tally/on-chain verification failed');
  checkpoint('tally-verified');

  const blockNumber = await provider.getBlockNumber();
  const head = await provider.getBlock(blockNumber);
  const eventGroups = await Promise.all([
    events(provider, config.maciAddress, maci.interface.getEvent('SignUp').topicHash, config.deploymentBlock, blockNumber),
    events(provider, pollAddresses.poll, poll.interface.getEvent('PollJoined').topicHash, config.deploymentBlock, blockNumber),
    events(provider, pollAddresses.poll, poll.interface.getEvent('PublishMessage').topicHash, config.deploymentBlock, blockNumber),
  ]);
  const labels = ['SignUp', 'PollJoined', 'PublishMessage'];
  const publicEvents = eventGroups.flatMap((group, index) => group.map(log => ({ event: labels[index], ...log })));
  if (BigInt(eventGroups[0].length + 1) !== await maci.totalSignups() || BigInt(eventGroups[2].length) !== await poll.numMessages()) throw new Error('Public event set is incomplete or includes unavailable relayed messages');
  const eventFile = path.join(output, 'public/events.ndjson');
  fs.writeFileSync(eventFile, publicEvents.map(row => line(row)).join('\n') + '\n');

  const proofFiles = fs.readdirSync(proofDir).filter(name => /^(process|tally)_\d+\.json$/.test(name)).sort();
  const publicProofs = proofFiles.map(name => {
    const proof = JSON.parse(fs.readFileSync(path.join(proofDir, name), 'utf8'));
    return { name, proof: proof.proof, publicInputs: proof.publicInputs };
  });
  fs.writeFileSync(path.join(output, 'public/proofs.json'), `${stringify(publicProofs)}\n`);
  fs.copyFileSync(tallyFile, path.join(output, 'public/tally.json'));
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).stdout.trim();
  const manifest = {
    protocol: 'maci-v3.0.0-full-v1', researchClassification: 'synthetic-prototype',
    chainId: config.chainId, maciAddress: config.maciAddress, pollId: config.pollId,
    pollAddress: pollAddresses.poll, messageProcessorAddress: pollAddresses.messageProcessor,
    tallyAddress: pollAddresses.tally, deploymentBlock: config.deploymentBlock,
    snapshotBlock: blockNumber, snapshotBlockHash: head.hash, eventCounts: Object.fromEntries(labels.map((label, index) => [label, eventGroups[index].length])),
    artifactHashes, verified, proofTransactions, tally: generated.tallyData.results.tally.slice(0, config.voteOptions),
    evidenceHashes: {
      events: await sha256(eventFile), proofs: await sha256(path.join(output, 'public/proofs.json')),
      tally: await sha256(path.join(output, 'public/tally.json')),
    }, repositoryRevision: revision,
    limitations: ['M0 independent ceremony and full dependency review deferred', 'Coordinator can decrypt individual commands', 'Issuer knows account-to-registration ticket association'],
  };
  fs.writeFileSync(path.join(output, 'public/manifest.json'), `${stringify(manifest)}\n`);
  checkpoint('complete', { verified, publicEvidence: path.join(output, 'public') });
}

main().catch(() => { process.stderr.write('MACI coordinator failed. Review sanitized stage records and private local diagnostics.\n'); process.exitCode = 1; }).finally(async () => { await contracts.cleanThreads(); });

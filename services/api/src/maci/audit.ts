import { createHash } from 'node:crypto';
import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { JsonRpcProvider, VoidSigner } from 'ethers';
import * as sdk from '@maci-protocol/sdk';
import * as contracts from '@maci-protocol/contracts';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { AuthService } from '../auth.js';
import { MACI_SNARK_FIELD } from '../../../../packages/shared-types/src/maci.js';

const hex32 = z.string().regex(/^0x[0-9a-fA-F]{64}$/);
const hex = z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/);
const sha = z.string().regex(/^[0-9a-f]{64}$/);
const address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const decimal = z.string().regex(/^(0|[1-9][0-9]*)$/);
const fieldHex = z.string().regex(/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]{0,63})$/).refine(value => BigInt(value) < MACI_SNARK_FIELD);
const manifestSchema = z.object({
  protocol: z.literal('maci-v3.0.0-full-v1'), researchClassification: z.literal('synthetic-prototype'),
  chainId: z.number().int().positive(), maciAddress: address, pollId: decimal, pollAddress: address,
  messageProcessorAddress: address, tallyAddress: address, deploymentBlock: z.number().int().nonnegative(),
  snapshotBlock: z.number().int().nonnegative(), snapshotBlockHash: hex32,
  eventCounts: z.object({ SignUp: z.number().int().nonnegative(), PollJoined: z.number().int().nonnegative(), PublishMessage: z.number().int().nonnegative() }).strict(),
  artifactHashes: z.record(z.string().max(100), sha), verified: z.literal(true),
  proofTransactions: z.array(z.object({ kind: z.enum(['process', 'tally']), hash: hex32, blockNumber: z.number().int().nonnegative(), gasUsed: decimal }).strict()).min(2).max(128),
  tally: z.array(decimal).min(2).max(125),
  evidenceHashes: z.object({ events: sha, proofs: sha, tally: sha }).strict(),
  repositoryRevision: z.string().regex(/^[0-9a-f]{40}$/),
  limitations: z.array(z.string().max(160)).max(8),
}).strict();
const logSchema = z.object({
  event: z.enum(['SignUp', 'PollJoined', 'PublishMessage']), address,
  blockNumber: z.number().int().nonnegative(), blockHash: hex32, transactionHash: hex32,
  logIndex: z.number().int().nonnegative(), topics: z.array(hex32).min(1).max(4), data: hex,
}).strict();
const proofSchema = z.object({
  pi_a: z.array(decimal).length(3), pi_b: z.array(z.array(decimal).length(2)).length(3),
  pi_c: z.array(decimal).length(3), protocol: z.literal('groth16'), curve: z.literal('bn128'),
}).strict();
const proofsSchema = z.array(z.object({
  name: z.string().regex(/^(process|tally)_\d+\.json$/), proof: proofSchema,
  publicInputs: z.array(decimal).min(1).max(16),
}).strict()).min(2).max(128);
const tallySchema = z.object({
  maci: address, pollId: decimal, network: z.string().max(80), chainId: decimal,
  mode: z.literal(2), tallyAddress: address, newTallyCommitment: fieldHex,
  results: z.object({ tally: z.array(decimal).length(125), salt: fieldHex, commitment: fieldHex }).strict(),
  totalSpentVoiceCredits: z.object({ spent: decimal, salt: fieldHex, commitment: fieldHex }).strict(),
}).strict();
const uploadSchema = z.object({
  manifestJson: z.string().min(1).max(20_000), eventsNdjson: z.string().min(1).max(70_000),
  proofsJson: z.string().min(1).max(70_000), tallyJson: z.string().min(1).max(20_000),
}).strict();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');
function fail(code: string): never { throw new ConflictException({ code, message: 'MACI audit evidence does not match the canonical chain state.' }); }
function parseJson(value: string): unknown {
  try { return JSON.parse(value) as unknown; }
  catch { throw new BadRequestException({ code: 'MACI_AUDIT_JSON_INVALID', message: 'MACI audit file is not valid JSON.' }); }
}
function parseEvidence<T extends z.ZodType>(schema: T, value: unknown, code: string): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) throw new BadRequestException({ code, message: 'MACI audit evidence has an invalid format.' });
  return result.data;
}
function mutableTuple(value: unknown): unknown {
  return Array.isArray(value) ? Array.from(value, mutableTuple) : value;
}

@Injectable()
export class MaciAuditService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService, @Inject(AuthService) private readonly auth: AuthService) {}

  async publish(cookie: string | undefined, electionIdInput: string, body: unknown) {
    await this.auth.admin(cookie);
    const electionId = z.uuid().parse(electionIdInput);
    const election = await this.db.maciElection.findUnique({ where: { id: electionId } });
    if (!election || election.status !== 'CLOSED') fail('MACI_NOT_CLOSED');
    const files = parseEvidence(uploadSchema, body, 'MACI_AUDIT_UPLOAD_INVALID');
    const manifest = parseEvidence(manifestSchema, parseJson(files.manifestJson), 'MACI_AUDIT_MANIFEST_INVALID');
    const rawEvents = files.eventsNdjson.trimEnd().split('\n').map(line => parseEvidence(logSchema, parseJson(line), 'MACI_AUDIT_EVENT_INVALID'));
    const proofs = parseEvidence(proofsSchema, parseJson(files.proofsJson), 'MACI_AUDIT_PROOFS_INVALID');
    const tally = parseEvidence(tallySchema, parseJson(files.tallyJson), 'MACI_AUDIT_TALLY_INVALID');
    if (digest(files.eventsNdjson) !== manifest.evidenceHashes.events || digest(files.proofsJson) !== manifest.evidenceHashes.proofs || digest(files.tallyJson) !== manifest.evidenceHashes.tally) fail('MACI_AUDIT_HASH_MISMATCH');
    if (manifest.chainId !== Number(election.chainId) || manifest.maciAddress.toLowerCase() !== election.maciAddress || manifest.pollId !== election.pollId || manifest.pollAddress.toLowerCase() !== election.pollAddress || manifest.deploymentBlock !== Number(election.deploymentBlock) || manifest.tally.length !== election.voteOptions) fail('MACI_AUDIT_SCOPE_MISMATCH');
    if (tally.maci.toLowerCase() !== election.maciAddress || tally.pollId !== election.pollId || tally.chainId !== election.chainId || tally.tallyAddress.toLowerCase() !== manifest.tallyAddress.toLowerCase() || tally.results.tally.slice(0, election.voteOptions).some((value, index) => value !== manifest.tally[index]) || tally.results.tally.slice(election.voteOptions).some(value => value !== '0')) fail('MACI_TALLY_SCOPE_MISMATCH');
    const provider = new JsonRpcProvider(this.chain.config.RPC_URL, Number(election.chainId));
    if (Number((await provider.getNetwork()).chainId) !== manifest.chainId) fail('MACI_CHAIN_MISMATCH');
    const finalityHead = await provider.getBlockNumber();
    if (finalityHead < manifest.snapshotBlock + this.chain.config.CHAIN_CONFIRMATIONS - 1) fail('MACI_SNAPSHOT_UNCONFIRMED');
    const head = await provider.getBlock(manifest.snapshotBlock);
    if (!head?.hash || head.hash.toLowerCase() !== manifest.snapshotBlockHash.toLowerCase()) fail('MACI_SNAPSHOT_REORG');
    const runner = provider as unknown as Parameters<typeof contracts.MACI__factory.connect>[1];
    const maci = contracts.MACI__factory.connect(election.maciAddress, runner);
    const pollAddresses = await maci.getPoll(BigInt(election.pollId));
    if (pollAddresses.poll.toLowerCase() !== election.pollAddress || pollAddresses.messageProcessor.toLowerCase() !== manifest.messageProcessorAddress.toLowerCase() || pollAddresses.tally.toLowerCase() !== manifest.tallyAddress.toLowerCase()) fail('MACI_CONTRACT_MISMATCH');
    const poll = contracts.Poll__factory.connect(election.pollAddress, runner);
    const processor = contracts.MessageProcessor__factory.connect(pollAddresses.messageProcessor, runner);
    const tallyContract = contracts.Tally__factory.connect(pollAddresses.tally, runner);
    if (!await processor.processingComplete() || !await tallyContract.isTallied() || BigInt(manifest.eventCounts.PublishMessage) !== await poll.numMessages() || BigInt(manifest.eventCounts.SignUp + 1) !== await maci.totalSignups()) fail('MACI_PROOFS_INCOMPLETE');

    const groups = [
      { event: 'SignUp', contract: maci, address: election.maciAddress },
      { event: 'PollJoined', contract: poll, address: election.pollAddress },
      { event: 'PublishMessage', contract: poll, address: election.pollAddress },
    ] as const;
    for (const group of groups) {
      const expected = rawEvents.filter(row => row.event === group.event);
      const chainLogs = [];
      const topic = (group.contract.interface as { getEvent(name: string): { topicHash: string } | null }).getEvent(group.event)?.topicHash;
      if (!topic) fail('MACI_EVENT_TOPIC_MISSING');
      for (let start = manifest.deploymentBlock; start <= manifest.snapshotBlock; start += 1000) {
        chainLogs.push(...await provider.getLogs({ address: group.address, topics: [topic], fromBlock: start, toBlock: Math.min(start + 999, manifest.snapshotBlock) }));
      }
      if (expected.length !== chainLogs.length || expected.length !== manifest.eventCounts[group.event]) fail('MACI_EVENT_COUNT_MISMATCH');
      for (let i = 0; i < expected.length; i += 1) {
        const row = expected[i]; const log = chainLogs[i];
        if (!row || !log) fail('MACI_EVENT_MISMATCH');
        if (row.address.toLowerCase() !== log.address.toLowerCase() || row.blockNumber !== log.blockNumber || row.blockHash.toLowerCase() !== log.blockHash?.toLowerCase() || row.transactionHash.toLowerCase() !== log.transactionHash.toLowerCase() || row.logIndex !== log.index || row.data.toLowerCase() !== log.data.toLowerCase() || JSON.stringify(row.topics.map(value => value.toLowerCase())) !== JSON.stringify(log.topics.map(value => value.toLowerCase()))) fail('MACI_EVENT_MISMATCH');
      }
    }

    const orderedProofs = ['process', 'tally'].flatMap(kind => proofs.filter(row => row.name.startsWith(kind)).sort((a, b) => Number(a.name.match(/\d+/)?.[0]) - Number(b.name.match(/\d+/)?.[0])));
    const orderedTxs = ['process', 'tally'].flatMap(kind => manifest.proofTransactions.filter(row => row.kind === kind));
    if (orderedProofs.length !== orderedTxs.length || orderedTxs.filter(row => row.kind === 'process').length !== Number(await processor.totalBatchesProcessed()) || orderedTxs.filter(row => row.kind === 'tally').length !== Number(await tallyContract.tallyBatchNum())) fail('MACI_PROOF_COUNT_MISMATCH');
    const signer = new VoidSigner('0x0000000000000000000000000000000000000001', provider) as unknown as Parameters<typeof sdk.verify>[0]['signer'];
    const onChainKeys = await sdk.getAllOnChainVerifyingKeys({
      verifyingKeysRegistryAddress: await maci.verifyingKeysRegistry(), signer,
      stateTreeDepth: 14, tallyProcessingStateTreeDepth: 5,
      voteOptionTreeDepth: 3, messageBatchSize: 25, mode: sdk.EMode.FULL,
    });
    const verifier = contracts.Verifier__factory.connect(await maci.verifier(), runner);
    for (let i = 0; i < orderedProofs.length; i += 1) {
      const record = orderedProofs[i]; const txRef = orderedTxs[i];
      if (!record || !txRef) fail('MACI_PROOF_TX_MISMATCH');
      const tx = await provider.getTransaction(txRef.hash);
      const receipt = await provider.getTransactionReceipt(txRef.hash);
      const target = txRef.kind === 'process' ? pollAddresses.messageProcessor : pollAddresses.tally;
      const iface = txRef.kind === 'process' ? processor.interface : tallyContract.interface;
      const decoded = tx && iface.parseTransaction({ data: tx.data, value: tx.value });
      if (!tx || !receipt || !decoded || receipt.status !== 1 || tx.to?.toLowerCase() !== target.toLowerCase() || receipt.blockNumber !== txRef.blockNumber || (txRef.kind === 'process' ? decoded.name !== 'processMessages' : decoded.name !== 'tallyVotes')) fail('MACI_PROOF_TX_MISMATCH');
      const submitted = Array.from(decoded.args[1], (value: bigint) => value.toString());
      const published = contracts.formatProofForVerifierContract(record.proof);
      if (JSON.stringify(submitted) !== JSON.stringify(published)) fail('MACI_PROOF_TX_MISMATCH');
      const key = txRef.kind === 'process' ? onChainKeys.processVerifyingKeyOnChain : onChainKeys.tallyVerifyingKeyOnChain;
      const proofValid = await verifier.verify(published, mutableTuple(key) as Parameters<typeof verifier.verify>[1], record.publicInputs.map(BigInt)).catch(() => false);
      if (!proofValid) fail(txRef.kind === 'process' ? 'MACI_PROCESS_PROOF_INVALID' : 'MACI_TALLY_PROOF_INVALID');
    }
    const tallyData = tally as Parameters<typeof sdk.verify>[0]['tallyData'];
    const commitments = sdk.generateTallyCommitments({ tallyData, voteOptionTreeDepth: 3 });
    if (!await sdk.verify({ maciAddress: election.maciAddress, pollId: BigInt(election.pollId), tallyData, tallyCommitments: commitments, totalVoteOptions: tally.results.tally.length, voteOptionTreeDepth: 3, signer })) fail('MACI_TALLY_VERIFICATION_FAILED');
    const record = await this.db.$transaction(async tx => {
      const current = await tx.maciElection.findUniqueOrThrow({ where: { id: electionId } });
      if (current.status !== 'CLOSED') fail('MACI_STATUS_CHANGED');
      const created = await tx.maciAuditRecord.create({ data: { electionId, ...files, snapshotBlock: BigInt(manifest.snapshotBlock), snapshotHash: manifest.snapshotBlockHash } });
      await tx.maciElection.update({ where: { id: electionId }, data: { status: 'VERIFIED' } });
      return created;
    }, { isolationLevel: 'Serializable' });
    return { electionId, status: 'VERIFIED', snapshotBlock: record.snapshotBlock.toString(), snapshotHash: record.snapshotHash, tally: manifest.tally };
  }

  async publicEvidence(electionIdInput: string) {
    const electionId = z.uuid().parse(electionIdInput);
    const record = await this.db.maciAuditRecord.findUnique({ where: { electionId } });
    if (!record) throw new ConflictException({ code: 'MACI_AUDIT_UNAVAILABLE', message: 'Verified MACI audit evidence is not published.' });
    const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
    if (head < record.snapshotBlock + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) fail('MACI_SNAPSHOT_UNCONFIRMED');
    const block = await this.chain.client.getBlock({ blockNumber: record.snapshotBlock });
    if (block.hash.toLowerCase() !== record.snapshotHash.toLowerCase()) fail('MACI_SNAPSHOT_REORG');
    return { protocol: 'maci-v3.0.0-full-v1', manifest: JSON.parse(record.manifestJson), events: record.eventsNdjson.trimEnd().split('\n').map(line => JSON.parse(line)), proofs: JSON.parse(record.proofsJson), tally: JSON.parse(record.tallyJson) };
  }
}

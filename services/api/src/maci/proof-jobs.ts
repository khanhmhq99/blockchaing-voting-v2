import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { ConflictException, HttpException, Inject, Injectable } from '@nestjs/common';
import { z } from 'zod';
import { getAddress } from 'viem';
import { AuthService } from '../auth.js';
import { ChainService } from '../chain.js';
import { DatabaseService } from '../database.js';
import { MaciAuditService } from './audit.js';

const root = resolve(process.cwd());
const outputRoot = join(root, 'research/mvp3/maci/probe-output/coordinator');
const intentRoot = join(root, 'research/mvp3/maci/probe-output/proof-intents');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const artifactNames = ['manifest.json', 'events.ndjson', 'proofs.json', 'tally.json'] as const;
const evidenceFields = ['manifestJson', 'eventsNdjson', 'proofsJson', 'tallyJson'] as const;
const maciPollAbi = [{ type: 'function', name: 'getPoll', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'tuple', components: [
  { name: 'poll', type: 'address' }, { name: 'messageProcessor', type: 'address' }, { name: 'tally', type: 'address' },
] }] }] as const;
const pollScopeAbi = [
  { type: 'function', name: 'endDate', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'voteOptions', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'coordinatorPublicKey', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
] as const;
const publicJob = (job: { id: string; electionId: string; status: string; stage: string; diagnosticCode: string | null; closingBlock: bigint; closingHash: string; snapshotBlock: bigint | null; snapshotHash: string | null; createdAt: Date; updatedAt: Date }) => ({
  id: job.id, electionId: job.electionId, status: job.status, stage: job.stage,
  diagnosticCode: job.diagnosticCode, closingBlock: job.closingBlock.toString(), closingHash: job.closingHash,
  snapshotBlock: job.snapshotBlock?.toString() ?? null, snapshotHash: job.snapshotHash,
  createdAt: job.createdAt, updatedAt: job.updatedAt,
});

@Injectable()
export class MaciProofJobs {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService,
    @Inject(AuthService) private readonly auth: AuthService, @Inject(MaciAuditService) private readonly audit: MaciAuditService) {}

  async status(cookie: string | undefined, electionIdInput: string) {
    await this.auth.admin(cookie);
    const electionId = z.uuid().parse(electionIdInput);
    const job = await this.db.maciProofJob.findUnique({ where: { electionId } });
    return { job: job ? publicJob(job) : null };
  }

  async approve(cookie: string | undefined, electionIdInput: string) {
    await this.auth.admin(cookie);
    const electionId = z.uuid().parse(electionIdInput);
    const job = await this.db.maciProofJob.findUnique({ where: { electionId } });
    if (!job || job.status !== 'READY' || !job.manifestJson || !job.eventsNdjson || !job.proofsJson || !job.tallyJson)
      throw new ConflictException({ code: 'MACI_PROOF_NOT_READY', message: 'Verified proof artifacts are not ready for publication.' });
    const files = { manifestJson: job.manifestJson, eventsNdjson: job.eventsNdjson, proofsJson: job.proofsJson, tallyJson: job.tallyJson };
    if (!(await this.matchesChain(job))) throw new ConflictException({ code: 'MACI_PROOF_REORG', message: 'The proof job chain snapshot changed.' });
    // publish() independently rechecks every event, proof, commitment, hash and finality gate.
    return this.audit.publish(cookie, electionId, files, job.id);
  }

  private async matchesChain(job: { genesisHash: string; closingBlock: bigint; closingHash: string; snapshotBlock: bigint | null; snapshotHash: string | null }) {
    await this.chain.verifyNetwork();
    const genesis = await this.chain.client.getBlock({ blockNumber: 0n });
    if (genesis.hash.toLowerCase() !== job.genesisHash.toLowerCase()) return false;
    const closing = await this.chain.client.getBlock({ blockNumber: job.closingBlock });
    if (closing.hash.toLowerCase() !== job.closingHash.toLowerCase()) return false;
    if (job.snapshotBlock !== null) {
      if (!job.snapshotHash) return false;
      const snapshot = await this.chain.client.getBlock({ blockNumber: job.snapshotBlock });
      if (snapshot.hash.toLowerCase() !== job.snapshotHash.toLowerCase()) return false;
    }
    return true;
  }

  private async matchesDeployment(election: { maciAddress: string; registrationAddress: string; pollAddress: string; pollId: string; endTimestamp: string; voteOptions: number; coordinatorKeyX: string; coordinatorKeyY: string; deploymentBlock: string }, deployment: unknown) {
    const maciAddress = getAddress(election.maciAddress);
    const pollAddress = getAddress(election.pollAddress);
    for (const address of [maciAddress, getAddress(election.registrationAddress), pollAddress]) {
      if (!await this.chain.client.getCode({ address })) return false;
    }
    const scope = z.object({ transactions: z.array(z.object({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/), blockNumber: z.number().int().nonnegative() }).passthrough()).min(1) }).passthrough().safeParse(deployment);
    if (!scope.success) return false;
    for (const reference of scope.data.transactions) {
      const receipt = await this.chain.client.getTransactionReceipt({ hash: reference.hash as `0x${string}` });
      if (receipt.status !== 'success' || receipt.blockNumber !== BigInt(reference.blockNumber) || receipt.blockHash !== (await this.chain.client.getBlock({ blockNumber: receipt.blockNumber })).hash) return false;
    }
    const poll = await this.chain.client.readContract({ address: maciAddress, abi: maciPollAbi, functionName: 'getPoll', args: [BigInt(election.pollId)] });
    if (poll.poll.toLowerCase() !== pollAddress.toLowerCase()) return false;
    const [end, options, key] = await Promise.all([
      this.chain.client.readContract({ address: pollAddress, abi: pollScopeAbi, functionName: 'endDate' }),
      this.chain.client.readContract({ address: pollAddress, abi: pollScopeAbi, functionName: 'voteOptions' }),
      this.chain.client.readContract({ address: pollAddress, abi: pollScopeAbi, functionName: 'coordinatorPublicKey' }),
    ]);
    return end.toString() === election.endTimestamp && Number(options) === election.voteOptions &&
      key[0].toString() === election.coordinatorKeyX && key[1].toString() === election.coordinatorKeyY &&
      BigInt(election.deploymentBlock) <= (await this.chain.client.getBlockNumber({ cacheTime: 0 }));
  }

  // Called only by the separate proof-worker entrypoint. No key is loaded by NestJS.
  async tick() {
    await this.markInterrupted();
    await this.chain.verifyNetwork();
    const elections = await this.db.maciElection.findMany({ where: { status: { in: ['REGISTRATION', 'OPEN', 'CLOSED'] }, chainId: '31337',
      proofJob: { is: null }, deploymentJob: { is: { status: 'READY' } } }, orderBy: { createdAt: 'asc' }, take: 30 });
    const now = BigInt(Math.floor(Date.now() / 1000));
    const pending = await this.db.maciProofJob.findMany({ where: { status: 'AWAITING_CONFIRMATIONS' }, take: 10 });
    if (process.env.MACI_PROOF_LOCAL_AUTOMINE === 'true' &&
        (elections.some(row => now > BigInt(row.endTimestamp)) || pending.length > 0)) {
      const response = await fetch(this.chain.config.RPC_URL, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_mine', params: [] }) });
      const result = await response.json() as { result?: string; error?: unknown };
      if (!response.ok || result.error) throw new Error('Local mining failed.');
    }
    const headNumber = await this.chain.client.getBlockNumber({ cacheTime: 0 });
    const head = await this.chain.client.getBlock({ blockNumber: headNumber });
    for (const election of elections) {
      if (head.timestamp <= BigInt(election.endTimestamp)) continue;
      if (BigInt(election.deploymentBlock) > head.number) continue;
      let low = BigInt(election.deploymentBlock), high = head.number;
      while (low < high) {
        const middle = (low + high) / 2n;
        if ((await this.chain.client.getBlock({ blockNumber: middle })).timestamp > BigInt(election.endTimestamp)) high = middle;
        else low = middle + 1n;
      }
      const closing = await this.chain.client.getBlock({ blockNumber: low });
      if (head.number < low + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) continue;
      const deployment = await this.db.maciDeploymentJob.findUnique({ where: { electionId: election.id } });
      if (!deployment || deployment.status !== 'READY') continue; // Imported elections retain manual fallback.
      const genesis = await this.chain.client.getBlock({ blockNumber: 0n });
      if (deployment.genesisHash.toLowerCase() !== genesis.hash.toLowerCase()) continue;
      if (election.deploymentInstanceId !== deployment.id || !await this.matchesDeployment(election, deployment.deployment)) continue;
      if (election.status !== 'CLOSED') await this.db.maciElection.updateMany({ where: { id: election.id, status: { in: ['REGISTRATION', 'OPEN'] } }, data: { status: 'CLOSED' } });
      const current = await this.db.maciElection.findUnique({ where: { id: election.id }, select: { status: true } });
      if (current?.status !== 'CLOSED') continue;
      await this.db.maciProofJob.create({ data: { electionId: election.id, runId: election.id, closingBlock: low, closingHash: closing.hash, genesisHash: genesis.hash } }).catch(error => {
        if (error?.code !== 'P2002') throw error;
      });
    }
    for (const job of pending) await this.verifyReady(job.id);
    const ready = await this.db.maciProofJob.findMany({ where: { status: 'READY' }, take: 10 });
    for (const job of ready) {
      if (!(await this.matchesChain(job))) await this.db.maciProofJob.updateMany({ where: { id: job.id, status: 'READY' },
        data: { status: 'RECONCILIATION_REQUIRED', stage: 'CHAIN_REORG', diagnosticCode: 'MACI_PROOF_REORG' } });
    }
    const queued = await this.db.maciProofJob.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
    if (!queued) return;
    if (!(await this.matchesChain(queued))) {
      await this.db.maciProofJob.updateMany({ where: { id: queued.id, status: 'QUEUED' }, data: { status: 'RECONCILIATION_REQUIRED', diagnosticCode: 'MACI_PROOF_REORG' } });
      return;
    }
    const claim = await this.db.maciProofJob.updateMany({ where: { id: queued.id, status: 'QUEUED' }, data: { status: 'RUNNING', stage: 'CLAIMED' } });
    if (claim.count !== 1) return;
    await this.process(queued.id);
  }

  private async process(id: string) {
    const job = await this.db.maciProofJob.findUniqueOrThrow({ where: { id } });
    const election = await this.db.maciElection.findUniqueOrThrow({ where: { id: job.electionId } });
    try {
      if (election.status !== 'CLOSED') throw new Error('ELECTION_NOT_CLOSED');
      if (!(await this.matchesChain(job))) throw new Error('REORG');
      const config = { runId: job.runId, chainId: 31337, maciAddress: election.maciAddress,
        pollId: election.pollId, deploymentBlock: Number(election.deploymentBlock), voteOptions: election.voteOptions };
      await mkdir(intentRoot, { recursive: true });
      const intent = join(intentRoot, `${job.runId}.json`);
      try { await writeFile(intent, `${JSON.stringify(config)}\n`, { flag: 'wx', mode: 0o600 }); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST' || await readFile(intent, 'utf8') !== `${JSON.stringify(config)}\n`) throw error; }
      await this.db.maciProofJob.update({ where: { id }, data: { stage: 'COORDINATOR' } });
      const env: NodeJS.ProcessEnv = { PATH: process.env.PATH, Path: process.env.Path, SystemRoot: process.env.SystemRoot,
        TEMP: process.env.TEMP, TMP: process.env.TMP, HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE,
        MACI_RPC_URL: this.chain.config.RPC_URL, MACI_COORDINATOR_PRIVATE_KEY: process.env.MACI_COORDINATOR_PRIVATE_KEY,
        MACI_PROVER_PRIVATE_KEY: process.env.MACI_PROVER_PRIVATE_KEY };
      const exit = await new Promise<number>((done, reject) => {
        const child = spawn(process.execPath, [join(root, 'scripts/maci-coordinator.mjs'), intent], { cwd: root, env, stdio: 'ignore', windowsHide: true });
        const heartbeat = setInterval(() => { void this.db.maciProofJob.updateMany({ where: { id, status: 'RUNNING' }, data: { stage: 'COORDINATOR' } }).catch(() => {}); }, 15_000);
        child.once('error', error => { clearInterval(heartbeat); reject(error); });
        child.once('exit', code => { clearInterval(heartbeat); done(code ?? 1); });
      });
      if (exit !== 0) throw new Error('COORDINATOR_FAILED');
      await this.stageArtifacts(id);
      await this.verifyReady(id);
    } catch (error) {
      const code = error instanceof Error && error.message === 'REORG' ? 'MACI_PROOF_REORG' : 'MACI_PROOF_RECONCILIATION_REQUIRED';
      await this.db.maciProofJob.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'INTERRUPTED', diagnosticCode: code } });
    }
  }

  private async stageArtifacts(id: string) {
    const job = await this.db.maciProofJob.findUniqueOrThrow({ where: { id } });
    const checkpoint = JSON.parse(await readFile(join(outputRoot, job.runId, 'checkpoint.json'), 'utf8')) as { stage: string };
    if (checkpoint.stage !== 'complete') throw new Error('COORDINATOR_INCOMPLETE');
    const publicDir = join(outputRoot, job.runId, 'public');
    const data = await Promise.all(artifactNames.map(name => readFile(join(publicDir, name), 'utf8')));
    const files = Object.fromEntries(evidenceFields.map((field, index) => [field, data[index]])) as Record<typeof evidenceFields[number], string>;
    const manifest = JSON.parse(files.manifestJson) as { snapshotBlock: number; snapshotBlockHash: string; evidenceHashes: Record<string, string> };
    if (manifest.evidenceHashes.events !== hash(files.eventsNdjson) || manifest.evidenceHashes.proofs !== hash(files.proofsJson) || manifest.evidenceHashes.tally !== hash(files.tallyJson)) throw new Error('ARTIFACT_HASH');
    if (!(await this.matchesChain(job))) throw new Error('REORG');
    await this.db.maciProofJob.updateMany({ where: { id, status: 'RUNNING' }, data: { status: 'AWAITING_CONFIRMATIONS', stage: 'ARTIFACTS_STAGED', diagnosticCode: null,
      snapshotBlock: BigInt(manifest.snapshotBlock), snapshotHash: manifest.snapshotBlockHash, ...files } });
  }

  private async verifyReady(id: string) {
    const job = await this.db.maciProofJob.findUniqueOrThrow({ where: { id } });
    if (job.status !== 'AWAITING_CONFIRMATIONS' || job.snapshotBlock === null || !job.manifestJson || !job.eventsNdjson || !job.proofsJson || !job.tallyJson) return;
    try {
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      if (head < job.snapshotBlock + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) return;
      if (!(await this.matchesChain(job))) throw new Error('REORG');
      await this.audit.verifyEvidence(job.electionId, { manifestJson: job.manifestJson, eventsNdjson: job.eventsNdjson, proofsJson: job.proofsJson, tallyJson: job.tallyJson });
      if (!(await this.matchesChain(job))) throw new Error('REORG');
      await this.db.maciProofJob.updateMany({ where: { id, status: 'AWAITING_CONFIRMATIONS' }, data: { status: 'READY', stage: 'AUDIT_VERIFIED' } });
    } catch (error) {
      if (!(error instanceof HttpException) && !(error instanceof Error && error.message === 'REORG')) return;
      const code = error instanceof Error && error.message === 'REORG' ? 'MACI_PROOF_REORG' : 'MACI_PROOF_AUDIT_FAILED';
      await this.db.maciProofJob.updateMany({ where: { id, status: 'AWAITING_CONFIRMATIONS' }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'AUDIT_FAILED', diagnosticCode: code } });
    }
  }

  async markInterrupted() {
    const running = await this.db.maciProofJob.findMany({ where: { status: 'RUNNING', updatedAt: { lt: new Date(Date.now() - 120_000) } } });
    for (const job of running) {
      let stage: string | null = null;
      try { stage = (JSON.parse(await readFile(join(outputRoot, job.runId, 'checkpoint.json'), 'utf8')) as { stage: string }).stage; }
      catch { /* A child process may still be alive; absence of output is not proof of safety. */ }
      if (stage === 'complete') {
        try { await this.stageArtifacts(job.id); continue; } catch { /* Keep uncertain evidence for operator reconciliation. */ }
      }
      await this.db.maciProofJob.updateMany({ where: { id: job.id, status: 'RUNNING', updatedAt: { lt: new Date(Date.now() - 120_000) } }, data: {
        status: 'RECONCILIATION_REQUIRED', stage: 'WORKER_RESTART',
        diagnosticCode: 'MACI_PROOF_WORKER_RESTART',
      } });
    }
  }
}

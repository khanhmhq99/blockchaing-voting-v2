import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ConflictException, ForbiddenException, Inject, Injectable, OnModuleDestroy, OnModuleInit, ServiceUnavailableException } from '@nestjs/common';
import { getAddress, keccak256, type Hex } from 'viem';
import { z } from 'zod';
import { AuthService } from '../auth.js';
import { ChainService } from '../chain.js';
import { DatabaseService } from '../database.js';
import type { MaciService } from './module.js';

// API launch scripts set cwd to the repository root in both tsx and compiled modes.
const root = resolve(process.cwd());
const outputs = join(root, 'research/mvp3/maci/probe-output/deployments');
const intents = join(root, 'research/mvp3/maci/probe-output/deployment-intents');
const businessFields = z.object({
  title: z.string().trim().min(1).max(160),
  candidates: z.array(z.string().trim().min(1).max(120)).min(2).max(125),
  startTimestamp: z.number().int().safe().positive(),
  endTimestamp: z.number().int().safe().positive(),
}).strict();
const businessInput = businessFields.superRefine((value, context) => {
  const keys = value.candidates.map(name => name.normalize('NFKC').toLocaleLowerCase('en-US'));
  if (new Set(keys).size !== keys.length) context.addIssue({ code: 'custom', message: 'Candidate names must be unique.', path: ['candidates'] });
  if (value.startTimestamp < Math.floor(Date.now() / 1000) + 600) context.addIssue({ code: 'custom', message: 'Start time must be at least 10 minutes in the future.', path: ['startTimestamp'] });
  if (value.endTimestamp <= value.startTimestamp + 120) context.addIssue({ code: 'custom', message: 'End time must be more than two minutes after start.', path: ['endTimestamp'] });
});
const outputSchema = z.object({
  chainId: z.literal(31337), runId: z.uuid(), deploymentBlock: z.number().int().nonnegative(),
  maciAddress: z.string(), registrationAddress: z.string(), pollAddress: z.string(), pollId: z.string(),
  startTimestamp: z.number().int(), endTimestamp: z.number().int(), candidates: z.array(z.string()),
  transactions: z.array(z.object({ hash: z.string(), blockNumber: z.number().int(), gasUsed: z.string() })).min(1),
}).passthrough();
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

@Injectable()
export class MaciDeploymentService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private checking = false;
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ChainService) private readonly chain: ChainService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject('MACI_SERVICE') private readonly maci: MaciService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => { void this.pump().catch(() => { /* Jobs remain durable for a later retry. */ }); }, 5_000);
    this.timer.unref();
    void this.db.maciDeploymentJob.updateMany({ where: { status: { in: ['DEPLOYING', 'VERIFYING'] } }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'INTERRUPTED', diagnosticCode: 'MACI_WORKER_RESTARTED' } })
      .then(() => this.pump()).catch(() => { /* API startup must not erase deployment intent. */ });
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  private view(row: { id: string; status: string; stage: string; diagnosticCode: string | null; electionId: string | null; deployment: unknown; createdAt: Date; updatedAt: Date }) {
    return { id: row.id, status: row.status, stage: row.stage, diagnosticCode: row.diagnosticCode,
      electionId: row.electionId, deployment: row.deployment, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }

  async create(cookie: string | undefined, keyInput: string | undefined, body: unknown) {
    const admin = await this.auth.admin(cookie);
    const key = z.uuid().parse(keyInput);
    const fields = businessFields.parse(body);
    const canonical = JSON.stringify(fields);
    const hash = createHash('sha256').update(canonical).digest('hex');
    if (this.chain.config.CHAIN_ID !== 31337 || await this.chain.client.getChainId() !== 31337) throw new ForbiddenException({ code: 'MACI_LOCAL_ONLY', message: 'Automatic deployment requires Hardhat chain 31337.' });
    const existing = await this.db.maciDeploymentJob.findUnique({ where: { requestedById_idempotencyKey: { requestedById: admin.id, idempotencyKey: key } } });
    if (existing) {
      if (existing.requestHash !== hash) throw new ConflictException({ code: 'MACI_IDEMPOTENCY_MISMATCH', message: 'This key belongs to another election request.' });
      return this.view(existing);
    }
    const input = businessInput.parse(fields);
    const chainNow = (await this.chain.client.getBlock()).timestamp;
    if (BigInt(input.startTimestamp) < chainNow + 600n) throw new ConflictException({ code: 'MACI_START_TOO_SOON', message: 'Poll start must be at least ten chain minutes away.' });
    const genesis = await this.chain.client.getBlock({ blockNumber: 0n });
    try {
      const row = await this.db.maciDeploymentJob.create({ data: {
        id: randomUUID(), requestedById: admin.id, idempotencyKey: key, requestHash: hash,
        requestedConfig: input, genesisHash: genesis.hash,
      } });
      void this.pump().catch(() => {});
      return this.view(row);
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        const existing = await this.db.maciDeploymentJob.findUniqueOrThrow({ where: { requestedById_idempotencyKey: { requestedById: admin.id, idempotencyKey: key } } });
        if (existing.requestHash !== hash) throw new ConflictException({ code: 'MACI_IDEMPOTENCY_MISMATCH', message: 'This key belongs to another election request.' });
        return this.view(existing);
      }
      throw error;
    }
  }

  async status(cookie: string | undefined, jobIdInput: string) {
    await this.auth.admin(cookie);
    const id = z.uuid().parse(jobIdInput);
    const row = await this.db.maciDeploymentJob.findUnique({ where: { id } });
    if (!row) throw new ConflictException({ code: 'MACI_JOB_MISSING', message: 'Deployment job was not found.' });
    if (row.status === 'RECONCILIATION_REQUIRED') void this.reconcile(id).catch(() => {});
    if (row.status === 'DEPLOYING') await this.updateCheckpoint(id);
    return this.view(await this.db.maciDeploymentJob.findUniqueOrThrow({ where: { id } }));
  }

  async recent(cookie: string | undefined) {
    await this.auth.admin(cookie);
    const rows = await this.db.maciDeploymentJob.findMany({ orderBy: { createdAt: 'desc' }, take: 20 });
    return rows.map(row => this.view(row));
  }

  private async updateCheckpoint(id: string) {
    const file = join(outputs, id, 'checkpoint.json');
    if (!existsSync(file)) return;
    try {
      const { stage } = z.object({ stage: z.enum(['policies-deployed', 'maci-deployed', 'verifying-keys-set', 'complete']) }).parse(JSON.parse(readFileSync(file, 'utf8')));
      await this.db.maciDeploymentJob.updateMany({ where: { id, status: 'DEPLOYING' }, data: { stage: stage.toUpperCase().replaceAll('-', '_') } });
    } catch { /* Untrusted or incomplete checkpoint is not a progress signal. */ }
  }

  private async pump() {
    if (this.checking) return;
    this.checking = true;
    try {
      const waiting = await this.db.maciDeploymentJob.findMany({ where: { status: 'RECONCILIATION_REQUIRED' }, select: { id: true }, take: 10 });
      for (const row of waiting) await this.reconcile(row.id).catch(() => {});
      const unresolved = await this.db.maciDeploymentJob.count({ where: { status: 'RECONCILIATION_REQUIRED' } });
      if (unresolved) return;
      const running = await this.db.maciDeploymentJob.findFirst({ where: { status: 'DEPLOYING' }, select: { id: true } });
      if (running) await this.updateCheckpoint(running.id);
      const claimed = await this.db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(31337::bigint)`;
        if (await tx.maciDeploymentJob.findFirst({ where: { status: { in: ['DEPLOYING', 'VERIFYING'] } } })) return null;
        const row = await tx.maciDeploymentJob.findFirst({ where: { status: 'CREATING' }, orderBy: { createdAt: 'asc' } });
        if (!row) return null;
        await tx.maciDeploymentJob.update({ where: { id: row.id }, data: { status: 'DEPLOYING', stage: 'CLAIMED' } });
        return row.id;
      });
      if (claimed) void this.run(claimed).catch(() => {});
    } finally { this.checking = false; }
  }

  private async chainMatches(genesisHash: string) {
    if (await this.chain.client.getChainId() !== 31337 || (await this.chain.client.getBlock({ blockNumber: 0n })).hash !== genesisHash) throw new ConflictException({ code: 'MACI_CHAIN_RESET', message: 'Local chain fingerprint changed.' });
  }

  private async run(id: string) {
    const row = await this.db.maciDeploymentJob.findUniqueOrThrow({ where: { id } });
    try {
      await this.chainMatches(row.genesisHash);
      if (existsSync(join(outputs, id))) {
        await this.db.maciDeploymentJob.update({ where: { id }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'OUTPUT_EXISTS', diagnosticCode: 'MACI_EXISTING_OUTPUT' } });
        return;
      }
      const runtime = join(root, 'research/mvp3/maci/runtime-env/node_modules/@maci-protocol/contracts/node_modules/hardhat');
      if (!existsSync(runtime)) throw new ServiceUnavailableException({ code: 'MACI_RUNTIME_MISSING', message: 'Pinned local MACI runtime is unavailable.' });
      mkdirSync(intents, { recursive: true });
      const input = businessFields.parse(row.requestedConfig);
      const configFile = join(intents, `${id}.json`);
      writeFileSync(configFile, `${JSON.stringify({ runId: id, chainId: 31337, ...input })}\n`, { flag: 'wx' });
      const runCommand = (script: string, args: string[]) => new Promise<number>((resolveCode, reject) => {
        const child = spawn(process.execPath, [join(root, 'scripts', script), ...args], {
          cwd: root, env: { ...process.env, MACI_RPC_URL: this.chain.config.RPC_URL }, stdio: 'ignore', windowsHide: true,
        });
        child.once('error', reject);
        child.once('exit', code => resolveCode(code ?? 1));
      });
      const exitCode = await runCommand('deploy-maci-local.mjs', [configFile]);
      if (exitCode !== 0) {
        await this.db.maciDeploymentJob.update({ where: { id }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'SCRIPT_EXITED', diagnosticCode: 'MACI_DEPLOYMENT_UNCERTAIN' } });
        return;
      }
      await this.db.maciDeploymentJob.update({ where: { id }, data: { stage: 'ANCHORING_CANDIDATES' } });
      const anchorExit = await runCommand('anchor-mvp4-local.mjs', [
        '--deployment', join(outputs, id, 'deployment.json'), '--candidate-ids', input.candidates.map((_, index) => `option-${index}`).join(','),
        '--election-id', id, '--out', join(outputs, id, 'election-config.json'),
      ]);
      if (anchorExit !== 0) {
        await this.db.maciDeploymentJob.update({ where: { id }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'ANCHOR_UNCERTAIN', diagnosticCode: 'MACI_ANCHOR_RECONCILIATION_REQUIRED' } });
        return;
      }
      await this.db.maciDeploymentJob.update({ where: { id }, data: { status: 'VERIFYING', stage: 'RECEIPTS' } });
      await this.reconcile(id);
    } catch (error) {
      const code = error instanceof ServiceUnavailableException ? 'MACI_RUNTIME_MISSING' : 'MACI_DEPLOYMENT_UNCERTAIN';
      await this.db.maciDeploymentJob.update({ where: { id }, data: { status: code === 'MACI_RUNTIME_MISSING' ? 'FAILED' : 'RECONCILIATION_REQUIRED', stage: 'INTERRUPTED', diagnosticCode: code } });
    }
  }

  private async reconcile(id: string) {
    const row = await this.db.maciDeploymentJob.findUniqueOrThrow({ where: { id } });
    if (row.status === 'READY' || row.status === 'FAILED') return;
    const file = join(outputs, id, 'deployment.json');
    const configFile = join(outputs, id, 'election-config.json');
    if (!existsSync(file) || !existsSync(configFile)) return;
    try {
      await this.chainMatches(row.genesisHash);
      const output = outputSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      const input = businessFields.parse(row.requestedConfig);
      if (output.runId !== id || output.startTimestamp !== input.startTimestamp || output.endTimestamp !== input.endTimestamp || JSON.stringify(output.candidates) !== JSON.stringify(input.candidates)) throw new Error('configuration mismatch');
      const deployment = { chainId: '31337', maciAddress: getAddress(output.maciAddress), registrationAddress: getAddress(output.registrationAddress), pollAddress: getAddress(output.pollAddress), pollId: output.pollId, deploymentBlock: String(output.deploymentBlock) };
      const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
      for (const tx of output.transactions) {
        const receipt = await this.chain.client.getTransactionReceipt({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(tx.hash) as Hex });
        if (receipt.status !== 'success' || receipt.blockNumber !== BigInt(tx.blockNumber) || receipt.gasUsed.toString() !== tx.gasUsed || head < receipt.blockNumber + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) throw new Error('receipt mismatch or unconfirmed');
        const block = await this.chain.client.getBlock({ blockNumber: receipt.blockNumber });
        if (block.hash !== receipt.blockHash) throw new Error('receipt block mismatch');
      }
      const onChain = await this.maci.verifyDeployment(deployment);
      if (onChain.startTimestamp !== String(input.startTimestamp) || onChain.endTimestamp !== String(input.endTimestamp) || onChain.voteOptions !== input.candidates.length) throw new Error('poll mismatch');
      const configurationJson = readFileSync(configFile, 'utf8');
      const config = z.object({ electionId: z.uuid(), candidates: z.array(z.object({ id: z.string(), name: z.string(), optionIndex: z.number().int() }).strict()), anchor: z.object({ transactionHash: z.string(), sender: z.string() }), startTimestamp: z.string(), codeHashes: z.record(z.string(), z.string()) }).passthrough().parse(JSON.parse(configurationJson));
      if (config.electionId !== id || config.startTimestamp !== String(input.startTimestamp) || config.candidates.some((candidate, index) => candidate.name !== input.candidates[index] || candidate.optionIndex !== index)) throw new Error('candidate anchor mismatch');
      for (const [name, address] of Object.entries({ maci: output.maciAddress, poll: output.pollAddress, messageProcessor: output.messageProcessorAddress, tally: output.tallyAddress })) {
        const code = await this.chain.client.getCode({ address: getAddress(z.string().parse(address)) });
        if (!code || keccak256(code).toLowerCase() !== config.codeHashes[name]?.toLowerCase()) throw new Error('deployment code hash mismatch');
      }
      const anchorReceipt = await this.chain.client.getTransactionReceipt({ hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).parse(config.anchor.transactionHash) as Hex });
      const anchorBlock = await this.chain.client.getBlock({ blockNumber: anchorReceipt.blockNumber });
      const anchorTx = await this.chain.client.getTransaction({ hash: anchorReceipt.transactionHash });
      const base = { ...config } as Record<string, unknown>;
      delete base.anchor;
      const baseHash = `0x${createHash('sha256').update(`${canonical(base)}\n`).digest('hex')}`;
      if (anchorReceipt.status !== 'success' || anchorReceipt.blockHash !== anchorBlock.hash) throw new Error('anchor receipt invalid');
      if (anchorBlock.timestamp >= BigInt(input.startTimestamp)) throw new Error('anchor late');
      if (head < anchorReceipt.blockNumber + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) throw new Error('anchor unconfirmed');
      if (anchorTx.from.toLowerCase() !== config.anchor.sender.toLowerCase() || anchorTx.to?.toLowerCase() !== config.anchor.sender.toLowerCase()) throw new Error('anchor sender mismatch');
      if (anchorTx.input.toLowerCase() !== baseHash) throw new Error('anchor hash mismatch');
      await this.db.$transaction(async tx => {
        const current = await tx.maciDeploymentJob.findUniqueOrThrow({ where: { id } });
        if (current.electionId) return;
        const election = await tx.maciElection.create({ data: { id, ...deployment, deploymentInstanceId: id,
          maciAddress: deployment.maciAddress.toLowerCase(), registrationAddress: deployment.registrationAddress.toLowerCase(), pollAddress: deployment.pollAddress.toLowerCase(),
          ...onChain, title: input.title, candidates: input.candidates } });
        await tx.maciDeploymentJob.update({ where: { id }, data: { status: 'READY', stage: 'COMPLETE', diagnosticCode: null, electionId: election.id, deployment: JSON.parse(JSON.stringify({ ...output, configurationJson, configurationSha256: createHash('sha256').update(configurationJson).digest('hex'), anchorTransactionHash: config.anchor.transactionHash })) } });
      }, { isolationLevel: 'Serializable' });
    } catch (error) {
      const known = new Set(['configuration mismatch', 'receipt mismatch or unconfirmed', 'receipt block mismatch', 'poll mismatch', 'candidate anchor mismatch', 'deployment code hash mismatch', 'anchor receipt invalid', 'anchor late', 'anchor unconfirmed', 'anchor sender mismatch', 'anchor hash mismatch']);
      const reason = error instanceof Error && known.has(error.message) ? error.message.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_') : error instanceof ConflictException ? 'CHAIN_VALIDATION_CONFLICT' : 'CHAIN_RECONCILIATION_REQUIRED';
      await this.db.maciDeploymentJob.update({ where: { id }, data: { status: 'RECONCILIATION_REQUIRED', stage: 'VALIDATION_PENDING', diagnosticCode: `MACI_${reason}` } });
    }
  }
}

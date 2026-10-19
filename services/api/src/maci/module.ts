import { randomBytes } from 'node:crypto';
import { Body, ConflictException, Controller, ForbiddenException, Get, Header, Headers, Inject, Injectable, Module, Param, Post } from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { getAddress, type Hex } from 'viem';
import { z } from 'zod';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { InfrastructureModule } from '../infrastructure.js';
import { AuthModule, AuthService } from '../auth.js';
import { sponsoredMaciRegistrationAbi } from '../../../../packages/contracts/src/sponsored-maci-registration-abi.js';
import { MaciRelayService } from './relay.js';
import { MaciRegistrationRelay } from './registration-relay.js';
import { MaciJoinRelay } from './join-relay.js';
import { MaciAuditService } from './audit.js';
import { MACI_SNARK_FIELD } from '../../../../packages/shared-types/src/maci.js';

const addressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/).transform(value => getAddress(value));
const idSchema = z.uuid();
const decimalSchema = z.string().regex(/^(0|[1-9][0-9]*)$/);
const publicKeySchema = z.object({
  x: decimalSchema.refine(value => BigInt(value) < MACI_SNARK_FIELD),
  y: decimalSchema.refine(value => BigInt(value) < MACI_SNARK_FIELD),
}).strict();
const deploymentSchema = z.object({
  chainId: decimalSchema, maciAddress: addressSchema, registrationAddress: addressSchema,
  pollAddress: addressSchema, pollId: decimalSchema,
  deploymentBlock: decimalSchema,
}).strict();
const electionSchema = deploymentSchema.extend({
  title: z.string().trim().min(1).max(160),
  candidates: z.array(z.string().trim().min(1).max(120)).min(2).max(125),
});
const registrationAbi = sponsoredMaciRegistrationAbi;
const maciAbi = [
  { type: 'function', name: 'signUpPolicy', stateMutability: 'view', inputs: [], outputs: [{ type: 'address' }] },
  { type: 'function', name: 'getPoll', stateMutability: 'view', inputs: [{ type: 'uint256' }], outputs: [{ type: 'tuple', components: [
    { name: 'poll', type: 'address' }, { name: 'messageProcessor', type: 'address' }, { name: 'tally', type: 'address' },
  ] }] },
] as const;
const pollAbi = [
  { type: 'function', name: 'coordinatorPublicKey', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }, { type: 'uint256' }] },
  { type: 'function', name: 'startDate', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'endDate', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'voteOptions', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
] as const;
const messageProcessorCountAbi = [{ type: 'function', name: 'totalBatchesProcessed', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const;
const tallyCountAbi = [{ type: 'function', name: 'tallyBatchNum', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }] as const;

function issuerAccount() {
  const key = process.env.MACI_ISSUER_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error('MACI_ISSUER_PRIVATE_KEY is not configured');
  if (key.toLowerCase() === process.env.RELAYER_PRIVATE_KEY?.toLowerCase() || key.toLowerCase() === process.env.DEPLOYER_PRIVATE_KEY?.toLowerCase()) throw new Error('MACI issuer key must be independent');
  return privateKeyToAccount(key as Hex);
}

@Injectable()
export class MaciService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ChainService) private readonly chain: ChainService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  private async verifyDeployment(input: z.infer<typeof deploymentSchema>) {
    if (BigInt(input.chainId) !== BigInt(await this.chain.client.getChainId())) throw new ConflictException({ code: 'MACI_CHAIN_MISMATCH', message: 'MACI chain does not match the configured RPC.' });
    if (BigInt(input.deploymentBlock) > await this.chain.client.getBlockNumber()) throw new ConflictException({ code: 'MACI_DEPLOYMENT_BLOCK_INVALID', message: 'MACI deployment block is in the future.' });
    for (const address of [input.maciAddress, input.registrationAddress, input.pollAddress]) {
      if (!await this.chain.client.getCode({ address })) throw new ConflictException({ code: 'MACI_CONTRACT_MISSING', message: 'A configured MACI contract is missing.' });
    }
    const [guarded, issuer, policy, poll] = await Promise.all([
      this.chain.client.readContract({ address: input.registrationAddress, abi: registrationAbi, functionName: 'guarded' }),
      this.chain.client.readContract({ address: input.registrationAddress, abi: registrationAbi, functionName: 'issuer' }),
      this.chain.client.readContract({ address: input.maciAddress, abi: maciAbi, functionName: 'signUpPolicy' }),
      this.chain.client.readContract({ address: input.maciAddress, abi: maciAbi, functionName: 'getPoll', args: [BigInt(input.pollId)] }),
    ]);
    if (guarded.toLowerCase() !== input.maciAddress.toLowerCase() || policy.toLowerCase() !== input.registrationAddress.toLowerCase() || poll.poll.toLowerCase() !== input.pollAddress.toLowerCase() || issuer.toLowerCase() !== issuerAccount().address.toLowerCase()) {
      throw new ConflictException({ code: 'MACI_DEPLOYMENT_MISMATCH', message: 'MACI deployment binding is inconsistent.' });
    }
    const [coordinatorKey, startDate, endDate, voteOptions] = await Promise.all([
      this.chain.client.readContract({ address: input.pollAddress, abi: pollAbi, functionName: 'coordinatorPublicKey' }),
      this.chain.client.readContract({ address: input.pollAddress, abi: pollAbi, functionName: 'startDate' }),
      this.chain.client.readContract({ address: input.pollAddress, abi: pollAbi, functionName: 'endDate' }),
      this.chain.client.readContract({ address: input.pollAddress, abi: pollAbi, functionName: 'voteOptions' }),
    ]);
    return { coordinatorKeyX: coordinatorKey[0].toString(), coordinatorKeyY: coordinatorKey[1].toString(), startTimestamp: startDate.toString(), endTimestamp: endDate.toString(), voteOptions: Number(voteOptions) };
  }

  async configure(cookie: string | undefined, body: unknown) {
    await this.auth.admin(cookie);
    const input = electionSchema.parse(body);
    const onChain = await this.verifyDeployment(input);
    if (input.candidates.length !== onChain.voteOptions) throw new ConflictException({ code: 'MACI_CANDIDATE_COUNT_MISMATCH', message: 'Candidate count does not match the poll.' });
    try {
      return await this.db.maciElection.create({ data: {
        chainId: input.chainId, maciAddress: input.maciAddress.toLowerCase(),
        registrationAddress: input.registrationAddress.toLowerCase(), pollAddress: input.pollAddress.toLowerCase(), pollId: input.pollId,
        deploymentBlock: input.deploymentBlock,
        title: input.title, candidates: input.candidates, ...onChain,
      }, select: { id: true, chainId: true, maciAddress: true, pollAddress: true, pollId: true, protocolVersion: true, status: true, title: true } });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') throw new ConflictException({ code: 'MACI_ELECTION_EXISTS', message: 'This MACI deployment is already configured.' });
      throw error;
    }
  }

  async setStatus(cookie: string | undefined, electionIdInput: string, body: unknown) {
    await this.auth.admin(cookie);
    const electionId = idSchema.parse(electionIdInput);
    const { status } = z.object({ status: z.enum(['OPEN', 'CLOSED']) }).strict().parse(body);
    const election = await this.db.maciElection.findUnique({ where: { id: electionId } });
    if (!election) throw new ConflictException({ code: 'MACI_ELECTION_MISSING', message: 'MACI election was not found.' });
    const now = (await this.chain.client.getBlock()).timestamp;
    if (status === 'OPEN' && (election.status !== 'REGISTRATION' || now < BigInt(election.startTimestamp) || now > BigInt(election.endTimestamp))) throw new ConflictException({ code: 'MACI_POLL_NOT_OPEN', message: 'On-chain voting window is not open.' });
    if (status === 'CLOSED' && (election.status !== 'OPEN' || now <= BigInt(election.endTimestamp))) throw new ConflictException({ code: 'MACI_POLL_NOT_CLOSED', message: 'On-chain voting window has not closed.' });
    return this.db.maciElection.update({ where: { id: electionId }, data: { status }, select: { id: true, status: true } });
  }

  async list(cookie: string | undefined) {
    const user = await this.auth.authenticate(cookie);
    const elections = await this.db.maciElection.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, title: true, candidates: true, chainId: true, maciAddress: true, pollAddress: true, pollId: true, deploymentBlock: true, protocolVersion: true, status: true, coordinatorKeyX: true, coordinatorKeyY: true, startTimestamp: true, endTimestamp: true, voteOptions: true } });
    const eligibility = await this.db.maciEligibility.findMany({ where: { userId: user.id }, select: { electionId: true, status: true } });
    const allowed = new Set(eligibility.filter(row => row.status === 'ELIGIBLE').map(row => row.electionId));
    return elections.map(election => ({ ...election, eligible: allowed.has(election.id) }));
  }

  async monitor(cookie: string | undefined, electionIdInput: string) {
    await this.auth.admin(cookie);
    const electionId = idSchema.parse(electionIdInput);
    const election = await this.db.maciElection.findUnique({ where: { id: electionId }, select: {
      id: true, title: true, status: true, chainId: true, maciAddress: true, pollAddress: true, pollId: true,
      deploymentBlock: true, startTimestamp: true, endTimestamp: true, voteOptions: true,
    } });
    if (!election) throw new ConflictException({ code: 'MACI_ELECTION_MISSING', message: 'MACI election was not found.' });
    const [eligible, registered, joins, messages, processing, tally, latestRun, audit] = await Promise.all([
      this.db.maciEligibility.count({ where: { electionId, status: 'ELIGIBLE' } }),
      this.db.maciRegistration.count({ where: { electionId, status: 'CONFIRMED' } }),
      this.db.maciPollJoinSubmission.count({ where: { chainId: election.chainId, pollAddress: election.pollAddress, status: 'JOINED' } }),
      this.db.maciEncryptedSubmission.groupBy({ by: ['status'], where: { chainId: election.chainId, pollAddress: election.pollAddress }, _count: { _all: true } }),
      this.db.maciProofSubmission.count({ where: { electionId, kind: 'process', status: 'INCLUDED' } }),
      this.db.maciProofSubmission.count({ where: { electionId, kind: 'tally', status: 'INCLUDED' } }),
      this.db.maciCoordinatorRun.findFirst({ where: { electionId }, orderBy: { startedAt: 'desc' }, select: { status: true, processingCount: true, tallyCount: true, errorCode: true, startedAt: true, completedAt: true } }),
      this.db.maciAuditRecord.findUnique({ where: { electionId }, select: { snapshotBlock: true, snapshotHash: true, verifiedAt: true } }),
    ]);
    let chain: { status: 'AVAILABLE' | 'UNAVAILABLE' | 'INVALID' | 'AWAITING_CONFIRMATIONS'; head: string | null; confirmations: string | null; reasonCode: string | null } = { status: 'UNAVAILABLE', head: null, confirmations: null, reasonCode: 'MACI_RPC_UNAVAILABLE' };
    let onChainProcessing: number | null = null;
    let onChainTally: number | null = null;
    try {
      const chainId = await this.chain.client.getChainId();
      if (BigInt(chainId) !== BigInt(election.chainId)) chain = { status: 'INVALID', head: null, confirmations: null, reasonCode: 'MACI_CHAIN_MISMATCH' };
      else {
        const head = await this.chain.client.getBlockNumber({ cacheTime: 0 });
        let status: typeof chain.status = 'AVAILABLE';
        let reasonCode: string | null = null;
        let confirmations: string | null = null;
        if (audit) {
          confirmations = head >= audit.snapshotBlock ? (head - audit.snapshotBlock + 1n).toString() : '0';
          if (head < audit.snapshotBlock + BigInt(this.chain.config.CHAIN_CONFIRMATIONS - 1)) { status = 'AWAITING_CONFIRMATIONS'; reasonCode = 'MACI_SNAPSHOT_UNCONFIRMED'; }
          else {
            const block = await this.chain.client.getBlock({ blockNumber: audit.snapshotBlock });
            if (block.hash.toLowerCase() !== audit.snapshotHash.toLowerCase()) { status = 'INVALID'; reasonCode = 'MACI_SNAPSHOT_REORG'; }
          }
        }
        chain = { status, head: head.toString(), confirmations, reasonCode };
        const addresses = await this.chain.client.readContract({ address: getAddress(election.pollAddress), abi: pollAbi, functionName: 'voteOptions' });
        if (addresses !== BigInt(election.voteOptions)) { chain = { status: 'INVALID', head: head.toString(), confirmations, reasonCode: 'MACI_POLL_MISMATCH' }; }
        const pollContracts = await this.chain.client.readContract({ address: getAddress(election.maciAddress), abi: maciAbi, functionName: 'getPoll', args: [BigInt(election.pollId)] });
        if (pollContracts.poll.toLowerCase() !== election.pollAddress.toLowerCase()) chain = { status: 'INVALID', head: head.toString(), confirmations, reasonCode: 'MACI_POLL_MISMATCH' };
        else {
          const [processCount, tallyCount] = await Promise.all([
            this.chain.client.readContract({ address: pollContracts.messageProcessor, abi: messageProcessorCountAbi, functionName: 'totalBatchesProcessed' }),
            this.chain.client.readContract({ address: pollContracts.tally, abi: tallyCountAbi, functionName: 'tallyBatchNum' }),
          ]);
          onChainProcessing = Number(processCount);
          onChainTally = Number(tallyCount);
        }
      }
    } catch {
      chain = { status: 'UNAVAILABLE', head: null, confirmations: null, reasonCode: 'MACI_RPC_UNAVAILABLE' };
      onChainProcessing = null;
      onChainTally = null;
    }
    const submitted = Object.fromEntries(messages.map(row => [row.status, row._count._all]));
    return {
      election, observedAt: new Date().toISOString(),
      counts: { eligible, registered, joined: joins, encryptedCommandsIncluded: submitted.INCLUDED ?? 0,
        encryptedCommandsPending: (submitted.PENDING ?? 0) + (submitted.PREPARED ?? 0) },
      processing: { submittedBatches: onChainProcessing, tallyBatches: onChainTally, projectedProcessSubmissions: processing, projectedTallySubmissions: tally, latestRun },
      chain, historicalAudit: audit ? { snapshotBlock: audit.snapshotBlock.toString(), snapshotHash: audit.snapshotHash, verifiedAt: audit.verifiedAt.toISOString() } : null,
      currentVerification: !audit ? 'INCOMPLETE' : chain.status === 'AVAILABLE' ? 'APPLICATION_VERIFIED' : chain.status === 'INVALID' ? 'INVALID' : chain.status === 'AWAITING_CONFIRMATIONS' ? 'AWAITING_CONFIRMATIONS' : 'UNAVAILABLE',
      limitations: ['Included encrypted commands are not counted votes.', 'Application verification is not an independent verifier PASS.'],
    };
  }

  async assign(cookie: string | undefined, electionIdInput: string, body: unknown) {
    await this.auth.admin(cookie);
    const electionId = idSchema.parse(electionIdInput);
    const { username } = z.object({ username: z.string().trim().min(1).max(64) }).strict().parse(body);
    const user = await this.db.appUser.findUnique({ where: { usernameKey: username.normalize('NFKC').toLocaleLowerCase('en-US') } });
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException({ code: 'MACI_USER_INACTIVE', message: 'The account is not active.' });
    const election = await this.db.maciElection.findUnique({ where: { id: electionId } });
    if (!election || election.status !== 'REGISTRATION') throw new ConflictException({ code: 'MACI_REGISTRATION_CLOSED', message: 'Registration is not open.' });
    const row = await this.db.maciEligibility.upsert({
      where: { electionId_userId: { electionId, userId: user.id } },
      create: { electionId, userId: user.id }, update: {},
      select: { id: true, status: true },
    });
    return { ...row, username: user.username };
  }

  async issue(cookie: string | undefined, electionIdInput: string, body: unknown) {
    const user = await this.auth.authenticate(cookie);
    const electionId = idSchema.parse(electionIdInput);
    const publicKey = publicKeySchema.parse(body);
    const election = await this.db.maciElection.findUnique({ where: { id: electionId } });
    if (!election || election.status !== 'REGISTRATION') throw new ConflictException({ code: 'MACI_REGISTRATION_CLOSED', message: 'Registration is not open.' });
    const eligibility = await this.db.maciEligibility.findUnique({ where: { electionId_userId: { electionId, userId: user.id } } });
    if (!eligibility || eligibility.status !== 'ELIGIBLE') throw new ForbiddenException({ code: 'MACI_NOT_ELIGIBLE', message: 'The account is not eligible.' });
    await this.verifyDeployment({ chainId: election.chainId, maciAddress: getAddress(election.maciAddress), registrationAddress: getAddress(election.registrationAddress), pollAddress: getAddress(election.pollAddress), pollId: election.pollId, deploymentBlock: election.deploymentBlock });
    const account = issuerAccount();
    const chainNow = (await this.chain.client.getBlock()).timestamp;
    const wallNow = BigInt(Math.floor(Date.now() / 1000));
    const now = chainNow > wallNow ? chainNow : wallNow;
    const result = await this.db.$transaction(async tx => {
      const existing = await tx.maciRegistration.findUnique({ where: { electionId_userId: { electionId, userId: user.id } } });
      if (existing && (existing.status !== 'ISSUED' || BigInt(existing.deadline) >= now)) {
        if (existing.publicKeyX !== publicKey.x || existing.publicKeyY !== publicKey.y) throw new ConflictException({ code: 'MACI_CREDENTIAL_ALREADY_BOUND', message: 'A different MACI credential was already authorized.' });
        return existing;
      }
      const ticket = `0x${randomBytes(32).toString('hex')}`;
      const deadline = (now + 300n).toString();
      const signature = await account.signTypedData({
        domain: { name: 'HCMUT MACI Registration', version: '1', chainId: BigInt(election.chainId), verifyingContract: getAddress(election.registrationAddress) },
        types: { Registration: [
          { name: 'ticket', type: 'bytes32' }, { name: 'publicKeyX', type: 'uint256' },
          { name: 'publicKeyY', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
        ] }, primaryType: 'Registration',
        message: { ticket: ticket as Hex, publicKeyX: BigInt(publicKey.x), publicKeyY: BigInt(publicKey.y), deadline: BigInt(deadline) },
      });
      const data = { publicKeyX: publicKey.x, publicKeyY: publicKey.y, ticket, deadline, issuerSignature: signature };
      return existing
        ? tx.maciRegistration.update({ where: { id: existing.id }, data })
        : tx.maciRegistration.create({ data: { ...data, electionId, userId: user.id } });
    }, { isolationLevel: 'Serializable' });
    return { electionId, registrationAddress: election.registrationAddress, publicKeyX: result.publicKeyX, publicKeyY: result.publicKeyY, ticket: result.ticket, deadline: result.deadline, issuerSignature: result.issuerSignature, status: result.status };
  }

  async eligibility(cookie: string | undefined, electionIdInput: string) {
    const user = await this.auth.authenticate(cookie);
    const electionId = idSchema.parse(electionIdInput);
    const [election, eligibility, registration] = await Promise.all([
      this.db.maciElection.findUnique({ where: { id: electionId }, select: { id: true, title: true, candidates: true, chainId: true, maciAddress: true, pollAddress: true, pollId: true, deploymentBlock: true, protocolVersion: true, status: true, coordinatorKeyX: true, coordinatorKeyY: true, startTimestamp: true, endTimestamp: true, voteOptions: true } }),
      this.db.maciEligibility.findUnique({ where: { electionId_userId: { electionId, userId: user.id } }, select: { status: true } }),
      this.db.maciRegistration.findUnique({ where: { electionId_userId: { electionId, userId: user.id } }, select: { status: true, deadline: true, transactionHash: true, publicKeyX: true, publicKeyY: true } }),
    ]);
    if (!election) throw new ConflictException({ code: 'MACI_ELECTION_MISSING', message: 'MACI election was not found.' });
    return { election, eligible: eligibility?.status === 'ELIGIBLE', registration: registration ?? null };
  }
}

@Controller('v1/maci')
export class MaciController {
  constructor(@Inject(MaciService) private readonly maci: MaciService, @Inject(MaciRelayService) private readonly relay: MaciRelayService, @Inject(MaciRegistrationRelay) private readonly registration: MaciRegistrationRelay, @Inject(MaciJoinRelay) private readonly join: MaciJoinRelay, @Inject(MaciAuditService) private readonly audit: MaciAuditService) {}
  @Post('admin/elections') configure(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) { return this.maci.configure(cookie, body); }
  @Post('admin/elections/:id/status') setStatus(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.maci.setStatus(cookie, id, body); }
  @Get('elections') list(@Headers('cookie') cookie: string | undefined) { return this.maci.list(cookie); }
  @Get('admin/elections/:id/monitor') monitor(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return this.maci.monitor(cookie, id); }
  @Post('admin/elections/:id/eligibility') assign(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.maci.assign(cookie, id, body); }
  @Post('elections/:id/authorization') issue(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.maci.issue(cookie, id, body); }
  @Get('elections/:id/eligibility') eligibility(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return this.maci.eligibility(cookie, id); }
  @Post('elections/:id/registration') register(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return this.registration.submit(cookie, id); }
  @Get('elections/:id/registration') registrationStatus(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) { return this.registration.status(cookie, id); }
  @Post('elections/:id/joins') submitJoin(@Headers('cookie') cookie: string | undefined, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.join.submit(id, body, key, cookie); }
  @Get('joins/:id') joinStatus(@Param('id') id: string) { return this.join.status(id); }
  @Post('admin/elections/:id/audit') publishAudit(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.audit.publish(cookie, id, body); }
  @Post('admin/elections/:id/configuration') publishConfiguration(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.audit.publishConfiguration(cookie, id, body); }
  @Get('elections/:id/audit') publicAudit(@Param('id') id: string) { return this.audit.publicEvidence(id); }
  @Get('elections/:id/configuration') publicConfiguration(@Param('id') id: string) { return this.audit.publicConfiguration(id); }
  @Get('elections/:id/configuration.json') @Header('Content-Type', 'text/plain; charset=utf-8') publicConfigurationArtifact(@Param('id') id: string) { return this.audit.publicConfigurationArtifact(id); }
  @Get('elections/:id/evidence/:artifact') @Header('Content-Type', 'text/plain; charset=utf-8') publicArtifact(@Param('id') id: string, @Param('artifact') artifact: string) { return this.audit.publicArtifact(id, artifact); }
  @Post('elections/:id/messages') submitMessage(@Headers('cookie') cookie: string | undefined, @Headers('idempotency-key') key: string | undefined, @Param('id') id: string, @Body() body: unknown) { return this.relay.submit(id, body, key, cookie); }
  @Get('messages/:id') messageStatus(@Param('id') id: string) { return this.relay.status(id); }
}

@Module({ imports: [InfrastructureModule, AuthModule], controllers: [MaciController], providers: [MaciService, MaciRelayService, MaciRegistrationRelay, MaciJoinRelay, MaciAuditService] })
export class MaciModule {}

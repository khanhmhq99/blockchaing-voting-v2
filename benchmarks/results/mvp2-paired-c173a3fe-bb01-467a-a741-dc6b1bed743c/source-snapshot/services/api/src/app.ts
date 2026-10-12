import 'reflect-metadata';
import { Body, Catch, Controller, Get, Headers, HttpException, Inject, Module, Param, Post, Query, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { z, ZodError } from 'zod';
import type { Address } from 'viem';
import { DatabaseService } from './database.js';
import { ChainService } from './chain.js';
import { ElectionsService } from './elections.js';
import { AdminService } from './admin.js';
import { IndexerService } from './indexer.js';
import { jsonSafe, manifestSchema } from '../../../packages/shared-types/src/index.js';
import { InfrastructureModule } from './infrastructure.js';
import { RelayerModule } from './relayer/module.js';
import { RelayError } from './relayer/errors.js';

const idSchema = z.string().regex(/^[1-9]\d{0,19}$/);
@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    if (error instanceof RelayError) { host.switchToHttp().getResponse<{ status(n: number): { json(v: unknown): void } }>().status(error.getStatus()).json(error.getResponse()); return; }
    const status = error instanceof ZodError ? 400 : error instanceof HttpException ? error.getStatus() : 503;
    host.switchToHttp().getResponse<{ status(n: number): { json(v: unknown): void } }>().status(status).json({ error: { code: status === 503 ? 'DEPENDENCY_UNAVAILABLE' : 'REQUEST_REJECTED', message: status === 503 ? 'A required service is unavailable. Retry later.' : 'Check the request, authorization, or election state.' } });
  }
}
@Controller('v1')
export class AppController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService, @Inject(ElectionsService) private readonly elections: ElectionsService, @Inject(AdminService) private readonly admin: AdminService, @Inject(IndexerService) private readonly indexer: IndexerService) {}
  @Get('health') async health() { await this.db.$queryRaw`SELECT 1`; await this.chain.verifyNetwork(); return { database: 'connected', chain: 'connected' }; }
  @Get('config') config() {
    const explorer = process.env.CHAIN_EXPLORER_URL;
    const parsed = explorer ? new URL(z.url().parse(explorer)) : null;
    if (parsed && (parsed.protocol !== 'https:' || parsed.username || parsed.password)) throw new Error('Invalid public explorer configuration');
    return { chainId: this.chain.config.CHAIN_ID, contractAddress: this.chain.address, confirmations: this.chain.config.CHAIN_CONFIRMATIONS, explorerUrl: parsed?.toString().replace(/\/$/, '') ?? null };
  }
  @Get('elections') async list() { return jsonSafe(await this.elections.list()); }
  @Get('transactions') async transactions() {
    return jsonSafe(await this.db.blockchainTransaction.findMany({ where: { chainId: String(this.chain.config.CHAIN_ID), contractAddress: this.chain.address }, take: 100, orderBy: { observedAt: 'desc' } }));
  }
  @Get('benchmarks') async benchmarks() {
    return jsonSafe(await this.db.benchmarkRun.findMany({ take: 20, orderBy: { createdAt: 'desc' } }));
  }
  @Get('elections/:id/results') async results(@Param('id') id: string) {
    const election = await this.chain.election(BigInt(idSchema.parse(id)));
    return jsonSafe({ source: election.source, counts: election.counts, totalVotes: election.totalVotes, eligibleCount: election.eligibleCount, finalized: election.finalized, state: election.state, blockNumber: election.blockNumber, blockHash: election.blockHash });
  }
  @Get('elections/:id/candidates') async candidates(@Param('id') id: string) {
    const election = await this.elections.get(idSchema.parse(id));
    return { candidates: election.metadata?.candidates ?? null, metadataStatus: election.metadataStatus };
  }
  @Get('elections/:id/voters/:address') async voter(@Param('id') id: string, @Param('address') address: string) {
    const election = await this.chain.election(BigInt(idSchema.parse(id)), z.string().regex(/^0x[0-9a-fA-F]{40}$/).parse(address) as Address);
    return jsonSafe({ eligible: election.eligible, hasVoted: election.hasVoted, source: 'blockchain', blockNumber: election.blockNumber, blockHash: election.blockHash });
  }
  @Get('elections/:id') async election(@Param('id') id: string, @Query('voter') voter?: string) {
    const address = voter ? z.string().regex(/^0x[0-9a-fA-F]{40}$/).parse(voter) as Address : undefined;
    return jsonSafe(await this.elections.get(idSchema.parse(id), address));
  }
  @Post('admin/challenge') challenge(@Body() body: unknown) {
    const { action, digest } = z.object({ action: z.enum(['metadata', 'index']), digest: z.string().regex(/^0x[0-9a-f]{64}$/) }).strict().parse(body);
    return this.admin.challenge(action, digest);
  }
  @Post('admin/elections/:id/metadata') async save(@Param('id') id: string, @Body() body: unknown, @Headers('x-admin-nonce') nonce?: string, @Headers('x-admin-signature') signature?: string) {
    const payload = { electionId: idSchema.parse(id), manifest: manifestSchema.parse(body) };
    await this.admin.authorize('metadata', payload, nonce, signature);
    return this.elections.save(payload.electionId, payload.manifest);
  }
  @Post('admin/index') async sync(@Headers('x-admin-nonce') nonce?: string, @Headers('x-admin-signature') signature?: string) {
    await this.admin.authorize('index', {}, nonce, signature);
    return this.indexer.sync();
  }
}
@Module({ imports: [InfrastructureModule, RelayerModule], controllers: [AppController], providers: [ElectionsService, AdminService, IndexerService] })
export class AppModule {}

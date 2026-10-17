import 'reflect-metadata';
import { Catch, Controller, Get, HttpException, Inject, Module, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import { ZodError } from 'zod';
import { DatabaseService } from './database.js';
import { ChainService } from './chain.js';
import { InfrastructureModule } from './infrastructure.js';
import { AuthModule } from './auth.js';
import { MaciModule } from './maci/module.js';

@Catch()
export class SafeExceptionFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const status = error instanceof ZodError ? 400 : error instanceof HttpException ? error.getStatus() : 503;
    const raw = error instanceof HttpException ? error.getResponse() : null;
    const detail = typeof raw === 'object' && raw !== null && 'code' in raw && 'message' in raw && typeof raw.code === 'string' && /^[A-Z_]{3,48}$/.test(raw.code) && typeof raw.message === 'string' && raw.message.length <= 200
      ? { code: raw.code, message: raw.message }
      : null;
    host.switchToHttp().getResponse<{ status(n: number): { json(v: unknown): void } }>().status(status).json({ error: detail ?? {
      code: status === 503 ? 'DEPENDENCY_UNAVAILABLE' : 'REQUEST_REJECTED',
      message: status === 503 ? 'Service is temporarily unavailable.' : 'The request is invalid or the election state changed.',
    } });
  }
}

@Controller('v1')
export class AppController {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService, @Inject(ChainService) private readonly chain: ChainService) {}
  @Get('health') async health() { await this.db.$queryRaw`SELECT 1`; await this.chain.verifyNetwork(); return { database: 'connected', chain: 'connected' }; }
  @Get('config') async config() { await this.chain.verifyNetwork(); return { protocol: 'maci-v3.0.0-full-v1', chainId: this.chain.config.CHAIN_ID, confirmations: this.chain.config.CHAIN_CONFIRMATIONS }; }
}

@Module({ imports: [InfrastructureModule, AuthModule, MaciModule], controllers: [AppController] })
export class AppModule {}

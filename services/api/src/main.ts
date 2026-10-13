import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule, SafeExceptionFilter } from './app.js';

async function main() {
  const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
  const configuredOrigin = new URL(process.env.APP_ORIGIN ?? 'http://localhost:3000');
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]']);
  app.enableCors({ origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
    if (!origin || origin === configuredOrigin.origin) { callback(null, true); return; }
    try {
      const requestOrigin = new URL(origin);
      const isLocalAlias = requestOrigin.protocol === configuredOrigin.protocol && requestOrigin.port === configuredOrigin.port && localHosts.has(requestOrigin.hostname) && localHosts.has(configuredOrigin.hostname);
      callback(null, isLocalAlias);
    } catch { callback(null, false); }
  }, credentials: true, methods: ['GET', 'POST'], allowedHeaders: ['Content-Type', 'x-admin-nonce', 'x-admin-signature', 'idempotency-key'] });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.API_PORT ?? 3001), process.env.API_HOST ?? '127.0.0.1');
  console.log('NestJS API ready; database credentials remain server-side.');
}
main().catch(() => { console.error('API startup failed. Verify server environment, database TLS/migrations and chain configuration.'); process.exitCode = 1; });

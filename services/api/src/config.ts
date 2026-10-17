import { readFileSync } from 'node:fs';
import { z } from 'zod';

export function databaseOptions(env: NodeJS.ProcessEnv = process.env) {
  if (!env.DATABASE_URL) throw new Error('DATABASE_URL is not configured. Follow docs/deployment/supabase.md.');
  let url: URL;
  try { url = new URL(env.DATABASE_URL); } catch { throw new Error('Invalid DATABASE_URL configuration.'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.username || !url.password) throw new Error('A PostgreSQL credentialed connection is required.');
  // node-postgres URL SSL parameters may override explicit TLS options. Strip them
  // and enforce verified TLS in the adapter for every managed connection.
  for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
  const mode = z.enum(['session', 'transaction']).parse(env.DATABASE_POOL_MODE ?? 'session');
  if (mode === 'session' && url.port === '6543') throw new Error('Use the session endpoint for session mode.');
  if (mode === 'transaction' && url.port !== '6543') throw new Error('Use the Supabase transaction endpoint for transaction mode.');
  const max = z.coerce.number().int().min(1).max(50).parse(env.DATABASE_POOL_MAX ?? '5');
  return {
    connectionString: url.toString(), max,
    connectionTimeoutMillis: z.coerce.number().int().min(1000).max(60000).parse(env.DATABASE_CONNECT_TIMEOUT_MS ?? '10000'),
    idleTimeoutMillis: z.coerce.number().int().min(1000).max(300000).parse(env.DATABASE_IDLE_TIMEOUT_MS ?? '30000'),
    ssl: { rejectUnauthorized: true, ...(env.DATABASE_CA_PATH ? { ca: readFileSync(env.DATABASE_CA_PATH, 'utf8') } : {}) },
  };
}

export function chainConfig(env: NodeJS.ProcessEnv = process.env) {
  return z.object({ RPC_URL: z.url(), CHAIN_ID: z.coerce.number().int().positive(), CHAIN_CONFIRMATIONS: z.coerce.number().int().min(1).max(100) }).parse({ ...env, CHAIN_CONFIRMATIONS: env.CHAIN_CONFIRMATIONS ?? '2' });
}

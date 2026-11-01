import 'dotenv/config';
import 'reflect-metadata';
import { DatabaseService } from '../database.js';
import { ChainService } from '../chain.js';
import { AuthService } from '../auth.js';
import { MaciAuditService } from './audit.js';
import { MaciProofJobs } from './proof-jobs.js';

if (!/^macisk\.[0-9a-fA-F]{64}$/.test(process.env.MACI_COORDINATOR_PRIVATE_KEY ?? '') || !/^0x[0-9a-fA-F]{64}$/.test(process.env.MACI_PROVER_PRIVATE_KEY ?? '')) {
  throw new Error('Proof worker requires separately configured coordinator and prover keys.');
}
const db = new DatabaseService();
const chain = new ChainService();
const auth = new AuthService(db);
const jobs = new MaciProofJobs(db, chain, auth, new MaciAuditService(db, chain, auth));
let stopping = false;
process.once('SIGTERM', () => { stopping = true; });
process.once('SIGINT', () => { stopping = true; });
try {
  await db.$connect();
  await jobs.markInterrupted();
  while (!stopping) {
    try { await jobs.tick(); }
    catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error &&
        typeof error.code === 'string' && /^[A-Z0-9_]{2,24}$/.test(error.code) ? error.code :
        error instanceof Error && /^[A-Za-z]{2,48}$/.test(error.name) ? error.name : 'DEPENDENCY_UNAVAILABLE';
      process.stderr.write(`MACI proof worker: tick failed (${code}); retrying after delay.\n`);
    }
    await new Promise(resolve => setTimeout(resolve, 10_000));
  }
} finally {
  await db.$disconnect();
}

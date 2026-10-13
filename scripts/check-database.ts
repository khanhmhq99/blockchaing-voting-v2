import 'dotenv/config';
import { DatabaseService } from '../services/api/src/database.js';

if (!process.env.DATABASE_URL) { console.error('BLOCKED: DATABASE_URL is not configured; no connectivity check was performed.'); process.exitCode = 2; }
else {
  let db: DatabaseService | undefined;
  try {
    db = new DatabaseService();
    await db.$connect();
    await db.$queryRaw`SELECT 1`;
    await db.electionMetadata.count();
    await db.adminActivity.count();
    console.log('PASS: NestJS DatabaseService connects with Prisma and the voting schema is accessible. No data was written.');
  } catch { console.error('FAIL: Database connectivity/schema check failed; verify credentials, TLS, network and migration status. Credentials suppressed.'); process.exitCode = 1; }
  finally { await db?.$disconnect(); }
}

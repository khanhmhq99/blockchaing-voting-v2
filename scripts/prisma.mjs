import 'dotenv/config';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const schemaOnly = ['validate', 'generate', 'format'].includes(args[0]) || (args[0] === 'migrate' && args[1] === 'diff');
if (!schemaOnly) {
  if (!process.env.MIGRATION_DATABASE_URL) { console.error('BLOCKED: MIGRATION_DATABASE_URL is not configured.'); process.exit(2); }
  let url;
  try { url = new URL(process.env.MIGRATION_DATABASE_URL); } catch { console.error('Invalid migration connection configuration.'); process.exit(2); }
  if (url.port === '6543' || url.searchParams.get('pgbouncer') === 'true') { console.error('Migrations require direct/session mode, not transaction pooling.'); process.exit(2); }
  if (url.searchParams.get('sslmode') !== 'verify-full') { console.error('Migration URL must use sslmode=verify-full with a trusted certificate.'); process.exit(2); }
  if (args.includes('reset') || args.includes('dev') || args.includes('push')) { console.error('Destructive/development migration commands require an explicitly reviewed separate procedure.'); process.exit(2); }
}
const result = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', ...args], { stdio: 'inherit', env: { ...process.env, ...(schemaOnly ? { PRISMA_SCHEMA_ONLY: '1' } : {}) } });
process.exit(result.status ?? 1);

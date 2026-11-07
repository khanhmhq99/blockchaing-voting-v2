// Read-only dedicated BSC database inventory. Never print connection strings.
import { DatabaseService } from '../services/api/src/database.js';

if (process.env.CHAIN_ID !== '97' || !process.env.DATABASE_URL) throw new Error('BSC database preflight requires chain 97 and a runtime database URL');
const db = new DatabaseService();
try {
  await db.$connect();
  const [elections97, elections31337, jobs97, jobs31337, activeAdmins] = await Promise.all([
    db.maciElection.count({ where: { chainId: '97' } }),
    db.maciElection.count({ where: { chainId: '31337' } }),
    db.maciDeploymentJob.count({ where: { chainId: '97' } }),
    db.maciDeploymentJob.count({ where: { chainId: '31337' } }),
    db.appUser.count({ where: { role: 'ADMIN', status: 'ACTIVE' } }),
  ]);
  process.stdout.write(`${JSON.stringify({ chainId: 97, elections97, elections31337, jobs97, jobs31337, activeAdmins })}\n`);
} finally {
  await db.$disconnect();
}

import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { AppModule, SafeExceptionFilter } from '../../services/api/src/app.js';
import { DatabaseService } from '../../services/api/src/database.js';
import { payloadHash, type Manifest } from '../../packages/shared-types/src/index.js';
import type { LocalChain } from './chain.js';

// Explicit test double. This does not verify PostgreSQL or Prisma migrations.
export function memoryDatabase(manifest: Manifest) {
  let record = { title: manifest.title, description: manifest.description, manifestHash: payloadHash(manifest), electionId: '1', candidates: manifest.candidates.map((candidate, candidateId) => ({ ...candidate, candidateId })) };
  const events: unknown[] = [];
  const transactions: unknown[] = [];
  const db = {
    electionMetadata: {
      findMany: async () => [record],
      findUnique: async () => record,
      upsert: async ({ where, update }: { where: { chainId_contractAddress_electionId: { electionId: string } }; update: { title: string; description: string; manifestHash: `0x${string}`; candidates: { create: typeof record.candidates } } }) => { record = { ...record, ...update, electionId: where.chainId_contractAddress_electionId.electionId, candidates: update.candidates.create }; return record; },
    },
    indexedEvent: { deleteMany: async () => { events.length = 0; }, createMany: async ({ data }: { data: unknown[] }) => { events.push(...data); } },
    blockchainTransaction: { deleteMany: async () => { transactions.length = 0; }, createMany: async ({ data }: { data: unknown[] }) => { transactions.push(...data); }, findMany: async () => transactions },
    benchmarkRun: { findMany: async () => [] },
    chainCheckpoint: { upsert: async () => undefined },
    $executeRaw: async () => 1,
    $queryRaw: async () => [{ result: 1 }],
    $transaction: async (work: (tx: unknown) => Promise<unknown>) => work(db),
    events, transactions,
    corrupt: () => { record.title = 'Tampered database title'; },
  };
  return db;
}
export async function testApi(chain: LocalChain, manifest: Manifest, port = 0) {
  Object.assign(process.env, { RPC_URL: chain.url, CHAIN_ID: '31337', VOTING_CONTRACT_ADDRESS: chain.address, DEPLOYMENT_BLOCK: chain.deploymentBlock.toString(), CHAIN_CONFIRMATIONS: '1' });
  const db = memoryDatabase(manifest);
  const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DatabaseService).useValue(db).compile();
  const app = module.createNestApplication({ logger: false });
  app.enableCors({ origin: 'http://127.0.0.1:3100' });
  app.useGlobalFilters(new SafeExceptionFilter());
  await app.listen(port, '127.0.0.1');
  return { app, module, db, url: await app.getUrl() };
}

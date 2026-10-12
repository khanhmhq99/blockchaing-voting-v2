import { randomUUID } from 'node:crypto';

// Explicit in-memory test double. It exercises orchestration, NOT PostgreSQL locks,
// constraints, pooling, TLS, isolation or managed Supabase durability.
type Row = Record<string, unknown>;
type Args = { where?: Row; data?: Row; create?: Row; update?: Row; include?: Row; orderBy?: Row };
export function relayerMemoryDatabase() {
  const requests: Row[] = []; const transactions: Row[] = []; const budgets: Row[] = []; const history: Row[] = [];
  let tail = Promise.resolve();
  const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, value]) => {
    if (value && typeof value === 'object' && 'in' in value) return (value.in as unknown[]).includes(row[key]);
    return row[key] === value;
  });
  const hydrate = (row: Row | undefined, include?: Row): Row | null => {
    if (!row) return null;
    return { ...row, ...(include?.transaction ? { transaction: transactions.find(t => t.requestId === row.id) ?? null } : {}), ...(include?.request ? { request: requests.find(r => r.id === row.requestId) } : {}) };
  };
  const apply = (row: Row, data: Row) => {
    for (const [key, value] of Object.entries(data)) {
      if (key === 'history') { history.push({ requestId: row.id, ...(value as { create: Row }).create }); continue; }
      if (value && typeof value === 'object' && 'increment' in value) row[key] = (BigInt(String(row[key])) + BigInt(String(value.increment))).toString();
      else row[key] = value;
    }
    row.updatedAt = new Date(); return row;
  };
  const model = (rows: Row[], defaults: Row = {}) => ({
    findUnique: async ({ where, include }: Args) => hydrate(rows.find(row => matches(row, where)), include),
    findUniqueOrThrow: async ({ where, include }: Args) => { const row = hydrate(rows.find(row => matches(row, where)), include); if (!row) throw new Error('Missing fixture row'); return row; },
    findFirst: async ({ where, include }: Args) => hydrate(rows.find(row => matches(row, where)), include),
    findMany: async ({ where, include }: Args = {}) => rows.filter(row => matches(row, where)).map(row => hydrate(row, include)),
    count: async ({ where }: Args) => rows.filter(row => matches(row, where)).length,
    create: async ({ data = {}, include }: Args) => { const row = apply({ id: randomUUID(), createdAt: new Date(), ...defaults }, data); rows.push(row); return hydrate(row, include); },
    update: async ({ where, data = {} }: Args) => { const row = rows.find(row => matches(row, where)); if (!row) throw new Error('Missing fixture update'); return { ...apply(row, data) }; },
    upsert: async ({ where, create = {}, update = {} }: Args) => { let row = rows.find(row => matches(row, where)); if (!row) { row = { ...defaults, ...create }; rows.push(row); } else apply(row, update); return { ...row }; },
  });
  const db = {
    gaslessVoteRequest: model(requests, { signature: null, activeSlot: null, errorCode: null, confirmedAt: null }),
    relayerTransaction: model(transactions, { rawTransaction: null, submittedAt: null, confirmedAt: null, blockHash: null, blockNumber: null, gasUsed: null, effectiveGasPrice: null, transactionFee: null, submissionMs: null }),
    relayerBudget: model(budgets, { reservedWei: '0' }),
    gaslessRequestHistory: model(history),
    $executeRaw: async () => 1,
    $transaction: async <T>(work: (tx: unknown) => Promise<T>): Promise<T> => {
      const previous = tail; let unlock!: () => void; tail = new Promise(resolve => { unlock = resolve; }); await previous;
      const snapshot = structuredClone([requests, transactions, budgets, history]);
      try { return await work(db); } catch (error) {
        [requests, transactions, budgets, history].forEach((table, i) => table.splice(0, table.length, ...snapshot[i]!)); throw error;
      } finally { unlock(); }
    },
    requests, transactions, budgets, history,
  };
  return db;
}

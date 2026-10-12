# ADR 0007: Supabase PostgreSQL and the MVP 1 implementation baseline

Status: accepted by the owner; implemented locally, managed-database acceptance pending credentials.
Date: 2026-10-12. Supersedes local PostgreSQL/Docker and pnpm setup proposals for MVP 1.

## Context and alternatives

The owner selected NestJS/TypeScript, Supabase PostgreSQL, Prisma, Viem, Solidity and Next.js. A self-hosted PostgreSQL container would add unrequested infrastructure. Supabase browser APIs would bypass the required NestJS orchestration boundary. Neither alternative is used.

## Decision

Use Supabase as the primary relational database, through Prisma 7 and its node-postgres adapter inside NestJS. Keep all tables in a private `voting` schema. No Supabase Auth, Realtime, browser database SDK, service-role API key, or public Data API access is introduced. Database passwords and RPC credentials remain server-side.

`DATABASE_URL` configures runtime access. `MIGRATION_DATABASE_URL` configures Prisma schema migrations separately and must use direct or session connectivity. A persistent NestJS process uses a direct/session connection and a bounded client pool, initially five connections per process. Transaction pooling on port 6543 is available for an explicitly chosen serverless runtime, with a suitably lower pool budget. Runtime TLS always verifies the server certificate; migrations require `sslmode=verify-full`. Pool size must account for replicas, worker processes and the Supabase project connection limit.

The chain alone determines eligibility, spent-wallet status, lifecycle and results. Database records contain manifest-committed metadata, candidate profiles, rebuildable events/receipt summaries and research measurements. API reads identify their block number/hash. Altered metadata is withheld when its manifest or candidate hashes do not match the chain. Full event rebuilds use a canonical checkpoint and a PostgreSQL advisory transaction lock; the baseline deliberately avoids a premature distributed indexing service.

Use npm 11.19.0 workspaces and one lockfile with Node 24.21.0. The repository-local verified portable Node resolves the earlier Windows runtime problem without changing system execution policy. Both public and administrative views remain in one Next.js application. Solidity is compiled by pinned solc-js 0.8.37, optimizer 200, EVM Paris; Hardhat runs the local EVM. OpenZeppelin Ownable supplies owner checks; ownership transfer/renunciation are disabled for this immutable baseline deployment.

Executable lifecycle is `Draft -> Upcoming -> Active -> Closed`, with a separate finalization flag and terminal `Cancelled`. Freeze requires all candidate hashes registered and prevents further metadata/window/eligibility changes. Windows are half-open. Candidates are zero-based, elections one-based. Candidate count is 2–100; eligibility batches contain at most 200 wallets. Larger electorates use multiple pre-freeze batches. An admin can cancel before finalization, including while voting, which is a censorship trust assumption.

## Trade-offs and security implications

Supabase availability and account control become operational dependencies. SQL credentials require separate least-privilege runtime/migration roles. Private schema permissions do not replace an independent database-access review. No real identities belong in MVP 1 tables. The signed administrative challenge store is bounded, expires after two minutes and consumes each nonce once; it is intentionally single-process and resets on restart. Multi-replica administration requires a shared atomic challenge store before deployment at that scale.

The initial indexer performs a complete rebuild and retains events only through a configurable confirmation depth. It is suitable for the baseline and is not the independent audit verifier promised in MVP 4. Failed transactions that emit no event are not discovered by this event indexer. Browser receipts expose their own failures; benchmark raw attempts preserve observed workload outcomes. Runtime/API availability does not confer authority to change votes.

## Research implications and compatibility

MVP 1 remains a public, synthetic-wallet protocol. Preserve this contract and its ABI when adding versioned MVP 2 submission authorization and MVP 3 encrypted ballots. Supabase tables must not become the credential authority. Anonymous issuance/ballot storage separation, ElGamal composition and public verification remain governed by ADRs 0003–0006. No later feature is implemented here.

Local benchmark results are exploratory until a Git revision and repeated experimental runs exist. One-process localhost performance is not public-chain capacity or production latency.

## Evidence and reconsideration

See [MVP 1 evidence](../../mvps/mvp-1.md), [deployment procedure](../../deployment/supabase.md) and [baseline measurements](../../benchmarks/mvp-1-baseline.md). Revisit connection budgets when the hosting model changes, indexing design when rebuild cost becomes excessive, and this decision if live PostgreSQL migration/transaction tests reveal incompatibility. A successful mock integration test cannot discharge the managed-database gate.

Primary references: [Supabase Prisma integration](https://supabase.com/docs/guides/database/prisma), [connection methods](https://supabase.com/docs/guides/database/connecting-to-postgres), [Prisma PostgreSQL connector](https://www.prisma.io/docs/orm/overview/databases/postgresql).

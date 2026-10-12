# MVP 1 implementation and evidence

Updated 2026-10-12, Asia/Saigon. **Implemented locally; milestone acceptance is incomplete.** The owner explicitly authorized MVP 1 and local blockchain deployments. No subsequent MVP was implemented. No commit, tag, mainnet, public testnet deployment or destructive database operation was performed.

## Scope delivered

The contract creates/configures draft elections, registers committed candidate profiles, authorizes/revokes synthetic wallets in bounded batches, freezes configuration, enforces the half-open voting window and one vote per wallet/election, emits acceptance/lifecycle events, cancels with a reason commitment and finalizes counts after closing. OpenZeppelin owner checks and non-transferable baseline ownership define administration. Voter eligibility and results are never delegated to SQL.

The NestJS API supplies versioned metadata, candidates, live chain eligibility/status/results, indexed receipt history and benchmark reads. Administrative metadata/index writes use expiring one-use signatures bound to the configured chain/contract/action/payload. Metadata/candidate commitments are checked against the chain. The full index rebuild includes block checkpoints, receipt/log consistency, atomic replacement and a PostgreSQL advisory lock. In-memory integration fixtures test orchestration; actual PostgreSQL transaction behavior remains a separate gate.

Prisma models cover ElectionMetadata, CandidateProfile, IndexedEvent, BlockchainTransaction, ChainCheckpoint, BenchmarkRun and BenchmarkMeasurement. The additive initial migration creates the private `voting` schema. Runtime and migration connection settings are separate, secrets are environment-only, TLS verifies certificates and pool size is bounded. Supabase Auth/Realtime are absent.

The Vietnamese Next.js frontend has election search/state filters, eligibility and candidate views, wallet/network handling, gas-aware confirmation, transaction state/hash, optional explorer links, receipts, results charts and an admin dashboard. Admin actions create/configure, register candidates, recover a failed metadata save, authorize/revoke, freeze/cancel/finalize and sync events. A reusable wallet adapter handles injected providers. Next exports static assets; NestJS owns the API.

Local deployment and synthetic seed scripts were executed. Benchmark scenarios use 10, 100 and 1000 independent wallets and preserve actual raw receipt-derived measurements. The existing future cryptography/audit design is retained without implementing those features.

## Verification environment

Windows 10.0.26200, Node 24.21.0, npm 11.19.0, Intel i5-12400F. The portable official Node archive was verified against its published SHA-256 and placed under ignored `.tools`. No system execution policy was changed. Restricted-sandbox Hardhat initially failed in tsx `uv_os_get_passwd`; the authorized normal Windows process environment passed the EVM/browser checks. Initial test failures from that runtime restriction and a browser-fixture route were corrected before the recorded passing runs.

All commands ran from the repository root with the pinned Node on PATH. The repository remains on unborn `main`, with all project files untracked and no Git revision. The lockfile, exact contract compiler settings, source hashes and public local deployment records are retained. Benchmark manifests label the missing revision as exploratory.

| Command/check | Observed outcome |
| --- | --- |
| `npm.cmd run prisma:validate` | Exit 0; schema valid, no database connection needed |
| `npm.cmd run prisma:generate` | Exit 0; Prisma client 7.10.0 generated |
| Initial migration generated via `prisma migrate diff --from-empty --to-schema services/api/prisma/schema.prisma --script` with schema-only config | Exit 0; SQL generated offline, not applied |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0 for backend/shared/tests and frontend |
| `npm.cmd run build` | Exit 0; Solidity artifact, NestJS output and Next static export generated |
| `npm.cmd run test:unit` | 4 passing: configuration/TLS, canonical metadata, admin signature binding/replay and expiry |
| `npm.cmd run test:integration` | 3 passing with real EVM + explicit memory DB; 1 live Supabase test skipped because DATABASE_URL is absent |
| `npm.cmd run test:contracts` | 5 passing on real local EVM; role/configuration/bounds/lifecycle, concurrent duplicate, counts/events and isolation/cancellation |
| `npm.cmd run test:e2e` | 2 browser scenarios: wrong-network/rejection and admin-to-two-voter workflow; injected transport backed by actual EVM transactions |
| `npm.cmd run benchmark:mvp1` | Exit 0; 10/100/1000 accepted synthetic votes, raw artifacts and summaries retained |
| Deployment and seed scripts against isolated port 18549 | Exit 0; deployed bytecode and 2 registered candidates/3 eligible voters/frozen seed verified |
| `npm.cmd audit --audit-level=low` | Exit 0; 0 reported vulnerabilities at the time of execution |
| Primary benchmark artifact recheck | Exit 0; raw/logical/source/driver/lockfile SHA-256 values, accepted counts and gas totals match all three manifests |
| `git diff --check` and untracked-file whitespace/local-link inspection | Exit 0; no detected issues across 116 project files at inspection |
| `npm.cmd run db:check` | Nonzero, BLOCKED: DATABASE_URL absent; no real connectivity test performed |
| `npm.cmd run db:migrate:status` | Nonzero, BLOCKED: MIGRATION_DATABASE_URL absent; no remote migration inspection performed |
| GitHub CI | Workflow added with commit-pinned actions; not run remotely in this session |

Browser test fixtures are intentionally not production backends. They replace only the database and wallet transport, while the actual NestJS handlers, signatures, contract transactions and chain reads execute. This is not an assertion that MetaMask extension permissions, live Supabase grants, connection pool concurrency or SQL rollback were tested.

The browser workflow explicitly observes a rejected transaction leaving `hasVoted=false`, then a pending transaction and confirmation. Two distinct wallets produce one accepted vote each; an explicit repeat transaction fails. After closing/finalizing, the signed event-index action reconstructs exactly two VoteCast transaction records. A local screenshot was inspected for the admin dashboard/form layout; that inspection is not an accessibility or mobile-device certification.

## Local deployment evidence

The deployment-script smoke used chain 31337, contract `0xe7f1725e7734ce288f8367e1bb143e90bb3f0512`, block 2, transaction `0xc74e9fb049462c9d62ff5fbde7dd18336b32baf806a200bf2d0c1b32c2d296e7`. Compiler: solc 0.8.37, optimizer 200, Paris. Public details: [local smoke](../../deployments/local-smoke.json) and [deployment artifact](../../deployments/31337.json).

This was a disposable local chain and it was stopped after verification. These addresses are historical fixture evidence, not a currently running deployment. A fresh `npm.cmd run deploy` generates the current address/block for the owner's local `.env`. No private keys are stored in these records.

## Benchmark observations

The latest 10/100/1000-voter runs accepted every intended vote. Vote gas ranged 64,203–98,403; the 1000-voter run had mean 64,260.30 gas, p50/p95 local inclusion 5.423/7.786 ms and sequential completion throughput 175.19 votes/s. These are exploratory loopback/automining measurements, not public-chain capacity or latency. Setup/authorization/fees and exact run IDs/raw evidence are in the [baseline report](../benchmarks/mvp-1-baseline.md). Nothing was written to Supabase benchmark tables without credentials.

## Remaining acceptance gates

1. Configure the existing Supabase project securely. Review migration compatibility with its existing schema, apply the additive migration, verify least-privilege role grants/TLS/pooling, run `db:check`, migration status and the real database integration test. Exercise metadata/index persistence, rollback and concurrent rebuilds against that actual project. No credential value should be sent in chat or committed.
2. Perform the documented manual MetaMask extension flow against the configured backend/database. Automated injected-provider tests do not replace this acceptance check. Public testnet deployment remains optional and was not performed.
3. Review current official dependency advisories before public hosting. npm audit does not establish security, and the previously recorded pending Next.js notice has not been resolved here. No public hosting was authorized or performed.
4. Create an approved Git revision and repeat controlled benchmarks before claiming a reproducible thesis/milestone baseline. Do not tag MVP 1 while its acceptance gates are open.

Operational limits: one API process for nonce memory; capped metadata discovery/history; explicit full index rebuild; no pending-mempool inventory or discovery of eventless failed transactions; no public archive/independent verifier. UI receipts use confirmation depth, not settlement finality. The admin may censor by cancellation or authorize multiple wallets for one person. Choices, senders and transaction history are public. No production election security or ballot anonymity is claimed.

## Navigation and continuation boundary

[Setup, environment and launch](../deployment/supabase.md), [API v1](../architecture/api-mvp1.md), [ADR 0007](../architecture/adr/0007-supabase-prisma-mvp1.md), [threat model](../security/threat-model.md), [original acceptance plan](mvp-1-basic-voting.md).

Stop at MVP 1. MVP 2 sponsorship, MVP 3 credentials/ZK/ElGamal, MVP 4 independent audit, MVP 5 anomaly detection and MVP 6 L1/L2 experiments require separate explicit instructions.

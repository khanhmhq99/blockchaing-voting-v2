# MVP 2 implementation and evidence

Updated 2026-10-12, Asia/Saigon. **Implemented and verified on the local EVM; milestone acceptance is incomplete.** The explicit MVP 2 request supersedes the previous MVP 1 stop boundary. No MVP 3 work, public network deployment, real cryptocurrency spending, managed migration, commit or tag was performed.

## Repository analysis and delivered changes

Starting Git revision: `e0c2ad1934ffbe38260106ce46cbcdaa7f22f982` (`feat: first initial - MVP1`); working tree was clean. Reused NestJS configuration, exception filtering, metadata commitments/indexing, Supabase/Prisma infrastructure, Viem, the existing wallet adapter/admin UI and real-EVM test helpers. BasicVoting.sol, its generated source ABI, historical deployments and all previous MVP 1 benchmark records are unchanged. The historical MVP 1 report's unborn-repository statement describes that earlier session; it is not this session's Git state.

The [new contract](../../packages/contracts/contracts/GaslessVoting.sol) preserves lifecycle/owner/candidate/eligibility/counting behavior in a versioned snapshot. Both direct and sponsored paths use a shared internal cast function. OpenZeppelin EIP712/ECDSA binds the manifest, voter, candidate, election, nonce and deadline to the configured chain/contract. Nonces are election scoped and consumed atomically with voting. Signer attribution is the voter, never the relayer. EOA-only scope is explicit.

The NestJS module separates signature/authorization checks from transaction preparation/broadcast. It implements strict canonical inputs, idempotency digest, active vote slot, persistent attempt/queue controls, per-process admission limits, simulation, bounded gas/balance/budget checks, separate signer enforcement, deterministic signed hash persistence before broadcast, one unresolved sender transaction and receipt/reorg reconciliation. Four additive Prisma models preserve request history and actual receipt costs. No new runtime dependency or second lockfile was introduced.

The frontend defaults to gasless when the backend enables it and retains Direct Voting. It reviews the candidate, obtains nonce/deadline, requests only typed-data signing, reports processing/failure/confirmation, preserves request IDs and intent digests for reload/lost-response recovery, and updates the surrounding results after confirmation. Wallet/mode/election changes during signing cannot silently change the submitted intent.

Implementation details: [architecture and API](../architecture/gasless-voting.md), [ADR 0008](../architecture/adr/0008-gasless-signed-intents.md), [deployment/environment](../deployment/gasless.md), [threat model](../security/threat-model.md).

## Verification environment and commands

Windows 10.0.26200, Intel i5-12400F, Node 24.21.0/npm 11.19.0 from the verified repository-local runtime. Pinned solc 0.8.37, optimizer 200. MVP 1 targets Paris; the installed OpenZeppelin cryptography's MCOPY requires Cancun for MVP 2. This compiler-target difference is recorded as a benchmark confounder. Upstream ECDSA emits warnings about a future reserved identifier; compilation succeeds. No package versions changed.

| Command/check | Observed result |
| --- | --- |
| `npm.cmd run build:contracts` | Exit 0; both versioned artifacts/ABIs generated; MVP 1 source ABI unchanged |
| `npm.cmd run prisma:generate` | Exit 0; Prisma client generated with four added models |
| `npm.cmd run prisma:validate` | Exit 0; schema valid offline |
| `node scripts/prisma.mjs migrate diff --from-schema .tools/mvp1-schema.prisma --to-schema services/api/prisma/schema.prisma --script --output services/api/prisma/migrations/202610120001_gasless/migration.sql` | Exit 0; additive SQL generated offline, not applied |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0; API/shared/tests and web |
| `npm.cmd run build` | Exit 0; contracts, Prisma, NestJS and Next static export |
| `npm.cmd run test:unit` | 7 passed; canonical input, configuration and baseline security tests |
| `npm.cmd run test:contracts` | 10 passed on real EVM; 5 baseline and 5 sponsored authorization scenarios |
| `npm.cmd run test:integration` | 12 passed on real EVM with memory persistence; 2 managed-database tests skipped |
| `npm.cmd run test:e2e` | 3 passed; gasless flow and existing direct/admin regression |
| `npm.cmd run benchmark:mvp2` | Paired 10/100/1000 experiments; raw attempts, source snapshots, fees and comparison in the [benchmark report](../benchmarks/mvp-2-gasless.md) |
| `node scripts/verify-gasless-benchmark.mjs benchmarks/results/mvp2-paired-c173a3fe-bb01-467a-a741-dc6b1bed743c` | Exit 0; six workloads verified against source/raw/logical hashes, counts, gas/fee sums and payer attribution |
| Local deploy-script smoke | New GaslessVoting bytecode and owner checked; [public record](../../deployments/mvp2/local-smoke.json) |
| `npm.cmd run db:check` | Exit 1 through npm; BLOCKED: DATABASE_URL absent, no connection performed |
| `npm.cmd run db:migrate:status` | Exit 1 through npm; BLOCKED: MIGRATION_DATABASE_URL absent, no remote inspection performed |
| `git diff --check`, tracked/untracked whitespace and Markdown local-link inspection | Exit 0; 231 project/artifact files inspected at this check |
| `git diff --quiet HEAD -- packages/contracts/contracts/BasicVoting.sol packages/contracts/src/abi.ts deployments/31337.json deployments/local-smoke.json benchmarks/results/mvp1-*` | Exit 0; historical MVP 1 inputs/evidence preserved |

Initial sandbox EVM startup and tsx database checks failed in the Windows restricted runtime (`uv_os_get_passwd`); authorized normal Windows execution passed local EVM/browser checks. The initial MVP 2 Paris compile failed on MCOPY, then the versioned Cancun target passed. An initial Windows UTF-8 BOM in the offline old-schema snapshot was removed before migration diff passed. A newly added negative test exposed BigInt conversion before canonical validation; piped Zod validation fixed it, and the complete unit suite passed. No failed test or blocked service is represented as passing evidence.

## End-to-end evidence

The Playwright fixture runs actual NestJS handlers, EIP-712 signatures and Hardhat transactions. An unlocked injected provider stands in for MetaMask; the database is an explicit memory double. One separate simulated API 503 exercises UI error recovery. These are not real MetaMask extension or Supabase tests.

An administrator configures candidate commitments and two eligible wallets. Both voters start/end at zero native balance. Signature rejection leaves hasVoted false; sponsorship failure displays a recoverable error. The valid flow sends zero voter `eth_sendTransaction` requests, accepts two signed votes, recovers pending status after reload, and displays two accepted votes. Canonical receipts identify the funded relayer; its balance decrease equals the sum of both receipt fees. Duplicate clicks are disabled and contract/API suites enforce duplicate rejection independently of UI.

Contract tests cover typed digest agreement, inactive/closed elections, all signed-field mutations, malformed/wrong signer signatures, wrong chain/contract domain, ineligible voter, expired deadline, wrong nonce, candidate overflow, manifest mismatch, replay, concurrent duplicate transactions, exact voter event attribution, counts, independent elections and direct/sponsored uniqueness.

API tests cover malformed and unauthorized admission, concurrent idempotency and sender nonce sequencing, actual fee attribution, signature/raw-byte purge, low balance/gas/budget limits, admin-key reuse, RPC uncertainty with a fresh worker object, failed persistence before broadcast, mined revert without a new retry, pending state, reorg demotion and rate limits. The memory transaction harness does not verify PostgreSQL locking or durability across OS/database failures.

## Acceptance matrix

| Gate | State / evidence |
| --- | --- |
| MVP 1 remains reproducible | Local pass; original source/ABI/evidence retained and regression suites pass |
| EIP-712 signing, independent contract checks, no voter native balance | Local pass; contract/API/browser suites |
| Actual NestJS sponsored transactions and fees | Local pass; real receipts, transaction sender and both account balances |
| Mutation, replay, expiry, wrong domain and duplicate rejection | Local pass; contract and API negative/concurrent tests |
| Relayer cannot change candidate without invalidating authorization | Local pass under ECDSA/client/chain assumptions; field mutation tests |
| Persistence implementation, history, idempotency and cost accounting | Implemented; memory orchestration verified; live SQL gate remains open |
| Supabase actually records metadata/costs with reviewed grants | **Pending**; credentials/migration unavailable |
| UI real status, pending/reverted failures and refresh recovery | Local pass with injected provider; real MetaMask **pending** |
| Relevant automated tests | Local pass; managed tests explicitly skipped |
| Benchmarks and comparison | Observed local artifacts recorded; not public-chain capacity or human signing latency |
| Security limitations and operating procedure | Documented in architecture/threat model/deployment guide |

## Remaining gates and limits

1. Securely configure the existing Supabase project; review/apply the additive migration and least-privilege grants. Verify actual TLS/pooling, request and cost persistence, unique constraints, rollback, concurrent sender locks, process restart and migration status. The rollback-only write test is separately opt-in with TEST_DATABASE_WRITES=true. No destructive operation is authorized.
2. Run the documented flow with the real MetaMask extension and actual backend/database. Confirm network/typed-data display, account changes, zero voter funding, two accepted receipts and pending reload recovery.
3. Run repeated controlled benchmarks from an approved revision before thesis-quality performance claims. These experiments are single runs on an uncontrolled workstation, with memory persistence and local automining. Public testnet RPC/funding/approval are not configured or exercised; no public testnet deployment is claimed.
4. Operational limits: one unresolved sender transaction, conservative reservations without refund, no automatic fee bump/replacement/cancellation, operator recovery after an expired unresolved transaction or deep reorg after raw-byte purge, per-process admission rate buckets and no public ingress protection. Managed DB/OS crash recovery and multi-process contention are not established by the memory harness.

Gasless shifts fees to the sponsor; it does not eliminate network gas or hide choices. The administrator and RPC remain trusted for their declared roles, and the relayer can censor or delay. No production election, anonymous authorization, encryption, coercion resistance or receipt-freeness is claimed. **Stop after MVP 2; do not tag while these acceptance gates remain open.**

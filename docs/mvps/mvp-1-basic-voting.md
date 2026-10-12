# MVP 1: Basic blockchain voting

Status: authorized and implemented locally; acceptance remains incomplete. Current evidence is in [mvp-1.md](mvp-1.md); this document preserves the original acceptance plan. No tag created.

## Objective and scope

Establish the functional public-wallet baseline: create/configure elections, manage candidates and synthetic wallet eligibility, connect MetaMask, cast one vote, enforce lifecycle, display verifiable status/results, and collect gas/latency/outcomes. All voter identities/ballots are synthetic. Choices and voter wallet addresses are public. The owner's personal development wallet is selected separately for testnet deployment and administrative operations; local automated tests use disposable accounts.

Exclude relaying, anonymous credentials, encryption/ZK, real identity integration, trustee tally, AI, public hosting and L2 work. A simple event reconciliation path is necessary; a full audit platform is deferred.

## Dependencies and entry decisions

Resolve D01-D05 from the [decision register](../research/open-decisions.md). Use the [technology gate](../architecture/technology-stack.md) to select exact versions; upgrade from local Node 20 to reviewed Node 24, resolve package-manager execution, and configure Supabase PostgreSQL and local chain infrastructure. Recheck the announced Next.js security update before pinning. No package installation was done during initialization.

## Modules and architecture changes

| Files/modules to create | Responsibility |
| --- | --- |
| Root workspace manifest/lockfile and package configs | Exact toolchain pins, shared strictness, real build/test scripts |
| `packages/voting-core` | Single-choice rules, lifecycle states, error codes and domain values |
| `packages/shared-types` | Validated DTOs and chain/status representations |
| `packages/contracts` | Immutable election implementation, roles, frozen candidates/allowlist, spent-wallet enforcement and events |
| `services/api` | Draft administration, authenticated admin actions, metadata/read projection, reconciliation |
| `apps/voter-web` | Admin/voter routes, MetaMask integration, candidate selection/confirmation, status/results |
| Supabase setup, CI and test fixtures | Managed PostgreSQL, isolated local EVM and reproducible checks |
| `benchmarks/scenarios`, `results`, `reports` | Baseline driver, receipt collector and analysis |

Contract authorization is independent of API role checks. Freeze metadata and eligibility before the window starts. Do not create later milestone services. Derive counts and final status from canonical contract state/events.

## Implementation sequence

1. Lock and smoke-test the runtime/framework/compiler/toolbox matrix; add strict build/lint/typecheck/test scripts and minimal CI.
2. Specify exact lifecycle transitions, admin/cancellation roles, time boundaries, candidate IDs and frozen-manifest behavior. Define API schemas before UI integration.
3. Implement and test contract invariants with actual local EVM transactions, including concurrent duplicate attempts and unauthorized administration.
4. Implement API/database migrations and chain reconciliation with block checkpoints and provisional versus final status.
5. Implement admin and voter flows with clear synthetic/public-ballot notice, wrong-network handling, pending/retry behavior and accessible confirmation.
6. Run the local synthetic demonstration/benchmark, then a testnet demonstration using the owner's development wallet for deployment/admin and separate synthetic voter accounts. Load signing secrets from secure environment configuration; record only public chain/deployment metadata. Testnet selection/configuration belongs to authorized MVP 1 work; do not deploy during this architecture update.

## Acceptance criteria and testing strategy

Current observed statuses are recorded in [MVP 1 evidence](mvp-1.md).

| ID | Criterion | Verification |
| --- | --- | --- |
| M1-A1 | Only an authorized admin configures a valid election; frozen settings cannot change | Contract role/post-freeze tests; API role/input tests; T07 |
| M1-A2 | Only authorized wallets can submit valid candidate selections in the voting window | Direct contract negative tests, candidate bounds, exact start/end tests; T01 |
| M1-A3 | At most one accepted vote per wallet per election, including concurrent attempts | Multi-transaction race/property tests; rejected transaction leaves state unchanged; T02 |
| M1-A4 | Votes, events, spent count and final candidate totals reconcile | Receipt/event/state cross-check, multi-election isolation, zero-vote and cancelled cases |
| M1-A5 | Full create-authorize-connect-vote-close-result workflow works | E2E with disposable wallets, rejected signature and wrong-network cases |
| M1-A6 | UI/API distinguish pending, failed and chain-confirmed states | RPC timeout/replacement/reorg/reconciliation integration tests; T18 |
| M1-A7 | Baseline metrics and reproducibility metadata are recorded | Raw receipt reconciliation, repeatable scenario/analysis, measurement schema validation |
| M1-A8 | Privacy/security limitations and required checks are documented | Public-choice notice, synthetic data inspection, lint/typecheck/build and applicable test reports |
| M1-A9 | Owner-controlled testnet admin is separate from synthetic voters; signing secrets stay private | Testnet role/chain and unauthorized-admin tests, secure environment/redaction checks; no key/seed in fixtures/Git/logs; T23 |

Unit tests cover domain transitions/validation; contract tests cover critical invariants; integration tests cover database/projection failure recovery; E2E tests cover the actual user workflow. Add meaningful negative input and secret/log checks rather than only snapshots.

## Benchmark requirements

Before voting code, an optional labeled RPC/no-op control measures harness overhead; there is no previous functional voting implementation. After implementation, establish the baseline across planned voter/candidate/concurrency levels. Record setup/authorization/vote/close gas separately, actual execution fee, inclusion/confirmation and available finality latency, canonical throughput, failures/retries and environment metadata. Use repeated runs; local simulated finality must be labeled. No cost or capacity target is assumed achieved.

## Risks and migration considerations

Wallet eligibility does not establish unique humans; an admin can authorize many wallets. Public choices expose preference. Contract bugs, admin key compromise and reorgs remain risks. Mitigate/test T01/T02/T07/T18/T19/T22. A shared spent-wallet guard and versioned authorization/submission ports ease MVP 2, but do not implement its adapter now. Preserve this public baseline when later protocols change and never migrate real identity data into public fixtures.

## Implementation summary

Implemented locally. See [current implementation and evidence](mvp-1.md).

## Test evidence

Commands are implemented and run results are recorded in [MVP 1 evidence](mvp-1.md). Managed database acceptance remains blocked by missing credentials.

## Benchmark results

Exploratory local EVM runs exist for 10/100/1000 voters; see [baseline report](../benchmarks/mvp-1-baseline.md).

## Known limitations

Personal-wallet administration is development-only centralized trust. Baseline is intentionally not anonymous or encrypted; no public-election certification. Architecture/toolchain compatibility is proposed, not smoke-tested.

## Git revision or tag

Implementation revision: none. Tag: not created. The repository had no commits at initialization.

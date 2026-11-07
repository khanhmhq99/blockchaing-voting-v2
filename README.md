# Blockchain Voting: MACI thesis prototype

This repository's active application is a synthetic, walletless MACI v3 voting prototype for an HCMUT Master's thesis. It uses a Next.js desktop voter/admin interface, a NestJS API, an authorized Supabase PostgreSQL `voting` schema, sponsored on-chain registration and encrypted message submission, and a separate coordinator that produces processing and tally proofs. The chain and proofs determine the accepted tally; database records are projections and published evidence.

The local application integration completed with two synthetic voters and a verified `[1,1,0]` tally. A separate synthetic BSC Testnet chain-97 election then completed registration, encrypted voting, genuine processing/tally proofs, public audit and an independent verifier `PASS` with the same aggregate tally. See [the BSC evidence](docs/mvp3/maci/BSC_DEPLOYMENT_READINESS_2026-11-02.md#verified-synthetic-e2e-result), [MACI progress](docs/mvp3/maci/PROGRESS.md), [implementation plan](docs/mvp3/maci/IMPLEMENTATION_PLAN.md), [benchmarks](docs/mvp3/maci/BENCHMARKS.md) and [architecture decision](docs/architecture/adr/0010-maci-mvp3-protocol-migration.md). Independent trusted-setup ceremony provenance remains a documented research limitation.

The current [dashboard and browser workflow continuation](docs/enhancements/maci-dashboard-automation/IMPLEMENTATION.md) documents the Admin/Voter routes and automatic registration/join prerequisites. [Local MACI credentials](docs/mvp3/maci/LOCAL_CREDENTIALS.md) documents browser persistence and recovery limits.

The revised academic MVP 3 scope is tracked in [progress](docs/mvp3/PROGRESS.md), [ADR 0011](docs/architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md), [final report](docs/mvp3/FINAL_REPORT.md) and [MVP 4 handoff](docs/mvp4/HANDOFF_FROM_MVP3.md). An isolated [Semaphore + MACI local research PoC](research/mvp3/semaphore-maci/README.md) verified a synthetic tally without changing the main voting protocol. Operator linkability and coordinator visibility are disclosed research limitations. Current local synthetic functional and finality/failure acceptance passed with documented limits. MVP 3 is complete for the academic research scope and MVP 4 is ready to start; neither status approves public deployment or real-electorate use.

The explicitly authorized local academic [MVP 4 acceptance](docs/mvp4/PROGRESS.md) is complete. A matched synthetic Hardhat/PostgreSQL election produced genuine MACI processing/tally proofs, a pre-election candidate anchor and an independent [standalone verifier](docs/mvp4/PUBLIC_VERIFICATION.md) `PASS` with exit 0 using publicly downloaded original evidence and configuration. Negative checks, authenticated monitoring and browser acceptance passed. The broader public deployment/indexer/mirror roadmap remains future work. The historic MVP 3 candidate order has no pre-election commitment and remains `UNSUPPORTED` for full candidate-mapped verification. See the [acceptance report](docs/mvp4/FINAL_REPORT.md) for exact evidence and limits. MVP 5 implementation has not started.

MVP 1/2/2.5 results remain in `docs/mvps/`, `docs/benchmarks/`, prior deployment records and `research/legacy-mvp1-mvp2/` for thesis comparison. Their code is no longer part of the active build.

## Active source

- `apps/voter-web/`: browser-local MACI credential, joining proof, encrypted command and final results; no voter wallet is required.
- `services/api/`: account sessions, eligibility, MACI registration and anonymous join/message relays, audit verification/publication.
- `services/api/prisma/`: MACI-first schema and nine versioned migrations, applied to the separate Hardhat Local and BSC Testnet Supabase projects.
- `packages/contracts/contracts/`: sponsored MACI registration and open poll-join policy.
- `scripts/deploy-maci-local.mjs`: shared guarded synthetic deployment implementation; `scripts/deploy-maci-testnet.mjs` is the explicit chain-97 entrypoint.
- `scripts/maci-coordinator.mjs`: explicit proof generation, on-chain submission and public evidence export.

## Local checks

Use Node 24.21.0 and npm 11.19.0. On the Windows research workstation, prepend the verified repository-local Node directory to `PATH` when the system shim selects an older version. Keep database, signer and coordinator credentials in ignored environment files; never send them to the browser.

```powershell
npm.cmd run prisma:validate
npm.cmd run db:migrate:status
npm.cmd run db:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

The existing ignored `.env` selects Hardhat Local 31337. Keep it separate from the ignored `.env.bsc-testnet` and dedicated BSC database described in the [BSC Testnet deployment guide](docs/deployment/bsc-testnet.md). The MACI local launcher and exact synthetic run evidence are described in [PROGRESS.md](docs/mvp3/maci/PROGRESS.md). Do not reuse ephemeral Hardhat addresses after its process stops.

## Research limits

Use synthetic accounts and test assets only. The issuer and coordinator are trusted prototype roles; the coordinator can decrypt individual commands. MACI artifact ceremony provenance, dependency advisories and operational key separation remain research limitations. The synthetic BSC chain-97 run passed deployment and proof compatibility checks; it is not mainnet or real-electorate validation. This prototype does not claim coercion resistance, protection from a compromised client, or privacy against a colluding issuer and coordinator. See [threat model](docs/security/threat-model.md) and [artifact provenance](docs/mvp3/maci/ARTIFACT_PROVENANCE.md).

# Blockchain Voting: MACI thesis prototype

This repository's active application is a synthetic, walletless MACI v3 voting prototype for an HCMUT Master's thesis. It uses a Next.js desktop voter/admin interface, a NestJS API, an authorized Supabase PostgreSQL `voting` schema, sponsored on-chain registration and encrypted message submission, and a separate coordinator that produces processing and tally proofs. The chain and proofs determine the accepted tally; database records are projections and published evidence.

The current local application integration completed with two synthetic voters and a verified `[1,1,0]` tally. See [MACI progress and recovery](docs/mvp3/maci/PROGRESS.md), [implementation plan](docs/mvp3/maci/IMPLEMENTATION_PLAN.md), [benchmarks](docs/mvp3/maci/BENCHMARKS.md) and [architecture decision](docs/architecture/adr/0010-maci-mvp3-protocol-migration.md). BSC Testnet deployment has **not** occurred. M0 provenance and security review remain deferred and unapproved.

The revised academic MVP 3 scope is tracked in [progress](docs/mvp3/PROGRESS.md), [ADR 0011](docs/architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md), [final report](docs/mvp3/FINAL_REPORT.md) and [MVP 4 handoff](docs/mvp4/HANDOFF_FROM_MVP3.md). An isolated [Semaphore + MACI local research PoC](research/mvp3/semaphore-maci/README.md) verified a synthetic tally without changing the main voting protocol. Operator linkability and coordinator visibility are disclosed research limitations. Current local synthetic functional and finality/failure acceptance passed with documented limits. MVP 3 is complete for the academic research scope and MVP 4 is ready to start; neither status approves public deployment or real-electorate use.

MVP 1/2/2.5 results remain in `docs/mvps/`, `docs/benchmarks/`, prior deployment records and `research/legacy-mvp1-mvp2/` for thesis comparison. Their code is no longer part of the active build.

## Active source

- `apps/voter-web/`: browser credential backup/recovery, joining proof, encrypted command and final results; no voter wallet is required.
- `services/api/`: account sessions, eligibility, MACI registration and anonymous join/message relays, audit verification/publication.
- `services/api/prisma/`: clean MACI-first schema and two applied Supabase migrations.
- `packages/contracts/contracts/`: sponsored MACI registration and open poll-join policy.
- `scripts/deploy-maci-local.mjs`: explicit synthetic deployment to a persistent Hardhat chain 31337 only.
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

The existing `.env` points to BSC Testnet. Explicitly override `RPC_URL`, `MACI_RPC_URL`, `CHAIN_ID` and `NEXT_PUBLIC_MACI_RPC_URL` to 31337/loopback for local integration. The MACI local launcher and exact synthetic run evidence are described in [PROGRESS.md](docs/mvp3/maci/PROGRESS.md). Do not reuse ephemeral Hardhat addresses after its process stops.

## Research limits

Use synthetic accounts and test assets only. The issuer and coordinator are trusted prototype roles; the coordinator can decrypt individual commands. MACI artifact ceremony provenance, dependency advisories, operational key separation and BSC deployment compatibility need further review. This prototype does not claim coercion resistance, protection from a compromised client, or privacy against a colluding issuer and coordinator. See [threat model](docs/security/threat-model.md) and [artifact provenance](docs/mvp3/maci/ARTIFACT_PROVENANCE.md).

# Election self-service enhancement plan

Status: local implementation and matched synthetic acceptance completed on 2026-10-24; see [progress](PROGRESS.md) and [final report](FINAL_REPORT.md). Scope: synthetic MACI v3 elections on Hardhat 31337 only.

## Repository audit (checkpoint 0)

At the checkpoint-0 audit, the admin API imported an existing deployment after verifying policy, issuer, poll and candidate count. `scripts/deploy-maci-local.mjs` already pinned the local chain and verification keys, wrote a checkpoint and a public deployment file, and refused reuse of a run ID. `MaciEligibility` was the credential-issuance gate; the voter UI could not request that row, and the admin UI manually assigned it by username. The public verifier and audit publisher were separate and had to remain unchanged. MVP 4 had a completed matched synthetic run; its addresses do not survive a local chain reset. MVP 5 is not authorized by its handoff.

## Implementation checkpoints

1. Add `MaciDeploymentJob` and `MaciParticipationRequest` with unique idempotency and voter/election keys. Create an additive migration; do not apply it to managed Supabase without separate authorization. Use existing API authentication and a single approval transaction that creates `MaciEligibility`.
2. Run the pinned local deployment script in a server child process. Claim a durable job before any transaction, record public checkpoint/transaction evidence, verify contracts and current chain before creating the election row. On uncertain interruption, require manual reconciliation; never automatically rerun a submitted job.
3. Replace admin creation and username assignment controls with business-field creation, progress polling and request review. Keep legacy import as an advanced API for reproducibility.
4. Add voter request and approval status UI before the existing MACI credential journey. Preserve the existing cryptographic checks.
5. Derive registration/open/closed display from verified chain time, add stage counts and deployment health to monitoring. Do not infer `VERIFIED` from time.
6. Run static checks and a synthetic local end-to-end run where infrastructure is available. Record actual outcomes, including missing services, in `PROGRESS.md` and `FINAL_REPORT.md`.

## Security and compatibility

The deployment worker requires local RPC and separate server-side keys. No secrets enter job rows, output DTOs or logs. A persisted row is never sufficient to assert live contract health. The signup and approval cutoff is the poll start timestamp; backend checks the latest chain block and wall time. Existing on-chain MACI registration, join, encrypted command, proof and audit paths stay versioned. The database remains an account-side projection; candidate mapping and coordinator trust assumptions remain as in MVP 4. No live electorate or public network use is in scope.

The first local run exposed deterministic address reuse after Hardhat reset. [ADR 0012](../../architecture/adr/0012-local-chain-deployment-instances.md) adds a deployment instance marker and changes uniqueness/index keys in a second migration. This is a schema compatibility change; no managed database has been migrated.

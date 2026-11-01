# Automated MACI proofs with Admin-gated publication

This local synthetic workflow uses the existing MACI v3 coordinator and audit
verifier. The independent proof worker is a separate process. The API and web
must not receive `MACI_COORDINATOR_PRIVATE_KEY` or `MACI_PROVER_PRIVATE_KEY`.
The API deployer receives only `MACI_COORDINATOR_PUBLIC_KEY` in `macipk.` form.

## Setup

1. Review and apply `202610260001_maci_proof_jobs` using the repository's
   authorized migration process. The owner authorized this additive migration
   for the current managed Supabase project on 2026-10-26, and it was applied
   successfully there. Other environments must apply it independently.
2. Keep Hardhat Local 31337, API, and web running as described in `GUIDE.md`.
3. Start `node scripts/maci-local-env.mjs -- npm.cmd run proof:worker` in a
   separate terminal. The local wrapper supplies the existing ignored
   coordinator secret only to this worker. Do not copy its environment into
   the API or a browser build.
4. If the local chain is idle after the scheduled end, set
   `MACI_PROOF_LOCAL_AUTOMINE=true` for the worker. It calls `evm_mine` only on
   the configured loopback Hardhat chain. Otherwise mine blocks externally.

The worker accepts only elections created by the existing deployment job on
the same genesis hash. It waits for a chain block whose timestamp exceeds the
poll end, then `CHAIN_CONFIRMATIONS` on that closing block. A unique database
job per election and conditional status update prevent duplicate claims.
The coordinator runs with only its MACI key, prover EVM key, loopback RPC and
operating-system variables; database credentials are omitted from the child.
The worker checks the pinned coordinator artifacts, polls the chain, stages
`manifest.json`, `events.ndjson`, `proofs.json`, and `tally.json`, and waits
for snapshot confirmations. It invokes the unchanged audit verification
routine before setting the job to `READY`.

In Admin → election → results, `READY` exposes a publication button. The
button requires an authenticated Admin and reruns the full audit verification
on the staged files. The existing audit transaction alone changes the
election to `VERIFIED` and publishes the files. The prior four-file upload
remains an authenticated fallback and uses the same verifier. Client input
never contains a filesystem path. Public artifact URLs remain unavailable
until the election has an audit record and its snapshot passes chain checks.

## Recovery and security limits

The job records closing block/hash, genesis hash, snapshot block/hash, scope
inside the manifest, and SHA-256 integrity hashes in the manifest. The worker
rechecks chain hashes before staging and before publication. A reorg or invalid
proof holds the job in `RECONCILIATION_REQUIRED`; it never publishes. After a
worker restart, a complete coordinator checkpoint can be staged and verified
without repeating on-chain transactions. An interrupted checkpoint with an
uncertain transaction is deliberately not retried automatically. The operator
must inspect the chain and private checkpoint, then use the controlled manual
fallback or an independently reviewed recovery procedure. This preserves
transaction safety but means this prototype does not automatically resume
every partial coordinator stage. Stop the proof worker and confirm its
coordinator child has exited before using the manual fallback.

The worker still has database access for job metadata, and the coordinator
can decrypt individual encrypted commands. File-system isolation, host
permissions, process supervision and an independently provisioned coordinator
key remain operator responsibilities. Do not use the synthetic local wrapper
for a real electorate or claim receipt-freeness against the coordinator.

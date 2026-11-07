# BSC Testnet MACI deployment (chain 97)

## Status and safety gate

As of 2026-11-04, the owner-approved synthetic chain-97 research run has
completed an end-to-end MACI election on BSC Testnet. The dedicated BSC
Supabase project has nine applied migrations. Two MACI polls were deployed;
the second completed voter registration, joining, encrypted votes, genuine
processing/tally proofs, audit publication and an independent verifier
`PASS` with tally `[1,1,0]`. The ignored BSC environments have
`MACI_BSC_TESTNET_ENABLED=true`; Mainnet and public web hosting remain outside
this run. See the [verified deployment checkpoint](../mvp3/maci/BSC_DEPLOYMENT_READINESS_2026-11-02.md#verified-synthetic-e2e-result)
for receipts, addresses, measured gas and research limitations. Use
synthetic identities and test BNB only.

The BSC Testnet RPC is chain 97 (`0x61`). Never use chain 56 or mainnet credentials here. `scripts/deploy-maci-testnet.mjs` checks the configured chain, actual RPC chain, selected signer, VKey hashes and deployment output. The API records an instance UUID, genesis hash, receipts, code hashes and candidate anchor; interrupted transactions require reconciliation on their original chain. Hardhat Local remains chain 31337.

The journal and API recovery path passed crash-injection tests on Hardhat
Local, and the chain-97 run exercised confirmed-transaction recovery. The
exact [public GPLv3 web source commit](https://github.com/khanmhq99/blockchaing-voting-v2/tree/91dcfb11c0528afb67a409a720fb3f4eba30bb21)
was accessible without login and is linked from the chain-97 static build.
The selected BSC RPC is `https://bsc-testnet-rpc.publicnode.com` because
the original public BNB endpoints returned `-32005` on required log queries.

## Dedicated database

Use a separate Supabase project for BSC Testnet, with the same private `voting` schema and runtime/migration roles as the local prototype. The application currently has the schema name fixed in Prisma and migration SQL, so a separate project is simpler and safer than a second schema in the existing project. Point the BSC API and proof worker only at the BSC project's `DATABASE_URL`. Point migration commands only at that project's `MIGRATION_DATABASE_URL`. Keep the Hardhat `.env` and BSC configuration separate.

Migration `202611010001_maci_network_isolation` adds a chain ID to deployment jobs and a deployment instance ID to scan checkpoints. Existing rows default to chain 31337 and instance `legacy`. It replaces the checkpoint uniqueness index without deleting rows. Migration `202611020001_maci_runtime_schema_usage` grants the limited runtime role `USAGE` on the private schema. On 2026-11-02 all nine migrations were applied to the separate, initially empty BSC project; Prisma status and runtime `db:check` then passed. Check migration status before every future application, and never point this workflow at the Hardhat project's URL.

The two additive migrations were also applied to the separate Hardhat Local project after a verified schema backup. Its existing 17 elections and 11 chain-31337 deployment jobs remained present; local Prisma status and runtime database check passed. The backup path and hash are recorded in [PROGRESS.md](../mvp3/maci/PROGRESS.md).

## Configuration

Copy `.env.bsc-testnet.example` to ignored `.env.bsc-testnet` and fill every placeholder locally. Do not send keys or database passwords in chat. The wrapper `scripts/maci-testnet-env.mjs` reads this file and passes its values to one Node command without printing them. `CHAIN_ID=97` is mandatory. `MACI_BSC_TESTNET_ENABLED` stays `false` until the review gates above pass.

| Variable | Format and purpose |
| --- | --- |
| `RPC_URL`, `MACI_RPC_URL` | Same HTTPS BSC Testnet RPC; API and coordinator/deployer respectively. Query `eth_chainId` and require `0x61`. Credentials may remain in this server-only URL. |
| `NEXT_PUBLIC_MACI_RPC_URL` | Public HTTPS BSC Testnet RPC without credentials or query token. It is embedded in the web build and may differ from the server RPC. |
| `NEXT_PUBLIC_SOURCE_URL` | Public HTTPS URL ending in `/tree/<40-hex-commit>` for the exact web source revision. The web displays it on every page; the BSC build refuses to proceed without it when the transaction gate is enabled. |
| `DATABASE_URL` | TLS-verified runtime-role PostgreSQL URL for the dedicated BSC Supabase project. |
| `MIGRATION_DATABASE_URL` | TLS-verified direct/session migration-role URL for the same dedicated project. Never use the Hardhat project's URL. |
| `DEPLOYER_PRIVATE_KEY` | `0x` plus 64 hex digits; deploys contracts and sends the candidate anchor. Fund with test BNB. |
| `MACI_ISSUER_PRIVATE_KEY` | Separate `0x` plus 64 hex digits; signs registration authorizations. |
| `MACI_REGISTRATION_RELAYER_PRIVATE_KEY`, `MACI_JOIN_RELAYER_PRIVATE_KEY`, `MACI_RELAYER_PRIVATE_KEY` | Separate `0x` plus 64 hex digits; sponsor registration, join and encrypted-message transactions. Fund each with test BNB. |
| `MACI_PROVER_PRIVATE_KEY` | Separate `0x` plus 64 hex digits; sends proof/tally transactions. Provide only to the proof worker. Fund with test BNB. |
| `MACI_COORDINATOR_PUBLIC_KEY` | Serialized `macipk` public key for deploying the poll. |
| `MACI_COORDINATOR_PRIVATE_KEY` | Matching `macisk.` plus 64 hex digits; provide only to the proof worker. Never derive it from the deployer wallet. |
| `NEXT_PUBLIC_API_URL`, `APP_ORIGIN` | Browser-visible API origin and exact web origin for CORS. Use HTTPS when exposed remotely. |
| `MACI_BSC_TESTNET_ENABLED` | Explicit transaction gate. `false` during review; `true` only after gates pass. |
| `MACI_DEPLOYMENT_MAX_GAS_PRICE_WEI`, `MACI_DEPLOYMENT_MAX_COST_WEI` | Required BSC deployment journal limits. The current synthetic test uses 1 gwei maximum offered gas price and 0.1 tBNB maximum cumulative signed deployment cost; the candidate anchor has a separate 0.001 tBNB ceiling. Exceeding a limit stops before signing the next transaction. |

Keep the coordinator and prover secrets in a separate ignored `.env.bsc-worker` file that also supplies the worker's `CHAIN_ID`, RPC and dedicated runtime DB URL. The API startup removes those two secrets if inadvertently supplied, but separate process environments remain the intended boundary. The web launcher removes server-only keys and database URLs from the Next.js subprocess. Rebuild the static web export whenever `NEXT_PUBLIC_*` values change.

For a single synthetic experiment, set `MACI_PROOF_ELECTION_ID` to the Admin
election UUID in the ignored worker environment. The worker then creates and
reconciles proof jobs only for that election. Omit it for normal processing of
all eligible elections on the configured chain.

For the Supabase shared pooler, download the project CA certificate from Dashboard → Database Settings → SSL Configuration. Set `DATABASE_CA_PATH` in both ignored BSC env files to its local path, and add `sslrootcert=<path>` alongside `sslmode=verify-full` in `MIGRATION_DATABASE_URL`. The 2026-11-02 Windows preflight used ignored `.tools/supabase-prod-ca-2021.crt`; copy or download the certificate and adjust paths when moving to another host. Do not turn off certificate verification to address `SELF_SIGNED_CERT_IN_CHAIN`.

After creating both ignored env files with coordinator placeholders, run `node scripts/generate-maci-coordinator-testnet.mjs` once for each new synthetic poll. It generates a fresh MACI v3 keypair, writes the public key to `.env.bsc-testnet` and the matching private key to `.env.bsc-worker`, and prints neither value. Run the same command with `--verify` to check that the saved pair matches without printing it. Generation refuses to overwrite configured keys. Back up the private key securely before deployment; losing it prevents the coordinator from processing that poll.

## Read-only checks and commands

Run from the repository root with the pinned local Node 24.21.0. In PowerShell, define a task-specific variable for the executable:

```powershell
$maciNode = Resolve-Path .\.tools\node-v24.21.0-win-x64\node.exe
& $maciNode scripts/maci-testnet-env.mjs scripts/prisma.mjs validate
& $maciNode scripts/maci-testnet-env.mjs scripts/prisma.mjs migrate status
& $maciNode scripts/maci-testnet-env.mjs scripts/web.mjs build
& $maciNode scripts/maci-testnet-env.mjs scripts/preflight-maci-bsc-signers.mjs
& $maciNode scripts/maci-testnet-env.mjs --import tsx scripts/preflight-maci-bsc-db.ts
```

Before a migration, confirm both database URLs resolve to the intended *dedicated* project, inspect pending SQL and take a backup. Apply migrations only to that project after this review. Do not run `reset` or `db push`:

```powershell
& $maciNode scripts/maci-testnet-env.mjs scripts/prisma.mjs migrate deploy
```

After all testnet gates pass, set `MACI_BSC_TESTNET_ENABLED=true` in the BSC API/deployer environment. Start the API and create a synthetic election through the authenticated Admin UI. The API then invokes the guarded testnet deployer, anchors candidate ordering before poll start, validates receipts and code, and stores its deployment job. Use a start time with enough lead for multiple testnet confirmations. Start the separate proof worker with its own secret environment after the poll is available:

```powershell
& $maciNode scripts/maci-testnet-env.mjs --import tsx services/api/src/main.ts
$env:MACI_ENV_FILE = '.env.bsc-worker'
& $maciNode scripts/maci-testnet-env.mjs --import tsx services/api/src/maci/proof-worker-main.ts
```

Run the web build in a separate terminal using `.env.bsc-testnet`; serve `apps/voter-web/out` with its generated `_headers` CSP or equivalent response headers. The API origin and browser RPC must be reachable from the user's browser. The worker must use the same chain 97 and BSC database as the API; it never shares the web environment. Review `research/mvp3/maci/probe-output/deployments/<runId>/` checkpoints and `deployment.json` after creation. If a transaction or process is interrupted, compare its recorded hash, nonce, receipt and block hash on chain 97 before attempting any new deployment. Do not replay an uncertain transaction on another chain.

For an explicit standalone deployment after the gates pass, prepare a synthetic JSON poll configuration with `runId`, `chainId: 97`, `title`, `candidates`, and future `startTimestamp`/`endTimestamp`, then run:

```powershell
& $maciNode scripts/maci-testnet-env.mjs scripts/deploy-maci-testnet.mjs .\synthetic-poll-config.json
```

This standalone command records public deployment evidence but does not create the Admin API election row. Prefer the Admin flow for an application end-to-end test. The proof worker stages four public files; an Admin must approve publication after audit verification. An on-chain encrypted message alone is not a counted vote.

## Returning to Hardhat Local

Stop the BSC API and worker. Start the existing Hardhat chain and launch the local API/web with the original ignored `.env` or `scripts/maci-local-env.mjs`. Keep local and BSC server processes, database URLs, and signing keys separate. If the Hardhat chain was restarted, create a new local deployment instance; old local addresses and pending jobs are historical and must be reconciled against the original chain before reuse. Never copy chain-97 rows into the local DB or change their chain IDs.

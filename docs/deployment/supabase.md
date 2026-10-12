# MVP 1 setup and deployment

## Runtime and installation

Use Node 24.21.0 and npm 11.19.0. Run all commands from the repository root. On the inspected Windows workstation the verified portable runtime is available without changing system PATH permanently:

```powershell
$env:PATH = "$PWD\.tools\node-v24.21.0-win-x64;$env:PATH"
npm.cmd ci
npm.cmd run prisma:generate
```

On a fresh machine install the same official Node release and verify its checksum. `.tools` is ignored and is not a distributable runtime. Use `npm.cmd` on Windows; do not change PowerShell execution policy. In the restricted Codex sandbox, tsx/Hardhat may fail with `uv_os_get_passwd ENOMEM`; these checks passed in the authorized normal Windows process environment.

Copy `.env.example` to a local ignored `.env`. Never paste secrets into Git, browser configuration, screenshots or shared logs. The API and deployment scripts load root `.env`. The web launcher forwards only `NEXT_PUBLIC_API_URL` as a public setting; Next.js does not export database variables. Use separate deployment-job credentials so the running API does not inherit a deployer private key.

## Existing Supabase project

Reuse the owner's existing project if available. No configured project/connection strings were found during implementation. In Supabase's Connect panel copy the project-specific PostgreSQL strings into the local environment. Do not invent a project hostname.

| Setting | Purpose |
| --- | --- |
| `DATABASE_URL` | Runtime login; direct or session connection for a persistent NestJS process |
| `MIGRATION_DATABASE_URL` | Separate migration login, direct IPv6 or session port 5432; never transaction port 6543 |
| `DATABASE_POOL_MODE` | `session` by default; `transaction` only when the deployment uses that endpoint |
| `DATABASE_POOL_MAX` | Initially 5 per process; use 1–2 for small serverless instances and budget across all replicas |
| `DATABASE_CONNECT_TIMEOUT_MS`, `DATABASE_IDLE_TIMEOUT_MS` | Bounded connection establishment and idle lifetime |
| `DATABASE_CA_PATH` | Optional trusted Supabase CA file for the runtime; certificate checking remains enabled |

Runtime TLS uses `rejectUnauthorized: true` and strips URL SSL flags that could override that policy. Set `sslmode=verify-full` in the migration connection string, with `sslrootcert` referencing the trusted provider certificate where required. URL-encode password characters. For IPv4-only hosts use the Supavisor **session** endpoint for migrations; direct connections can require IPv6. Never fix TLS failures by disabling verification. See the [official connection guide](https://supabase.com/docs/guides/database/connecting-to-postgres).

Use a migration role owning the private schema and a separate runtime login. Provision role passwords through the provider's secure administration procedure, not a committed SQL file. The migration creates `voting`, tables and indexes; it does not modify `public` or remove existing tables. Review the SQL and confirm there is no existing conflicting `voting` schema before applying it. An existing database may need a reviewed baseline migration; do not use reset or `db push`.

After applying the schema, grant the runtime role `CONNECT` to the database, `USAGE` on `voting`, and `SELECT, INSERT, UPDATE, DELETE` on its tables. Configure the migration owner's default privileges for future tables. Do not grant `CREATE`, ownership, superuser or bypass-RLS privileges to the runtime role. Keep `voting` out of Supabase's exposed Data API schemas; do not grant `anon`/`authenticated` access. Schema ACLs are the access boundary here; no Supabase Auth/JWT integration is present. Review actual grants in the configured project.

```powershell
npm.cmd run prisma:validate
npm.cmd run db:migrate:status
# After reviewing the additive SQL against the actual project's existing schema:
npm.cmd run db:migrate:deploy
npm.cmd run db:check
```

`db:check` opens the real Prisma adapter connection, executes `SELECT 1` and reads the metadata table. Missing credentials produce `BLOCKED` and a nonzero exit, not a simulated pass. `db:migrate:status` is read-only. No managed migration was applied during implementation. Offline validation/generation uses a nonconnecting dummy datasource; this is not a local PostgreSQL service.

For future schema changes generate a reviewed migration using `prisma migrate diff` against a known prior schema or a dedicated disposable development database. Commit SQL and the updated schema together. Never regenerate an initial migration after it has been applied. The wrapper blocks `reset`, `dev` and `push` to prevent accidental destructive shared-database workflows.

## Local blockchain and launch

In terminal 1:

```powershell
npm.cmd run chain
```

This is a disposable Hardhat chain on loopback, chain ID 31337, RPC `http://127.0.0.1:8545`. It resets on restart. Hardhat lists **public development keys**: these are unsafe for real funds and must never be reused on public networks or committed. The automated test harness suppresses that output.

In terminal 2, set `RPC_URL` and `CHAIN_ID=31337` in local `.env`, then:

```powershell
npm.cmd run deploy
```

Copy the resulting public address and deployment block into `VOTING_CONTRACT_ADDRESS` and `DEPLOYMENT_BLOCK`. The deployment record is `deployments/31337.json`. Set `CHAIN_CONFIRMATIONS=1` locally because the automining chain may not produce extra blocks while idle. Use an appropriate greater depth on a public testnet; depth is not settlement finality.

Start the API after Supabase migrations/role grants are ready:

```powershell
npm.cmd run dev:api
```

In terminal 3:

```powershell
npm.cmd run dev:web
```

Open `http://localhost:3000`. `APP_ORIGIN` must match the web origin. The API binds loopback by default; containers may set `API_HOST=0.0.0.0` behind authenticated infrastructure/HTTPS and restrictive network ingress. `NEXT_PUBLIC_API_URL` is a build-time public origin; rebuild the static export when it changes. Build with `npm.cmd run build`; the API entry is `dist/services/api/src/main.js`, frontend assets are `apps/voter-web/out`.

## MetaMask and workflow

`CHAIN_EXPLORER_URL` optionally supplies a public HTTPS explorer base URL. Leave it empty on the local chain. Transaction links are constructed from the confirmed/submitted hash; never place a credentialed provider URL in this setting.

Create a dedicated browser profile for synthetic experiments. Add the local network (31337, loopback RPC, test ETH). Use the first Hardhat development account as local admin and separate disposable accounts as synthetic voters. Do not import the owner's funded wallet into automated tests. Account or network changes reset the selected election and require reconnection.

Admin: connect the owner wallet, enter title/description/candidate names and future start/end dates, create the election, approve candidate registration, then sign the metadata authorization challenge. These are distinct operations, not an atomic chain/database transaction. If saving fails, keep the same form values and election ID and use **Lưu lại thông tin**; it resumes missing candidate registration and validates the manifest before saving. Authorize synthetic voter addresses in batches of at most 200. Freeze before the start. The contract will open and close by chain time. Finalize after the end. Cancellation publishes a reason hash and is terminal.

Voter: connect a separately authorized synthetic wallet, select an election, review candidates, select one choice, review wallet/network/estimated gas and confirm in MetaMask. Inspect the transaction hash/receipt, reload status and check results. A wallet has at most one accepted vote per election. Votes are public. A receipt timeout does not prove failure: retain the hash and inspect the chain before retrying. Replacement transactions are checked against sender, destination and calldata before the UI reports success.

Optional `npm.cmd run seed` creates a synthetic local election, candidates and three eligible accounts, starting ten chain minutes later. It writes a public manifest fixture to `deployments/seed-<id>.json`; use those exact form values and election ID to save metadata through the signed admin action. It does not seed Supabase with invented credentials.

The deploy script also supports Sepolia chain 11155111 when the owner explicitly configures RPC, chain ID and securely injects `DEPLOYER_PRIVATE_KEY`. No testnet deployment was performed. All other public networks, including mainnet, are rejected. Never store a production secret in the repository.

## Verification and boundaries

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
node node_modules/@playwright/test/cli.js install chromium
npm.cmd run test:e2e
npm.cmd run benchmark:mvp1
```

Test/benchmark runners launch isolated local EVM ports 18545–18548. Browser tests use ports 3100/3101 and an explicit in-memory database fixture; these fixture servers are not production launch modes. Browser tests simulate the injected wallet transport against actual chain transactions. A real MetaMask extension and live Supabase still require the separate manual acceptance exercise. See [evidence](../mvps/mvp-1.md).

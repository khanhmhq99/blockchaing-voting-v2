# MVP 2 deployment and operation

Use [Supabase setup](supabase.md) for the existing database, verified TLS, private schema and least-privilege roles. MVP 2 only adds tables; it does not recreate MVP 1 data. No managed migration has been executed in this implementation session.

## Configuration

Copy the variable names from `.env.example` to secure local environment configuration. Never paste secrets into chat, CLI arguments, source files or browser variables. Keep DATABASE_URL and MIGRATION_DATABASE_URL distinct. Use direct/session connectivity for migrations. Runtime Supabase access remains NestJS/Prisma only.

Set `GASLESS_ENABLED=true` only with a GaslessVoting deployment and migrated database. `RELAYER_PRIVATE_KEY` must be a dedicated server-side disposable signer, different from the contract owner. Fund only that relayer on the local chain; gasless voters should remain at zero native balance. A local chain's unlocked admin can fund the relayer using its public address, without exposing the relayer key. The benchmark/test fixtures generate their own isolated signers and never print their keys.

| Variable | Default / meaning |
| --- | --- |
| RELAYER_MAX_GAS | 250000; ceiling after integer 20% estimation margin |
| RELAYER_MAX_GAS_PRICE_WEI | 10000000000; legacy gas-price cap |
| RELAYER_BUDGET_WEI | 100000000000000000; conservative lifetime fee reservation |
| RELAYER_MIN_BALANCE_WEI | 1000000000000000; balance floor after the next maximum charge |
| RELAYER_MAX_DEADLINE_SECONDS | 600; admission bound relative to latest block |
| RELAYER_QUEUE_LIMIT | 100; queued and unresolved requests |
| RELAYER_RATE_PER_MINUTE | 60; per-process admission work |
| RELAYER_VOTER_ATTEMPTS | 5; persistent attempts per voter/election and per-minute admission bucket |
| RELAYER_PENDING_TIMEOUT_MS | 120000; uncertainty warning, never automatic failure |

Budget reservations persist over restarts. Do not clear them to hide costs. Use a fresh signer for a fresh deployment because the sender lane is permanently bound to its original contract. A local chain reset also requires a separate experimental environment/database namespace or reviewed reconciliation; old nonce reservations must not be silently discarded.

## Commands

From PowerShell in the repository, use the verified portable runtime when the system version differs:

```powershell
$env:PATH = "$PWD\.tools\node-v24.21.0-win-x64;$env:PATH"
npm.cmd run prisma:generate
npm.cmd run build
npm.cmd run chain
```

In a second terminal, configure RPC_URL for the local chain and run:

```powershell
npm.cmd run deploy:mvp2
```

This script accepts chain 31337 on loopback, or explicitly configured `CHAIN_ID=97` with an HTTPS BSC Testnet RPC, and writes a unique public record under `deployments/mvp2/`. It never overwrites MVP 1's deployment records. Set VOTING_CONTRACT_ADDRESS and DEPLOYMENT_BLOCK explicitly from that output; set CHAIN_ID=31337 and CHAIN_CONFIRMATIONS=1 for automining local demos. A confirmation depth above one requires additional blocks after the vote. Keep previous deployment configuration separately.

For the owner-authorized BSC Testnet deployment, configure `DEPLOYER_PRIVATE_KEY` securely and fund its public address with test BNB. The relayer must be a separate signer. The script estimates constructor gas with a 20% integer margin, caps gas price at 10 gwei and maximum deployment fee at 0.01 test BNB, and waits for two confirmations. It checks code presence, owner, EIP-712 domain and canonical receipt block. It journals the signed transaction's public hash before broadcasting; reruns reconcile that hash instead of deploying again. If broadcast is uncertain or the transaction cannot be found, investigate the public hash and sender nonce; never delete the journal blindly. No private key or signed raw transaction is written to deployment evidence.

Review `services/api/prisma/migrations/202610120001_gasless/migration.sql` against the actual project. After configuring managed access and reviewing compatibility, use the existing additive migration procedure:

```powershell
npm.cmd run db:migrate:status
npm.cmd run db:migrate:deploy
npm.cmd run db:check
npm.cmd run dev:api
```

Start the web application in another terminal:

```powershell
npm.cmd run dev:web
```

Create a new synthetic election with the admin UI, register candidates/eligible wallets, and freeze before opening. Connect a disposable zero-balance voter to the same network. Review the candidate and sign EIP-712. Confirm the receipt's transaction sender is the dedicated relayer and the voter balance remains zero. Reject a signature once, reload a pending request once, and attempt duplicate voting. The Direct Voting selector remains available; the original BasicVoting deployment is the exact MVP 1 benchmark baseline.

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run prisma:validate
npm.cmd run test:unit
npm.cmd run test:contracts
npm.cmd run test:integration
npm.cmd run test:e2e
npm.cmd run benchmark:mvp2
```

EVM/API/browser automation uses real local transactions with an explicitly labeled memory database and injected wallet transport. It does not establish managed PostgreSQL or real MetaMask acceptance. `TEST_DATABASE_WRITES=true` separately enables the rollback-only real-database uniqueness/rollback test when DATABASE_URL is configured. Real grants, multi-process advisory locks, pool contention, failure rollback and migration compatibility remain required manual/managed checks. Never run reset, db push or destructive migrations.

The owner separately authorized BSC Testnet deployment on 2026-10-12. This does not authorize mainnet or spending real cryptocurrency. Testnet deployment alone does not establish Supabase migration, real MetaMask voting or full public-testnet application acceptance.

## BSC Testnet deployment evidence

Owner-requested deployment, 2026-10-12, chain 97:

- Contract: `0xaaa59087819d3e939b7a1d3394c29a3d71c4db50`.
- Deployment block: `136391892`.
- [Transaction receipt](https://testnet.bscscan.com/tx/0xa7bc3307509250726f9f39484163ad8f1c9828952aa2fd9f226c802b89e0ec08).
- [Public deployment record](../../deployments/mvp2/97-0xa7bc3307509250726f9f39484163ad8f1c9828952aa2fd9f226c802b89e0ec08.json) includes owner, creation/runtime code hashes, block hash, compiler and optimizer settings.
- Observed gas: 1,778,584 at 100,000,000 wei/gas; actual fee 0.0001778584 test BNB.
- Verified two confirmations, successful receipt, canonical block hash, nonempty runtime code, expected owner and EIP-712 name/version/chain/address. Constructor gas estimation and deployment succeeded with the Cancun artifact on this network. Explorer source-code verification was not performed.
- Windows, Node 24.21.0; base Git revision `e0c2ad1934ffbe38260106ce46cbcdaa7f22f982`, with uncommitted MVP 2 work. `npm.cmd run build:contracts`, `tsc.cmd --noEmit`, `eslint.cmd scripts/deploy-gasless.ts`, and `vitest.cmd run tests/contracts/gasless.test.ts` succeeded (5 contract tests). Solidity emitted existing OpenZeppelin future-keyword warnings. `node.exe --import tsx scripts/deploy-gasless.ts` exited 0.
- `.env` and `.env.example` now contain the verified public address/block. Other environment values were preserved. `GASLESS_ENABLED` remains unchanged; database migrations and end-to-end testnet voting were not performed in this deployment task.

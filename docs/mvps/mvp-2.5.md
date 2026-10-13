# MVP 2.5: Walletless account voting

Updated 2026-10-13. **Implementation is present; acceptance is incomplete.** This enhancement preserves the wallet-based MVP 1/MVP 2 comparison and does not change smart contract source, ABI or deployment.

## Delivered in source

- Username/password registration with case-insensitive unique usernames, scrypt password hashes, public registration fixed to USER, persistent opaque HttpOnly sessions and API-side ADMIN checks.
- Server-generated, random EOA voting identities, one per user and election, with encrypted private key storage using AES-256-GCM and API-only `VOTER_KEY_ENCRYPTION_KEY`.
- Admin identity assignment and owner-wallet on-chain eligibility workflow, limited to draft elections.
- Authenticated voter dashboard, discovery, eligibility/status, walletless gasless submission and account-specific request history.
- Existing signed EIP-712 relayer validates and sends the intent. The backend key, not the password, creates the on-chain signature.
- Existing wallet-based UI retained at `/mvp2-baseline`.

## Contract decision

The existing `GaslessVoting` contract has all MVP 2.5 acceptance primitives: a recoverable EIP-712 signature, election/manifest/candidate/voter/domain binding, an election-scoped nonce, election-specific eligibility and one atomic spent-voter guard shared with direct voting. MVP 2.5 reuses these checks with a backend-managed EOA per account/election. No contract modification or redeployment is necessary.

The owner wallet still authorizes eligibility on-chain. The ADMIN role alone cannot bypass this contract check. Chain authorization and vote uniqueness are enforced by the existing contract; authenticated user-to-identity mapping is enforced by the API and database unique constraints.

## Migration and verification

The additive migration is `services/api/prisma/migrations/202610130001_walletless_accounts/migration.sql`. On 2026-10-13, after explicit owner authorization, it was applied to the configured Supabase project. The migration owner granted `SELECT`, `INSERT`, `UPDATE`, and `DELETE` on the three new tables to the existing `voting_runtime` role. No demo admin seed was run on Supabase. Protect `VOTER_KEY_ENCRYPTION_KEY` in the API environment.

Observed implementation checks on Windows with repository-local Node 24.21.0 and npm 11.19.0. The working tree contains uncommitted MVP 2.5 changes; the base Git revision is `1c06dbb8432593b62da783fd8338879c6f2b8b75`.

| Check | Result |
| --- | --- |
| `npm.cmd run prisma:generate` | Exit 0 |
| `npm.cmd run prisma:validate` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run build` | Exit 0; both preserved contract versions compile; Next static export includes account, voter, admin and baseline routes |
| Automated tests | Not added or run, per scope |
| `npm.cmd run db:migrate:deploy` | Exit 0; `202610130001_walletless_accounts` applied to configured Supabase |
| `npm.cmd run db:migrate:status` and `npm.cmd run db:check` | Exit 0; schema up to date and Prisma runtime connection succeeds |
| Runtime table permissions | Three MVP 2.5 tables readable by the API role after the targeted DML grant |
| Login/CORS probe | Preflight returns 204 with origin and credentials headers; a nonexistent synthetic username returns 401 with the same headers after migration and grant |
| Browser/API runtime on migrated database | Pending |

## Trust and privacy limits

The API can cast a vote for any eligible account that has not voted. Database plus encryption-key compromise can recover keys. Account password/session theft can submit as that user. The owner can grant or withhold eligibility, and the relayer can censor or delay. On-chain address and candidate are public and the database links account to address. MVP 2.5 is not anonymous, coercion resistant, receipt free, or safe against a compromised API/client. Use synthetic users and ballots only. MVP 3 remains the anonymous ZK objective.

## Remaining acceptance gates

1. Verify key persistence/restart behavior on a disposable local or explicitly approved environment.
2. Walk through registration, login/logout, ADMIN rejection for USER, identity assignment, owner eligibility, walletless vote, duplicate/replay rejection and confirmed history without creating or running automated test suites.
3. Review key backup/rotation, account recovery, distributed rate limiting and operator incident response before any real electorate.

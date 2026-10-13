# Desktop platform implementation progress

Updated 2026-10-13. Base revision: `1c06dbb8432593b62da783fd8338879c6f2b8b75`. The working tree contains uncommitted MVP 2.5 and desktop platform work. Preserve it; source is authoritative if this document becomes stale.

## Project scope and architecture

Enhance the existing Next.js 16 static-export frontend and NestJS/Prisma/Supabase PostgreSQL API into a Vietnamese desktop SaaS dashboard with separate ADMIN and USER views, a persistent sidebar/topbar/content layout, and the existing walletless gasless vote path. Preserve MVP 1 and MVP 2 code, ABI, deployments and evidence at `/mvp2-baseline`. No mobile-specific work, new automated tests, commits or mainnet work. Use synthetic voters only.

The chain determines eligibility, accepted votes, lifecycle and counts. Election metadata is checked against on-chain hashes. AppUser role is separate from election-specific eligibility. Contract-owner actions still need the owner wallet; normal voters never connect a wallet. The API holds encrypted per-election voting keys, so MVP 2.5 remains centralized and non-anonymous. The static export uses `/elections/detail?id=...` in place of an arbitrary dynamic segment.

## Initial audit and current status

| Area | Initial state | Current state |
| --- | --- | --- |
| Authentication | Username/password, normalized unique username key, scrypt, HttpOnly session and ADMIN gate existed in MVP 2.5 | Login redirects by role; registration collects optional email/phone; profile and password change APIs/UI; ADMIN user management API/UI. Public registration always creates USER. |
| Development admin | Restricted `seed:demo-admin` script existed | Script now preserves a correctly configured local account, otherwise updates it and revokes sessions; it still refuses production and non-loopback PostgreSQL. It was not run because this environment points to Supabase. |
| Desktop layout | Separate voter/admin sidebars, no shared topbar | Shared `PortalShell` on authenticated views, with role navigation, active state, breadcrumbs, account menu and logout. |
| Admin | Draft identity assignment UI and wallet-owner baseline UI | Dashboard, election create/configure/freeze/finalize/cancel and metadata recovery, user CRUD with soft delete, bulk eligibility grant/revoke, results and activity pages. Contract owner must sign blockchain actions. |
| Voter | Dashboard/discovery/history and walletless submit | Dedicated dashboard, discovery, my elections, detail voting, history and profile views. Pending requests refresh and confirmation is not shown before relayer confirmation. |
| Data/activity | Existing account, metadata, relayer and chain projection tables | Additive `AdminActivity` table and admin account/identity entries. Indexed chain administration events appear after explicit index sync. |

## Implementation progress

- Current phase: source implementation and basic compiler/database verification complete; manual browser and on-chain acceptance pending.
- Completed: authentication and account APIs/UI, shared desktop shell, ADMIN and USER routes, walletless status handling, additive audit migration, hash-checked metadata recovery, and the checks recorded below.
- In progress: no source edit is currently open. The next operation is a manual synthetic-account walkthrough in an approved disposable election environment.
- Pending: manual browser voting and owner-wallet lifecycle verification, local demo-admin seed in a loopback database, and large-dataset API pagination if the prototype exceeds its current small research scope.
- Blocked: no disposable local PostgreSQL/chain setup is available in the current configured environment; the connected database is managed Supabase. Do not run the weak demo credential there. The walletless end-to-end gate remains unverified.

## Completed implementation and changed files

- API: `services/api/src/auth.ts` adds profile/password/admin user/activity routes, account status/session handling and recent account-specific relayer status reconciliation. `services/api/src/app.ts` and `services/api/src/relayer/errors.ts` provide Vietnamese sanitized user errors. The walletless vote response now exposes the relayer receipt fields directly.
- Database: `services/api/prisma/schema.prisma` and `services/api/prisma/migrations/202610130002_admin_activity/migration.sql` add an audit table and runtime SELECT/INSERT grant. `scripts/check-database.ts` reads the new table. The original MVP 2.5 migration is preserved.
- Web: `apps/voter-web/app/portal-shell.tsx`, `portal-data.ts`, `voter-portal.tsx`, `admin-portal.tsx`, `profile-form.tsx`, `globals.css`, authentication pages and the routes under `admin`, `dashboard`, `elections`, `my-elections`, `profile`, `voting-history`; root redirects to `/dashboard`. `not-found.tsx` is Vietnamese. All listed sidebar entries resolve to built pages.
- Local seed: `scripts/seed-demo-admin.ts` remains explicitly enabled and loopback-only. It does not print the password.
- Existing earlier uncommitted changes include `.env.example`, `README.md`, `scripts/web.mjs`, API app/main/relayer files, MVP 2.5 architecture and record, and the baseline route. Do not discard them. `apps/voter-web/next-env.d.ts` was regenerated by Next build.

## Migration and verification evidence

Environment: Windows, repository-local Node 24.21.0 and npm 11.19.0. No automated test suites were added or run. Supabase uses the configured migration connection; no data was deleted.

| Command/check | Observed result |
| --- | --- |
| `npm.cmd run prisma:generate` | Exit 0 |
| `npm.cmd run prisma:validate` | Exit 0 |
| `npm.cmd run typecheck` | Exit 0 |
| `npm.cmd run lint` | Exit 0 |
| `npm.cmd run build` | Exit 0; both contract versions and API built; Next generated all 19 static routes |
| `npm.cmd run db:migrate:status` before migration | Exit 1; only `202610130002_admin_activity` pending |
| `npm.cmd run db:migrate:deploy` | Exit 0; additive migration applied to configured Supabase on 2026-10-13 |
| `npm.cmd run db:migrate:status` afterward | Exit 0; schema up to date |
| `npm.cmd run db:check` afterward | Exit 0; runtime role connected and read `ElectionMetadata` and `AdminActivity` |
| Built NestJS API on temporary port 3002 | Started; GET `/v1/health` and `/v1/config` returned 200; unauthenticated GET `/v1/auth/me`, `/profile`, `/admin/users`, `/admin/activity` returned 401. Temporary process stopped. |
| `git diff --check` and untracked source whitespace scan | Exit 0; Next-generated `next-env.d.ts` produced only a line-ending warning |

## Remaining limits and exact next steps

1. Manual browser walkthrough is still needed with synthetic accounts and a disposable draft election: register/login, role denial, admin create/edit, owner-wallet grant, walletless vote through confirmation, history, profile, password reset and activity sync. No claim of end-to-end acceptance is made from compilation or read-only probes.
2. The local `admin/123` seed was not run because the configured database is managed Supabase; run `DEMO_ADMIN_SEED_ENABLED=true npm.cmd run seed:demo-admin` only against a non-production loopback PostgreSQL database after verifying its URL. Do not put that credential on Supabase or production.
3. `ElectionsService.list()` returns all elections with stored metadata; chain-only elections without metadata require the hash-checked recovery path and are not included in dashboard counts. Each row requires chain reads, so a larger electorate/election archive will need a paged chain projection. The admin user listing is currently unpaged at the API and should be paged for a large electorate.
4. If the owner-wallet transaction succeeds but metadata persistence fails, the admin election page now has a hash-checked recovery section. It accepts candidate names with empty biographies, matching the current create form; manifests with non-empty biographies still require the preserved `/mvp2-baseline` recovery workflow.
5. Admin blockchain activity appears only after signed index sync; the audit table does not invent earlier account actions. The current UI does not provide a completed manual on-chain transaction walkthrough.

Last safely completed action: after adding the metadata recovery UI and removing the 100-row metadata listing cap, reran `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run prisma:validate`, `npm.cmd run build`, `git diff --check`, and an untracked whitespace scan; all exited 0. No source operation is half-written. Continue by inspecting this checkpoint and Git status, then perform the manual synthetic-account walkthrough when a disposable local environment is available. Keep API secrets, real identities and keys out of logs, source and UI. Re-run only build/compiler/schema and relevant read-only checks; do not add automated tests per the owner request.

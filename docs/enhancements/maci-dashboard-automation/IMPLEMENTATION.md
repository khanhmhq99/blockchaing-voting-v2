# MACI dashboard and browser workflow continuation

Date: 2026-10-25 (Asia/Saigon). Git base: `271d9112d4e4c97c5403819c62a7203a49c655ef`. The working tree already contained the election self-service and monitor changes listed in `docs/enhancements/election-self-service/PROGRESS.md`; this continuation preserves them.

## Architecture and routes

The existing NestJS authorization, registration sponsor, anonymous join sponsor, message sponsor, receipt reconciliation, election monitor, audit service and Prisma projections remain authoritative. The browser owns the MACI private key, creates the joining proof and signs/encrypts the vote. The sponsor only submits the already prepared protocol payload. No vote is sent merely because a page opens or a prerequisite finishes.

The site uses Next.js static export. Election IDs are therefore query parameters on static routes; dynamic `[id]` pages would require knowing every election at build time. Admin routes: `/admin`, `/admin/elections`, `/admin/elections/new`, `/admin/elections/detail?id=...`, `/admin/elections/participants?id=...`, `/admin/elections/results?id=...`, plus existing user/activity/monitor/account routes. Voter routes: `/user`, `/user/elections`, `/user/elections/detail?id=...`, `/user/elections/vote?id=...`, `/user/elections/results?id=...`, `/user/history`. Legacy `/maci` and `/admin/maci` redirect to the new entry points.

The shared shell has role-specific navigation and a mobile drawer. Action toasts appear at top right and update the same loading notification to success or failure. Important state and failure messages remain inline. Vote confirmation and user deletion/password actions use dialogs. The current toast implementation is local React code; no new dependency was added.

## File inventory

Created: `apps/voter-web/app/{action-toast,admin-election-route,user-election-route,maci-credential-store,maci-status,maci-workflow}.{ts,tsx}`, the static route pages under `app/admin/elections/` and `app/user/`, `tests/maci-workflow.test.ts`, and this report. Modified: the existing MACI voter/Admin panels, shared portal shell/layout/CSS, Admin monitor and users pages, login/root and legacy entry routes, and `README.md`. No tracked file was deleted. No backend, contract, Prisma schema or migration file was changed by this continuation; the pre-existing uncommitted backend and migration work was preserved.

## Credential and workflow model

One MACI credential is generated per election in the current one-poll-per-election deployment. The browser encrypts it with Web Crypto PBKDF2-SHA256 (310,000 iterations) and AES-256-GCM, downloads a backup envelope and stores only that encrypted envelope in IndexedDB under an account/election-scoped key. It decrypts and checks the envelope before continuing. The plaintext secret stays in page memory and is dropped on page/election change or browser close. After reopening, the voter must unlock with their passphrase or import their encrypted file. Import verifies the public key against any existing registration. Browser storage is not a hardware enclave; an XSS or compromised device remains able to read an unlocked key. A downloaded file must still be retained separately by the voter, as a browser cannot prove that the file was safely retained.

The client polls election and personal authorization state. Once approval, a healthy chain, an unlocked credential and the registration window coincide, it requests issuer authorization and sponsored registration. It waits for confirmed registration, then when the poll is open it searches the chain for an existing join. If absent, it generates a joining proof in the browser and submits through the anonymous sponsor endpoint. Backend rows and receipt reconciliation keep transaction status durable. The browser pauses proof work while closed or locked; its exponential retry delay is bounded at two minutes. It does not retry a failed on-chain registration or join blindly; these require reconciliation. Join and message endpoints intentionally reject identity cookies, so the server cannot expose an account-linked ballot history. `/user/history` only shows account participation.

The Vote button requires explicit confirmation, a confirmed join, a currently open poll and credential access. The command uses the established nonce-1 replacement behavior for this single-choice MACI configuration. A pending transaction, on-chain inclusion and the verified aggregate result are shown as separate states. An included command is never labeled individually counted. Result pages show totals only after the public audit endpoint returns evidence for a verified election.

## Database and deployment

No new schema migration was needed. Existing `MaciParticipationRequest`, `MaciRegistration`, `MaciPollJoinSubmission`, `MaciEncryptedSubmission` and deployment job records already carry durable approvals, idempotency, transaction and reconciliation state. A separate account-to-anonymous-join or account-to-message table would violate the current privacy boundary. Read-only `db:migrate:status` on the configured Supabase `voting` schema found six migrations and reported up to date; `db:check` passed. No migration, deletion, public-network transaction or real-voter operation was performed in this continuation.

## Verification and limits

Repository-local Node 24.21.0/npm 11.19.0 on Windows:

- `npm.cmd run lint`: exit 0.
- `npm.cmd run typecheck`: exit 0.
- `npm.cmd run build`: exit 0; 25 static pages, contracts/API/web built. OpenZeppelin emitted its existing future-keyword warning.
- `npm.cmd run prisma:validate`: exit 0.
- `node.exe --test tests/maci-workflow.test.ts`: exit 0, two transition tests. The optional `--import tsx` invocation failed inside the restricted sandbox with `uv_os_get_passwd ENOMEM`; native Node's TypeScript support succeeded.
- `npm.cmd run db:migrate:status`: restricted attempt exit 1 with a schema-engine connection error; authorized normal Windows read-only retry exit 0, six migrations up to date.
- `npm.cmd run db:check`: normal Windows read-only execution exit 0.
- Live read-only smoke on ports 3000/3001/8545: voter vote route returned HTTP 200; `/v1/health` reported database and chain connected, `/v1/config` reported chain 31337; unauthenticated election and Admin deployment APIs each returned HTTP 401. This checks routing and authentication rejection, not an authenticated voter journey.
- A headless Admin route smoke was attempted with only existing ignored synthetic credentials; neither candidate account matched the running API session, so it exited 0 with `SKIP` and made no application data changes. This is not a browser acceptance pass.
- `git diff --check`: exit 0, with CRLF normalization warnings for previously existing Windows files and four edited UI files. The untracked-file scan found no issue in this continuation's new files; the owner's pre-existing `GUIDE.md` lacks a final newline and was preserved.

No fresh browser-to-chain-to-coordinator-to-audit election was run for this change. In particular, the new automatic recovery path and cross-tab behavior are only unit-checked and statically built. Sponsor outages, a failed join transaction, browser storage loss, setup ceremony provenance, malicious coordinator withholding, XSS, timing correlation and local-chain restart remain operational/security limits. Failed join recovery requires reconciliation; generating a second proof against a unique nullifier is intentionally not automatic. Existing synthetic end-to-end evidence in the MACI progress record predates this UI continuation and must not be reported as its runtime acceptance.

## Local setup

Use the pinned local Node and npm, configure the existing environment as in `GUIDE.md`, and run the API and web commands documented there. Start a fresh Hardhat chain and create a fresh synthetic election when using the local deployment workflow; addresses from older in-memory chains are historical. Log in as a synthetic voter, request participation, approve it as Admin, enter a backup passphrase on the election page, save the downloaded encrypted file, and keep the page open for registration and joining. Reopen the page and unlock or import the file to exercise recovery. Click Vote only after the join is confirmed; publish verified coordinator evidence to exercise the results page.

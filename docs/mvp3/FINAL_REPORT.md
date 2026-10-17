# MVP 3 academic acceptance and research report

## Revised acceptance decision, 2026-10-17

**MVP 3: COMPLETE — ACADEMIC RESEARCH SCOPE. MVP 4: READY TO START.** [ADR 0011](../architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md) accepts operator identity-to-key linkability and coordinator command visibility as disclosed academic limits. It supersedes the earlier claim below that these limitations, archived wallet routes, or public release gates automatically prevent academic completion. They remain security and deployment limitations. The main app is MACI v3; the Semaphore + MACI PoC stays independent.

The current desktop browser → NestJS → authorized Supabase `voting` schema → Hardhat 31337 → coordinator run completed with two new synthetic voters, three encrypted commands, real on-chain processing/tally proofs and verified `[0,1,1]`. The owner separately authorized new synthetic managed-data records; no migration or prior-record deletion occurred. The current HTTP audit rejected insufficient depth (409), a changed snapshot block hash (409), and unavailable RPC (503). A browser revalidation probe suppressed a displayed tally on an injected 409 and restored it after recovery. These observations support the academic local scope only; no production certification or BSC Testnet approval follows. Full run IDs, transactions, limitations and exact checks are in [MACI progress](maci/PROGRESS.md).

### Functional continuity from MVP 1/2/2.5

| Earlier user capability | Active MACI equivalent | Decision and evidence |
| --- | --- | --- |
| Admin election setup, candidates and lifecycle | Admin configures an already deployed MACI poll with candidate count/chain checks; changes `REGISTRATION` → `OPEN` → `CLOSED`; uploads verified proof evidence | Preserved by MACI APIs/UI and historical synthetic run. Contract deployment is an explicit script rather than a browser admin operation. |
| Eligibility and authorization | Admin assigns an active account; authenticated voter obtains one public-key-bound registration authorization; contract enforces ticket/signature | Preserved in MACI path; historical ineligible/changed-key/expired probes passed. |
| Username/password account and role-gated admin | Existing account/session service and `/login`, `/register`, `/admin`, `/maci` routes | Preserved in source; prior synthetic browser authentication passed. |
| Walletless sponsored vote and status | Sponsored signup, join and encrypted-message relays; public transaction status and confirmed inclusion | Preserved with different MACI command semantics. Inclusion never means counted. |
| Results and vote history | Verified aggregate results and current registration/join/message status | Aggregate result preserved; old wallet-specific per-vote history route intentionally retired. MACI encryption and updates preclude treating each command as a final counted ballot. |
| Direct wallet voting, EIP-712 gasless baseline, public per-wallet choices | Archived source/ABI/deployments and old evidence | **SUPERSEDED** for the active MACI election; do not restore a parallel protocol to claim functional continuity. Historical reproducibility is separate. |

The active app passed a fresh full workflow after the latest changes. No destructive compatibility migration was attempted.

### Current acceptance matrix

| Criterion | Status | Evidence | Notes |
| --- | --- | --- | --- |
| MACI architecture and functional continuity | PASS WITH DOCUMENTED LIMITATION | [ADR 0011](../architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md), source mapping above and current [full run](maci/PROGRESS.md) | Original wallet routes are archived; active MACI functions ran. |
| Full current synthetic lifecycle | PASS | Browser/API/Supabase/Hardhat/coordinator run `runtime_20261017_1792237207984`; `[0,1,1]` | Only new synthetic records were written with owner authorization. |
| Browser key generation, backup and recovery | PASS WITH DOCUMENTED LIMITATION | Current Chromium wrong-passphrase rejection and same-file recovery | JavaScript memory is not zeroizable; real-device and mobile recovery remain untested. |
| Eligibility, duplicate and proof negative cases | PASS WITH DOCUMENTED LIMITATION | Historical eligibility/replay/duplicate/revert probes; current nonce-revote, mutated proof and tampered upload probes | Initial nonce-2 command was included but ignored; fixed UI and verified nonce-1 update. Browser outage response was injected, while HTTP RPC outage was real. |
| Proof-dependent result and candidate/election binding | PASS WITH DOCUMENTED LIMITATION | Current poll-bound event/proof audit, on-chain verifier mutations and `[0,1,1]` result | Poll and option indices are checked; human-readable candidate-ID/order export remains a trusted application mapping for MVP 4 to bind independently. |
| Snapshot finality and outage/reorg failure | PASS WITH DOCUMENTED LIMITATION | Current HTTP 409 depth, 409 falsified snapshot hash, 503 RPC outage; local snapshot/revert service probe | The HTTP hash mismatch used an RPC proxy; snapshot/revert used an in-memory audit record. Confirmation depth is not absolute finality or independent RPC honesty. |
| Isolated Semaphore + MACI research | PASS WITH DOCUMENTED LIMITATION | [Local PoC](../../research/mvp3/semaphore-maci/README.md), exact lockfile and `[1,1,0]` run | Artifact provenance and 74 research dependency advisories remain disclosed. |
| Quality and managed DB checks | PASS | Final lint, typecheck, build, Prisma validate exit 0; prior `db:check` and `db:migrate:status` exit 0 | New synthetic records were authorized; no migration or deletion in the current run. |
| MVP 4 input handoff | PASS | [Handoff](../mvp4/HANDOFF_FROM_MVP3.md), [data contract](VERIFICATION_DATA_CONTRACT.md) | Ready to start; versioned candidate mapping and independent verifier/export belong to MVP 4. |

Academic completion is bounded by the local synthetic MACI scope in ADR 0011. Historical unpassed production, real-electorate, artifact-provenance and independent-verifier gates remain unpassed; the HTTP reorg proxy and browser response injection are explicitly simulated failure conditions.

Earlier 2026-10-17 assessment (superseded in scope by the revised acceptance decision above): **MVP 3A remained incomplete.** This historical body records the source and local synthetic evidence without declaring deployment or real-electorate security. Base Git revision: `4566b4f07a2d3653e16bca4a24c18aba675af03c`; substantial pre-existing work is uncommitted.

## 1. Executive summary

The existing MACI v3 application already has a working synthetic, walletless browser/API/Supabase/Hardhat/coordinator path with real local processing and tally proofs; [prior evidence](maci/PROGRESS.md) records `[1,1,0]`. This workstream hardened the browser credential backup boundary, clarified the web privacy and result messages, added an audit snapshot reorg/finality check, and built an isolated Semaphore-gated MACI research path. The isolated path generated genuine Semaphore proofs for synthetic MACI registrations and completed MACI encrypted voting, processing, on-chain proof submission and verified tally on local Hardhat. These results support continued research, not product migration or BSC deployment.

## 2. Actual application changes

- `apps/voter-web/app/maci-panel.tsx`: MACI secret is kept in a component ref for an active page session; the passphrase is kept in an input rather than React state and cleared after import or election change. The UI explains backup loss, browser limits, coordinator/operator visibility and the difference between inclusion and verified results.
- `apps/voter-web/app/maci-client.ts`: backup imports now bound file/JSON size, require exact fields and canonical Base64, and return a fixed failure message for decryption or credential errors. The existing AES-GCM/PBKDF2 format is unchanged.
- `services/api/src/maci/audit.ts`: publication requires confirmation depth at the snapshot; public evidence retrieval rechecks canonical snapshot hash/depth before returning a result. No managed SQL data or schema was changed.
- `scripts/maci-coordinator.mjs`: unexpected upstream exception text is not printed to stderr.

The current active application no longer includes prior MVP 1/2 live routes/contracts: they were moved to `research/legacy-mvp1-mvp2/` by pre-existing MACI-first work. Their historical source, ABIs and evidence remain. The revised continuity mapping above supersedes the earlier requirement to restore those routes verbatim; current MACI functional acceptance passed in the local synthetic run.

## 3. Privacy and trust model

MACI command encryption hides plaintext choices from public chain observers, ordinary voters and the message relay if client code and crypto libraries behave as expected. The MACI coordinator holds a key that can decrypt individual commands and can delay or withhold processing. A database reader with current runtime privileges can link authenticated registration public keys to join public keys/nullifiers. Infrastructure operators may correlate IP addresses, timestamps and sponsor transactions. No anonymity against these operators, honest identity issuance, receipt-freeness, coercion resistance or compromised-client protection is claimed. The threat model adversaries are public observers, app/database operators, privileged administrators, the coordinator and compromised endpoints; verification methods are source/SQL privilege audit, request/log inspection, local negative probes and independent future chain replay.

## 4. MACI key lifecycle

The browser generates the private MACI key and signs/encrypts commands locally. Registration transmits only its public key; join proof generation uses the private key in the browser. The backend and relayers do not receive plaintext MACI private keys through the inspected intended path. The downloadable backup encrypts the serialized key with PBKDF2-SHA256 (310,000 iterations) and AES-256-GCM; a restore check precedes registration. The key stays in JavaScript memory during the page session and is not a hardware enclave. No local/session storage is used by this path. Logout/page exit discards the page context but cannot guarantee memory zeroization. A new browser needs the backup and passphrase. A password reset does not recover the MACI credential; backup loss after registration can prevent legitimate voting or updates. Administrators cannot reconstruct the private key from the stored public key under the assumed cryptography, but can link the public identity to registration.

## 5. Identity linkability

| Link | Observer class | Evidence and residual limit |
| --- | --- | --- |
| MACI signup key, state index, join key/nullifier, sponsor and transaction timestamps | Public chain observer | `SignUp`/`PollJoined` logs are public; matching registration/join key and timing are observable. They do not by themselves reveal the application username. |
| Account/user ID to MACI signup key, ticket and registration transaction | Application database operator or privileged administrator | `MaciRegistration` is keyed by `userId` and stores public key; API runtime role can read it. |
| Signup key to join key/nullifier | Database operator, privileged administrator and public chain observer | `MaciPollJoinSubmission` stores public key/nullifier; same public key appears in registration. Separate tables alone do not provide isolation. |
| IP, HTTP metadata and request times across authorization, join and message routes | Network/application operator | Join/message routes reject cookies, but access logs and timing may correlate requests unless ingress and retention are separated. No complete ingress isolation was validated. |
| Encrypted command to plaintext choice | MACI coordinator | Coordinator key can decrypt commands. The public and relay cannot infer plaintext from ciphertext under the assumed MACI crypto; small election totals can still leak aggregate information. |
| Account ID to a particular encrypted command from public ciphertext bytes alone | Not demonstrably linkable under the tested public-only model | The published message has no account ID or plaintext choice. Timing, off-chain metadata and coordinator decryption can still create links. |
| Account to final individual plaintext vote | Not demonstrably hidden from coordinator plus colluding application operator | The operator can link registration; the coordinator can decrypt commands. Do not call this flow fully anonymous. |

## 6. Encryption and verification

The browser constructs a signed `VoteCommand`, encrypts it with a fresh ephemeral key using the frozen coordinator public key and sends only ten ciphertext field values and the ephemeral public key. The relay signs/sends the exact encoded `publishMessage` call and reconciles its receipt/event. A confirmed `INCLUDED` message is not a counted vote. The pinned MACI poll processes messages in reverse order. In this single-choice run, a later valid `nonce=1` command replaced the earlier `nonce=1` choice; an included `nonce=2` command was ignored. The processing circuit determines the final valid command. The coordinator generates processing/tally proofs, and local contracts verify submitted proofs. The application audit additionally compares full chain event sets and proof transactions, on-chain verifying keys, commitments and final tally before marking `VERIFIED`; it is still not a separate public verifier. The new snapshot check prevents the audit endpoint from serving a tally after a detectable snapshot reorg. It does not establish absolute finality or independent RPC honesty.

## 7. Desktop UX

The voter page now explains key recovery, browser limits, encryption before submission, coordinator/operator privacy limits and proof-dependent result status. It displays results only when the published audit payload is available; a stored `VERIFIED` status alone does not render tally numbers. The existing design system and desktop layout were retained. No mobile acceptance was attempted.

## 8. MVP 3B experimental findings

The isolated [`SemaphoreMaciRegistration`](../../research/mvp3/semaphore-maci/SemaphoreMaciRegistration.sol) candidate binds a Semaphore membership proof message to chain, wrapper, MACI target, group and exact MACI key. It uses an election-specific scope and a wrapper-owned nullifier mapping. The latter is needed because public Semaphore `validateProof` can be called by another party to consume Semaphore's global nullifier; relying on that set would create a front-running denial of registration. The wrapper's nullifier state and MACI signup are in one transaction, so an invalid MACI key reverts both. Real local negative probes cover changed key, wrong scope/root, non-member, direct MACI signup, duplicate use, invalid-key rollback and public global-nullifier consumption. Two eligible synthetic keys then signed up. The full local flow joined a poll, published two encrypted commands and completed MACI processing/tally proof submission with `[1,1,0]` verified. See the [PoC record](../../research/mvp3/semaphore-maci/README.md). Issuer honesty, membership-root governance, exact artifact provenance, dependency/license review, a second full election and product integration remain open.

Dora Factory's [aMACI repository](https://github.com/DoraFactory/maci) and [protocol documentation](https://maci-docs.dorafactory.org/en/docs/protocol/overview) describe a Cosmos/Dora Vota AMACI add-new-key design. Direct compatibility with this EVM MACI v3 product was not shown. The [aMACI review](../../research/mvp3/semaphore-maci/AMACI_REVIEW.md) classifies direct migration NO-GO and a port NOT VERIFIED. The historical Semaphore + ElectionGuard `CONDITIONAL GO` remains restricted to isolated research.

## 9. Decision matrix

The detailed [matrix](../../research/mvp3/semaphore-maci/DECISION_MATRIX.md) compares voter/ballot privacy, coordinator trust, uniqueness, proof verification, gas, rights, risk and reproducibility. Current MACI v3 is a conditional synthetic baseline with testnet gates open. Semaphore + MACI has a genuine local integration and is **CONDITIONAL GO for further isolated research**, not product migration. Direct aMACI migration is **NO-GO** on observed platform incompatibility; a port is NOT VERIFIED. The older Semaphore + ElectionGuard hybrid remains CONDITIONAL GO for research only, with no migration approval.

## 10. Validation evidence and limits

The following paragraph records the earlier research checkpoint before the current product rerun described in the acceptance matrix and [MACI progress](maci/PROGRESS.md).

This workstream ran `npm.cmd run typecheck`, `npm.cmd run lint` and `npm.cmd run build` under repository-local Node 24.21.0; all exited 0 after the focused source edits. Read-only `npm.cmd run db:check` and `npm.cmd run db:migrate:status` exited 0 in normal Windows execution: Prisma connected to the configured Supabase `voting` schema and reported exactly two applied migrations/up-to-date state. Its first restricted-sandbox attempt failed before connecting at `uv_os_get_passwd ENOMEM`; the normal Windows retry passed. The final isolated Solidity `compile.mjs` exited 0 with solc 0.8.37, 3,032-byte optimized wrapper creation code and 846-byte synthetic poll policy; wrapper SHA-256 is `185ceea0d3aaef107aaa46aa111c5d80c2c49f87693e2f62360980e14708de8e`. `node research/mvp3/semaphore-maci/run-local.cjs` exited 0 on chain 31337 with genuine proofs, two signups and all listed negative probes. The final `SEMAPHORE_MACI_FULL_PROOF=true` run used the isolated lockfile and separate research poll policy and exited 0: local signup receipts used 485,922 and 474,009 gas, processing and tally proofs were submitted on chain, and `[1,1,0]` was verified. Ignored proof output: `research/mvp3/semaphore-maci/outputs/full-1792219893509/`. Gas values are local observations, not BSC values. Some early debug/interrupted runs exited 1 before the corrected runner passed; they are not success evidence. The earlier local web/API/chain processes were unavailable at this checkpoint, so no fresh browser-to-Supabase end-to-end run, live managed migration, public deployment or independent verifier was executed in this workstream.

`npm.cmd run prisma:validate` also exited 0 on the unchanged MACI-first schema. This command did not apply a migration.

## 11. Known limitations and blockers

MVP 3A cannot claim operator anonymity while one runtime SQL role reads both registration and join keys. Under the revised academic scope this and coordinator visibility are disclosed limitations, not completion blockers. M0 artifact provenance, archived MACI upstream, high dependency advisories and complete chain-97 compatibility remain separate public-deployment gates. The earlier wallet routes are archived; the current MACI replacement is mapped above. The isolated PoC now has its own exact-version lockfile and installed research dependency tree; its install reported 74 advisories, including 24 high, and distribution/security clearance remains open. Large MACI proving artifacts are shared from the ignored, pinned research artifact store. The local proof run uses synthetic identities on one in-process Hardhat chain; it does not establish real-world eligibility, custody separation or resistance to traffic analysis. No new main-app automated test suite was added per task policy.

## 12. MVP 4 readiness

The [verification data contract](VERIFICATION_DATA_CONTRACT.md) maps lifecycle display states to actual MACI observations, identifies provenance for every public artifact and separates retrieval, cryptographic checks, reconciliation and reporting. The existing public envelope is a starting format, not an independently verified dataset. MVP 4 still needs a versioned election-configuration export, artifact/vkey IDs, canonical serialization, archive mirrors/retention, authenticated chain replay, standalone verifier outcomes and reorg/outage tests. The independent CLI must reject a database-only `VERIFIED` assertion.

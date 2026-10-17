# MVP 3 privacy baseline and checkpoint plan

Updated 2026-10-17. This plan supersedes the execution order in the historical DAVINCI plan while preserving its research evidence. MACI implementation evidence is in [MACI progress](maci/PROGRESS.md); the prior [Semaphore + ElectionGuard decision](semaphore-electionguard/FINAL_DECISION.md) remains unchanged.

## Checkpoint 0: observed architecture

- Next.js desktop web uses username/password with NestJS-owned scrypt hashes and HttpOnly sessions. This is custom authentication stored in Supabase PostgreSQL through Prisma; Supabase Auth is not installed.
- Authenticated election-specific eligibility permits an issuer authorization per account/election. `SponsoredMaciRegistration` binds a one-use ticket and MACI public key before upstream signup. Separate sponsors submit registration, join and encrypted commands. Join/message routes reject identity cookies.
- The browser generates a MACI private key, downloads an AES-GCM encrypted, PBKDF2-derived backup, and requires a restore check. The plaintext key is held in browser memory during the page session. Registration sends its public key only. Command signing and encryption happen in the browser; the relay receives ciphertext and an ephemeral public key. The coordinator key can decrypt individual commands.
- The coordinator generates processing and tally proofs. Local Hardhat contracts accepted real proofs; the API checks public proof transaction calldata, verifier results, tally commitments and canonical events before publishing an audit record. This is application-operated checking, not the independent MVP 4 verifier. The UI distinguishes command inclusion from verified tally results.
- The Supabase `voting` schema holds identity-linked registration and separately stored anonymous submissions. The current runtime role can read registration and join public keys, so a database reader can link those records. IP, timing and transaction metadata remain correlatable by infrastructure operators.
- Previous MVP 1/2 source, ABIs and scripts were moved to `research/legacy-mvp1-mvp2/` in the pre-existing working tree; live prior routes and contracts are absent from the active app. Historical evidence remains. Preserving prior *functional* routes needs a compatibility decision and restoration work.

## Sequential checkpoints

| Checkpoint | Focus | Exit evidence |
| --- | --- | --- |
| 1. Privacy and keys | Credential lifetime, backup parsing and recovery, access to registration/join data, sensitive logs and errors | No voting key or plaintext choice in API request, SQL row, log or URL; recovery and wrong-passphrase checks; operator/coordinator limits explicit |
| 2. Voting and verification | Command encryption, authorization uniqueness, vote-update nonce, receipt/finality, processing and tally proof transactions, event completeness | Real local positive and negative probes; no premature `VERIFIED` display |
| 3. Desktop UX | Clarify registration, encrypted submission, inclusion, processing and verified result states; lost credential guidance | Manual desktop journey, build, lint and typecheck; no mobile work |
| 4. Isolated research | `research/mvp3/semaphore-maci/` with separate dependencies, synthetic identities, contracts and outputs; test real integration only if MACI signup call context is compatible; review aMACI | Reproducible commands and negative cases, explicit feasibility boundary, no main app or managed SQL change |
| 5. MVP 4 readiness | Version public artifact contract and chain-grounded lifecycle; separate retrieval, verification, reconciliation and reporting | Final report, decision matrix, exact results and blockers |

Likely focused files: `apps/voter-web/app/maci-{panel,client,join-client}.ts*`, `services/api/src/maci/{module,relay,join-relay,registration-relay,audit}.ts`, `services/api/prisma/schema.prisma` only after a reviewed non-destructive access plan, `packages/shared-types/src/maci.ts`, this directory, and the isolated research workspace. No new main-app automated test suite, public deployment, managed database write, real electorate, mainnet or trusted setup ceremony is implied. BSC Testnet MACI deployment remains withheld by the existing dependency, provenance, security and full-chain compatibility gates.

## Initial risk register

| Risk | Observed state | Gate |
| --- | --- | --- |
| Account-to-MACI key link | Registration row holds user ID and public key; join row holds the same key; runtime SQL role can read both | Separate privileges and review operational joins before claiming anonymity against operators |
| Coordinator secrecy | Coordinator private key can decrypt individual commands | State trust assumption in UI/docs; no secrecy claim against coordinator |
| Key loss | Backup and passphrase are user-held; password reset cannot recover credential | Safe restore/loss guidance and backup failure checks |
| Public proof trust | Local on-chain verification passed; setup provenance and dependency findings remain open | No testnet security claim before M0 gates and full chain-97 path |
| Legacy compatibility | Prior live MVP routes removed in existing MACI-first tree | Versioned restoration decision and working validation before claiming previous capabilities |

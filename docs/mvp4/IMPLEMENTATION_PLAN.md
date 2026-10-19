# MVP 4 implementation plan

Status: the explicitly authorized local academic MVP 4 Definition of Done was **COMPLETED** on 2026-10-18. The isolated PostgreSQL fixture resolved the former checkpoint 5E blocker; all current-run acceptance evidence is in `PROGRESS.md` and `FINAL_REPORT.md`. The implementation sequence below records the original plan and its former constraints. Baseline revision `aa63fe1093b62ec770cc6a1aa699ec61c2c02ac9` had a clean working tree.

## Architecture assessment

The active MACI v3 application has one NestJS `MaciAuditService` that verifies an uploaded coordinator envelope and stores an aggregate result. Its public endpoint distributes the envelope only after a database `VERIFIED` record and rechecks snapshot hash/depth. The coordinator already produces public manifest, events, proofs and tally files; these are the input to the independent verifier, not its authority. `MaciElection.candidates` is a mutable database JSON array with display names and no on-chain candidate-order commitment. `MaciCoordinatorRun`, `MaciProofSubmission` and `MaciChainCheckpoint` are operational projections. The existing web shell, cards and status pills support a read-only desktop monitor. Semaphore + MACI stays in `research/`.

The verifier runs in a separate process, with no API or database import. It selects its own RPC, validates exact public bytes and replays the canonical chain. MACI SDK v3.0.0 and contracts v3.0.0 are pinned in the existing lockfile. Shared library reuse is acceptable; a backend verdict is not. Chain RPC honesty and continued availability remain external assumptions. A confirmation depth reduces reorg exposure but is not absolute finality.

## Checkpoints and acceptance

0. Record actual source boundaries, threats, dependencies and validation plan in this document, `DECISIONS.md` and `PROGRESS.md`.
1. Define canonical UTF-8 JSON (sorted object keys, no floating point, LF terminator), stable candidate IDs, evidence artifact hashes, and an explicit legacy classification. Preserve the original four MVP 3 files and hashes.
2. Add a standalone CLI with JSON verdicts and nonzero failures. Validate configuration, independent chain identity/logs/receipts, proof calldata, on-chain keys, processing and tally completeness, commitments and aggregate. Require a successful pre-election self-transaction anchoring SHA-256 of the canonical configuration without its `anchor` reference. Reject swapped or missing candidate IDs. No database `VERIFIED` field is an input.
3. Add admin-only read-only monitoring from existing projection tables and live chain state. Keep eligibility and registration counts separate from join and message counts. No identity joins or raw voter rows leave the API.
4. Add a desktop monitoring view and unauthenticated public evidence guidance. Clear displayed results on election switch, fetch failure and revalidation failure.
5. Run lint, typecheck, build, Prisma validation and actual local Hardhat proof/evidence verification. Exercise mutations, unavailable RPC, depth and reorg. Existing historical addresses are valid only while their chain remains available. Never claim an old fixture's chain checks passed against a fresh chain.
6. Publish a final report and MVP 5 handoff with exact commands, exit codes, observations and unresolved gates. Do not mark complete without a real standalone PASS on genuine on-chain proof evidence.

## Dependencies and boundaries

No new package, public chain deployment, key transfer or trusted setup was required. One additive local database migration became necessary to persist and distribute the canonical anchored candidate configuration; it was not applied to managed Supabase. Public export excludes witnesses, credentials, private keys, account-to-key joins and individual decrypted commands. The monitoring API stays behind the existing admin role. The public page needs no session. If no historical RPC/archive is available, the verifier must return `INCOMPLETE` or `ERROR`, never `PASS`.

## Threats and limits

Adversaries include a malicious API/database operator who alters or withholds evidence, a malicious coordinator who asserts success, a dishonest or unavailable RPC, and an attacker who swaps candidate labels. Independently replay events, transactions and MACI proofs against a chosen chain source. Hash every exported artifact. A pre-election chain transaction can bind candidate IDs to a hash for a verifier that trusts the chain and publisher identity; existing MACI contracts do not themselves commit candidate order, so the publisher remains trusted for honest nomination. The historical MVP 3 election has no such prior immutable commitment and cannot retrospectively acquire one. On-chain proofs establish tally computation under the circuit assumptions, not honest identity issuance, cast-as-intended on a compromised client, or coordinator inability to decrypt commands.

## Measurements

Record evidence bytes, verification wall time and process memory only when run. Keep observed local data separate from estimates. No new automated test files or broad suite.

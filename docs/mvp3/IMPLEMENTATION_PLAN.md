# MVP 3 implementation plan

> **Current execution plan, 2026-10-17:** Follow the owner's revised checkpoints: (0) reconcile accepted scope and old DoD; (1) check the active MACI admin/voter lifecycle and functional continuity; (2) check key management, proof-dependent results and snapshot finality; (3) retain and document the isolated Semaphore + MACI evidence; (4) run current quality and feasible negative/synthetic checks without managed writes; (5) update acceptance records and [MVP 4 handoff](../mvp4/HANDOFF_FROM_MVP3.md). [ADR 0011](../architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md) supersedes the historical product-specific plan below. No new dependency or schema change is planned; a focused voter UI race fix affects `apps/voter-web/app/maci-panel.tsx`, with lint/typecheck/build and runtime status checks as verification. Public deployment and managed writes are excluded.

> Current 2026-10-17 checkpoint plan: [privacy baseline](PRIVACY_BASELINE.md). The historical DAVINCI plan below remains research evidence.

> Historical DAVINCI/Semaphore plan. Its product-specific cryptographic requirements are `SUPERSEDED_BY_MACI` by [ADR 0010](../architecture/adr/0010-maci-mvp3-protocol-migration.md). Preserve this file as research evidence; use the [MACI plan](maci/IMPLEMENTATION_PLAN.md) for new implementation. Unfinished historical gates are not technically resolved.

Status: checkpoint 0 audit complete on 2026-10-13; cryptographic composition gate **blocked after isolated local probes**. This is a research implementation plan, not an anonymous-voting release claim. The owner conditionally authorizes BSC Testnet deployment and `.env` updates **only after the full security gate passes**; mainnet, real identities and managed-database migration remain unauthorized.

## Scope and dependencies

Preserve `BasicVoting`, `GaslessVoting`, their ABIs, deployment records, and the public MVP 1/2/2.5 paths. New elections explicitly choose a versioned anonymous protocol before creation; existing elections cannot be converted. A single-choice anonymous election uses one frozen membership root and a fresh independent ElGamal key. The voter has no wallet or gas requirement. MVP 4 owns the standalone public verifier; MVP 3 must still retain accepted public records and internally check tally evidence.

The first dependency is a **composition feasibility gate**. Before wiring a voter or admin path, identify exact maintained versions, licenses, advisories, audited scope, setup artifacts, and a reviewed browser-capable encryption/validity-proof implementation with contract-verifiable evidence. Demonstrate canonical ciphertext/manifest/key binding across browser, API, contract, and internal tally. Verify on-chain gas and browser cost on the target EVM. If this cannot be met, record a versioned acceptance redesign in an ADR and do not present backend filtering as contract validation. See [architecture](ARCHITECTURE.md) and [decisions](DECISIONS.md).

The [first local feasibility probe](FEASIBILITY_EVIDENCE.md) generated both proofs but lacked accepted-record binding. The final two-file circuit revision also fixes a padded-field underconstraint. A new verifier now binds an actual recorded ciphertext/key/manifest in a local contract, with complete-vote calldata and gas measured. Two accepted records were aggregated and internally decrypted, and one Edge headless proof was timed. Independent setup, source/license/security review, public aggregate-decryption evidence, mobile browser bounds and BSC compatibility remain unresolved. [ADR 0009](../architecture/adr/0009-mvp3-encrypted-ballot-proof-composition.md) is proposed. No product-facing checkpoint may start while it is unresolved.

## Ordered checkpoints

| Checkpoint | Deliverable | Exit condition |
| --- | --- | --- |
| 0. Audit and architecture | Inventory, trust boundaries, technology evaluation, threat assumptions, ordered plan | This record and linked documents reflect source state; no security claim |
| Gate. Composition feasibility | Pinned membership, ElGamal, exact-one proof and on-chain verifier; canonical vectors; artifact provenance; browser and gas measurements | **Blocked.** The revised local verifier rejects ciphertext/key/manifest mutation and records ciphertext; local aggregate decryption and one browser proof passed. Independent setup, review, public tally evidence, mobile bounds and BSC remain incomplete. |
| 1. Credential and membership | Client-generated election-specific secret, private recovery choice, issuer deduplication, pre-freeze replacement, frozen public snapshot/root | Only eligible synthetic accounts can enroll; duplicate/replacement races and old-root use fail; no secret escrow |
| 2. Membership authorization | Client proof, fixed contract-derived election scope, proof message bound to ballot record, nullifier | Wrong group/election/domain/message fails; one accepted nullifier per election atomically |
| 3. Encrypted ballot | Fresh election key, client-side one-hot encryption and exact-one validity proof | No plaintext selection reaches API/chain; malformed or substituted ballot fails on-chain |
| 4. Contract and relayer | Versioned anonymous contract, calldata evidence, sponsored submission, canonical receipt and reorg handling | Contract enforces both proofs and lifecycle; relay retry cannot duplicate or mutate vote |
| 5. Backend and web | Separate issuer/ballot access paths, projections, admin configuration, voter flow and safe statuses | Synthetic walletless manual flow works without identity-to-ballot persistence |
| 6. Tally | Accepted-set aggregation, aggregate-only normal decryption, internally checked proof and publication | Omission, addition, altered aggregate/key/count/proof fail internal checks; key loss remains incomplete |
| 7. Evidence and measurements | Reproducible raw measurements, limitations, MVP comparison, demonstration record | All MVP 3 criteria in `docs/mvps/mvp-3-anonymous-zk.md` have actual evidence or explicit failure |

Checkpoint numbers in the request are retained. The feasibility gate precedes product integration because an enrollment UI without a verifiable ballot acceptance path would create a misleading privacy feature. An isolated throwaway prototype may be used for this gate, but it cannot accept votes or be represented as a completed checkpoint.

## Planned affected areas

- `packages/contracts`: new contract and verifier integration, separate ABI/deployment; existing contracts unchanged.
- `packages/shared-types`: versioned manifest, canonical envelopes and runtime validation; no identity fields on ballot records.
- `packages/crypto` and `packages/zk`: reviewed implementation adapters and artifact hashes only after gate; no custom primitives.
- `services/api`: issuer module and anonymous relay/status/indexer paths with separate credentials, storage and ingress; no reuse of `AuthService.vote` or `GaslessVoteRequest` for anonymous data.
- `services/api/prisma`: additive migration only after schema and access-role review; never apply to managed Supabase without explicit authorization.
- `apps/voter-web`: local credential handling and proof worker, limited existing-layout changes, no wallet prompt for anonymous elections.
- `docs/mvps/mvp-3-anonymous-zk.md` and `docs/benchmarks`: exact commands, revisions, raw observed runs and limitations.

## Verification and measurement contract

The owner requests no new unit, integration, E2E or dedicated automated test suites. Use existing build, typecheck, lint, Prisma validation and focused manual or standalone feasibility probes. Record every probe's input class, expected invariant, observed outcome, revision, environment and exit status. Do not call a simulated or in-memory database a Supabase result. Required adversarial probes cover duplicate and concurrent nullifiers, wrong root/scope/manifest/key, altered ciphertext/proof, stale root, replays, reorgs, accepted-set omission/addition and incorrect decryption evidence. If a property cannot be probed adequately under this testing restriction, leave the acceptance criterion unmet.

Measure registry construction, commitment generation, encryption, witness/proof generation and verification, ciphertext/proof bytes, contract deployment and vote gas, sponsored submission/finality, aggregation, tally decryption and evidence checks. Use integer gas/fee units; separate browser, API, chain and network time. Label every result observed, simulated, estimated or not measured. Rerun MVP 2 under the same recorded conditions for comparisons. No benchmark value is assumed in this plan.

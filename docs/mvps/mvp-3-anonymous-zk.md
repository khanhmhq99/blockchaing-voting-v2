# MVP 3: Anonymous ZK voting and encrypted tally

> **Current revised Definition of Done (2026-10-17):** The MACI v3 main application is MVP 3A; the independent Semaphore + MACI synthetic proof is MVP 3B. [ADR 0011](../architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md) supersedes the product-specific ElGamal/Semaphore design and acceptance criteria below, which remain historical research evidence. Operator identity-to-key linkability and coordinator command visibility are accepted, disclosed academic limits. The live wallet-based MVP 1/2 routes need not be restored when essential election, account, eligibility, admin and voter capabilities work through MACI. No public deployment or production-security approval is implied.

## Revised academic acceptance gates

| Gate | Required observation | Current evidence/status |
| --- | --- | --- |
| A. Complete application | Admin configures a chain-bound election and eligibility; voter logs in, backs up a browser key, registers, joins, encrypts and submits; inclusion reconciles; coordinator submits real processing and tally proofs; application checks and displays the final tally | Current two-voter browser/API/Supabase/Hardhat proof run `[0,1,1]` passed; see [MACI progress](../mvp3/maci/PROGRESS.md) |
| B. Key and privacy | No intentional private-key transfer or plaintext persistence; backup errors fail safely; key loss, operator linkage and coordinator visibility are explained | Current Chromium wrong-passphrase rejection and same-file recovery passed; see [final report](../mvp3/FINAL_REPORT.md) |
| C. Functional continuity | Login, account, admin election/eligibility, voter registration/join/vote, status and results work in MACI; obsolete wallet routes remain archived | Source mapping in [final report](../mvp3/FINAL_REPORT.md); prior real app run covers core path |
| D. Correctness and failure cases | Ineligible/duplicate/malformed/unauthorized requests, replay/nonce/update semantics, wrong scope/proof/commitment, missing/failed tx, outage, insufficient confirmations and detectable reorg fail safely | Historical eligibility/replay/revert probes plus current revote, proof mutation, tampered audit, HTTP outage/depth/hash and browser suppression passed with simulated-failure limits |
| E. Public result integrity | Snapshot number/hash/depth and canonical recheck; exact chain events and proof transactions, verifying keys and commitments checked before result | Current HTTP 409 depth/hash and 503 outage passed; hash mismatch used an RPC proxy; independent verifier is MVP 4 |
| F. Isolated research | Genuine Semaphore membership and on-chain MACI proof/tally run, exact dependencies, synthetic inputs, negatives and limitations documented | [PoC record](../../research/mvp3/semaphore-maci/README.md): local run passed `[1,1,0]`; provenance/advisories disclosed |
| G. Quality and handoff | Lint/typecheck/build/Prisma and read-only DB checks, current synthetic acceptance where feasible; MVP 4 inputs/gaps specified | See [progress](../mvp3/PROGRESS.md) and [handoff](../mvp4/HANDOFF_FROM_MVP3.md) |

Academic completion requires **all applicable gates** with actual evidence. Open negative and current runtime gates cannot be waived as research limitations. The historical plan and table below describe the former protocol only.

Status: explicitly requested on 2026-10-13; checkpoint 0 audit is documented. The isolated local [proof probes](../mvp3/FEASIBILITY_EVIDENCE.md) first exposed a missing ciphertext/key/manifest binding, then validated a minimal public-input circuit revision and a research contract that records the bound ciphertext. The full cryptographic gate remains **blocked** by setup provenance, review, aggregate-decryption evidence and target measurements; implementation acceptance has not started. See the [implementation plan](../mvp3/IMPLEMENTATION_PLAN.md), [architecture audit](../mvp3/ARCHITECTURE.md), [decisions](../mvp3/DECISIONS.md), [proposed ADR 0009](../architecture/adr/0009-mvp3-encrypted-ballot-proof-composition.md), and [resume record](../mvp3/PROGRESS.md). Intended tag after all gates: `mvp-3-anonymous-zk`.

## Objective and scope

Replace wallet eligibility with browser-held anonymous credentials, frozen Merkle membership, election-scoped nullifiers, proof-bound ElGamal encrypted valid ballots, and homomorphic aggregate tally with one initial election-specific decryption-key holder. A relayer pays fees; the voter need not own cryptocurrency or install a wallet extension. Separate issuance from voting records.

Generate aggregate decryption evidence and check correctness with internal cryptographic tests/vectors. Preserve accepted ciphertext/proof records for public reconstruction. The complete Public Audit Dataset, standalone CLI, independent aggregate/decryption verification and audit UX/monitoring belong to MVP 4. Exclude revoting, dynamic registry roots, mid-election credential replacement, custom cryptographic primitives, and real electorate deployment.

## Dependencies and mandatory design gate

MVP 2 accepted; D07-D13 addressed for protocol design/evidence preservation, with full dataset/CLI delivery reserved for MVP 4; cryptographic reviewer responsibility identified. [ADR 0003](../architecture/adr/0003-anonymous-protocol-gates.md) retains unvalidated composition gates under the selected single-holder ElGamal approach in ADR 0006. Before product integration:

1. Select a reviewed ElGamal encryption/validity/decryption-proof implementation and exact membership version/artifacts. Check licenses, curve/field compatibility and browser support.
2. Produce cross-language canonical-encoding and known-answer vectors binding authorization, ciphertext, validity proof, key and manifest. Define scope and scalar/group checks without inventing new primitives.
3. Demonstrate on-chain enforcement and measure proof/ciphertext gas, size, browser time/memory. If infeasible, document a verifiable redesign or report the milestone blocked; do not replace checks with backend trust.
4. Review single-holder key generation/custody, independence from admin/deployer keys, fresh per-election keys, backup/loss handling, registration/recovery, metadata and evidence risks. Document the future threshold path without implementing it. A feasibility prototype is not an accepted secure protocol.

## Modules and architecture changes

Add isolated `services/identity`, `packages/crypto`, `packages/zk`, proof worker and credential handling in the web app, anonymous proof-based relayer adapter, a new anonymous contract deployment, single-holder tally/decryption-proof tooling, public accepted-record retention and internal correctness tests. `packages/verifier` CLI and the complete published audit dataset are MVP 4 deliverables. Extend shared schemas with protocol-specific envelopes rather than appending identity fields to ballot rows. Separate databases/roles/origins/log pipelines before claiming issuer/ballot separation.

## Implementation sequence

Complete the design gate; implement enrollment/deduplication and pre-freeze lifecycle; publish one shared root/snapshot; generate and freeze an independent election ElGamal public key; integrate client encryption/validity/membership proofs; enforce all acceptance checks and atomic nullifier consumption; publish accepted ciphertext evidence; compute the homomorphic aggregate and single-holder decryption proofs; check results with internal/differential vectors and review metadata. Keep each stage covered by adversarial vectors before UI polish.

## Acceptance criteria and testing strategy

All statuses: **not run**; none can be waived by a mock.

| ID | Criterion | Verification |
| --- | --- | --- |
| M3-A1 | Eligible membership is verifiable without revealing the proving leaf/secret | Known-answer/differential proof tests, outsider/wrong-root rejection; A2/A4 assumptions recorded |
| M3-A2 | One accepted vote per credential/election | Concurrent duplicate/nullifier races, arbitrary-scope and cross-election replay tests; T02/T03 |
| M3-A3 | Ciphertexts hide individual choices under named assumptions | Reviewed scheme/parameters, fresh randomness and secret/log checks, explicit client/key-holder model with no privacy claim against the holder |
| M3-A4 | Authorization and ballot-validity proofs bind the exact submitted ciphertext/key/manifest | Mutate each field/proof/public input; wrong group/range/key and overvote rejection; T04/T11 |
| M3-A5 | Credential issuance/recovery cannot silently mint a second opportunity | Duplicate/pre-freeze replacement races, old-root rejection, after-freeze replacement denial; T08/T09 |
| M3-A6 | Identity and ballot datasets/telemetry have no direct shared identifier | Database/schema/ingress/log/backup inspection and synthetic linkage analysis; T10/T17 |
| M3-A7 | Aggregate tally follows exactly the accepted valid set | Internal independent-vector recomputation, omitted/added/altered ballot, wrong key/count and corrupted decryption-proof tests; public CLI verification follows in MVP 4; T12/T14 |
| M3-A8 | No individual plaintext cast ballot or opening secret is public | Complete artifact and calldata review; aggregate-only decryption outputs |
| M3-A9 | Voter completes encrypted vote without wallet extension or funds | E2E on named desktop/mobile profiles, recoverable submission errors and inclusion check |
| M3-A10 | Evidence generation, public accepted-record retention and performance measurements exist | Internal proof checks, artifact hashes/setup provenance, raw runs and review record; no standalone audit completion claim |
| M3-A11 | Each election has a fresh key distinct from signing keys, with single-holder limitations disclosed | Key reuse/mismatch and unavailable-key tests, secure environment/log review; future threshold formats documented, not implemented; T23/T24 |

Run circuit/constraint tests, contract negative tests, encoding interoperability, issuer concurrency, relayer retry, single-key loss/mismatch and invalid decryption-proof scenarios, and complete E2E tally. Verify malformed/corrupted artifacts fail closed. External review of composition is required before any real electorate trial; test passes alone are not a security proof.

## Benchmark requirements

Rerun MVP 2 baseline. Measure cold/warm artifact download, encryption, witness/proof time and memory on named devices; proof/ciphertext sizes; on-chain verification gas/fees; submission/finality latency; registry construction; aggregation, bounded tally decoding, single-holder decryption and proof generation/checking; public accepted-record bytes. Full dataset/CLI verification timing belongs to MVP 4. Vary candidates/tree size/concurrency independently. Attribute privacy-related cost to added guarantees, not solely to relayer transport.

## Risks and migration considerations

Primary risks: invalid proof composition, non-native field arithmetic cost, setup provenance, single-holder misuse/compromise/unavailability, malicious issuer, credential theft/recovery, metadata leakage and small anonymity sets. See T08-T17/T19/T21/T23/T24. Freeze one root and prohibit post-freeze reissuance initially. Old MVP 1/2 public records remain public forever; use new synthetic credentials/elections and distinct protocol versions. No historical privacy retrofit is possible. A future threshold version requires a new election/key and reviewed independent setup; splitting an old known key does not undo prior access.

## Implementation summary

Checkpoint 0 research and architecture audit are recorded in `docs/mvp3/`. ElGamal is selected; no concrete library/parameter set, circuit composition or tally implementation is validated. No MVP 3 product code, migration or deployment has been added.

## Test evidence

Not run. No proof/circuit/security audit evidence or passing anonymous workflow exists.

## Benchmark results

Not measured. Browser feasibility and on-chain validity-proof cost remain hypotheses.

## Known limitations

No coercion resistance, receipt-freeness, global-observer anonymity, honest-issuer proof or compromised-device protection. The single private-key holder can decrypt individual ciphertexts; aggregate-only workflow and correct decryption proofs cannot prevent or detect private misuse. Threshold protection is a future extension. Recovery after registry freeze is intentionally unavailable in the initial design.

## Git revision or tag

Implementation revision: none. Tag: not created.

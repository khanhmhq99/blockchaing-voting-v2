# ADR 0010: MACI protocol for new MVP 3 elections

Date: 2026-10-14. Status: accepted product direction; release/version/artifact integration pending M0 verification.

## Context

The earlier MVP 3 research combined Semaphore with a patched DAVINCI encrypted-ballot circuit. Local proof/contract probes passed, but DAVINCI source rights, independent review and public tally evidence remain unresolved. The owner has selected MACI to supply native encrypted commands, message processing and tally proofs. Existing public election histories, contracts and ABIs must remain reproducible.

## Decision

New private elections will use an explicit MACI protocol version. Evaluate official v3.0.0 source and ceremony artifacts first, without assuming they are production trusted. Prefer native MACI registration, non-quadratic poll processing, coordinator and verifier contracts. Preserve valid vote-update semantics while enforcing one final counted choice per eligible registered identity. A separate eligibility gatekeeper and walletless sponsored path are required. Existing DAVINCI/Semaphore artifacts stay in historical research and are never used for MACI proofs. No managed migration or BSC deployment occurs until the applicable gates pass.

`SUPERSEDED_BY_MACI` applies to the earlier MVP 3 product requirements for client ElGamal one-hot encryption, DAVINCI ballot-validity proof, Semaphore membership/nullifier and aggregate ElGamal decryption evidence. Their prior technical gaps are **not** resolved by this decision. The new proof obligation is MACI's exact circuit/configuration, processing and tally verification, plus completeness against canonical chain messages.

## Consequences and reproducibility

Earlier elections retain their original protocols and data. New APIs, schema rows, ABIs and deployment records must identify MACI release, circuit configuration, artifact hashes and verifier keys. MACI coordinator secrecy is a new central trust assumption; it can read individual commands and can withhold progress. The issuer remains responsible for one-person eligibility. Test-only proving keys cannot support product or testnet security claims. A source/archive and npm/runtime compatibility review is required before package installation.

See the [MACI implementation plan](../../mvp3/maci/IMPLEMENTATION_PLAN.md), [license review](../../mvp3/maci/LICENSE_AND_VERSION_REVIEW.md) and [artifact provenance](../../mvp3/maci/ARTIFACT_PROVENANCE.md).

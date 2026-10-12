# ADR 0004: Public evidence and privacy-limited observability

Status: accepted by owner as Public Audit Dataset + Standalone Election Verifier; retention/deployment parameters pending. Updated: 2026-10-11. Earlier direction retained with explicit MVP 4 ownership.

## Context

A commitment proves integrity only when its data can be obtained. Public dashboards can repeat an incorrect backend interpretation. Detailed logs can undo the privacy gained from cryptographic authorization.

## Considered options

1. Backend-only evidence and verifier: simple, but one operator controls both claims and evidence.
2. Content-addressed data alone: integrity identifiers, no guaranteed persistence.
3. Chain-reconstructable accepted ciphertext/proof records, mirrored public archives, and a standalone verifier with independent chain input.

## Decision

Choose option 3. MVP 3 preserves public accepted ciphertext/proof records and produces tally/decryption evidence with internal tests. MVP 4 packages the public audit dataset, anchors its commitments and delivers the independent CLI. Pin manifests, artifact hashes, accepted-set counts/checkpoints and tally evidence. Maintain at least two independently retrievable archive copies in MVP 4 experiments and test a mirror outage. A content-addressed store may supplement distribution; define retention responsibility before an election.

The CLI independently reconstructs canonical acceptance and validates ballot integrity, membership/eligibility proofs, ballot-validity proofs, nullifier uniqueness, homomorphic aggregation and decryption proofs. Detect missing, altered, duplicated and inconsistent records. No identity login, privileged backend API or secret key is required. Publish versioned JSON results and deterministic nonzero exit outcomes for invalid, incomplete, unsupported or failed verification; see the [protocol](../../protocols/voting-protocol.md). A declared result field or admin signature is never enough to pass.

Keep metrics aggregate and bounded. Identity and voting endpoints must not share user/session/request identifiers or analytics trackers. Synthetic benchmark instrumentation is a distinct dataset and configuration. AI uses operational aggregates only and has no vote-invalidating power.

## Trade-offs

Calldata/evidence publication costs more than bare commitments. Mirrors incur retention costs and do not prove universal availability. Aggregate metrics reduce forensic precision. Independent implementation of a verifier can still share specification errors; differential testing helps but is not a proof of correctness.

## Security implications

Verifier outcomes are `pass`, `invalid`, `incomplete`, `unsupported`, or `error`, with explicit trust assumptions and finality level. Missing ballots or proofs must prevent a successful result. Never publish individual plaintext cast ballots or encryption openings. A tally/receipt can leak information in small or unanimous groups; dataset access control cannot undo on-chain publication. Review anonymity-set sizes and result disclosure policy.

## Research implications

Measure bytes per vote, archive repair/retrieval, complete-dataset verification time, and outage detection. Separately quantify telemetry utility and privacy leakage risk. Future commitment-only batching must compare equivalent data-availability and acceptance guarantees, not only gas.

## Revisit when

Measured calldata cost makes the approach infeasible. Any alternative must define recovery, withheld-data behavior, proof acceptance rules, and audit completeness before benchmark claims are made.

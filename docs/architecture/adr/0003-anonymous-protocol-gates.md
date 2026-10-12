# ADR 0003: Gate anonymous protocol composition before implementation

Status: composition gate retained; threshold-first choice superseded by [ADR 0006](0006-elgamal-aggregate-tally.md) on 2026-10-11. Cryptographic integration remains unvalidated.

## Context

Anonymous eligibility, valid encrypted choices, unique participation, correct aggregation, and correct decryption are separate statements. Combining familiar libraries does not establish a secure voting protocol.

## Considered options

1. Semaphore membership and plaintext vote: anonymous authorization may be possible, but choices remain visible.
2. Membership plus encryption with backend-only validation: confidentiality may improve, but malicious clients/operators can submit malformed ballots.
3. Reviewed membership bound to ciphertext plus ballot-validity proofs, homomorphic aggregation and threshold decryption proofs.
4. Verifiable mixnet: supports richer ballots but adds shuffle proofs and operational complexity.

## Decision

Originally, option 3 proposed threshold custody from MVP 3. The owner has now selected ElGamal homomorphic tally with one distinct election-specific decryption key initially, and a future threshold upgrade path in ADR 0006. Retain one contest, exactly one selection, no write-ins/revoting and Semaphore v4 as the membership candidate. ElectionGuard is the first implementation family to evaluate, not a validated plug-in or compliance claim. Threshold configuration is not an initial MVP acceptance condition.

Proofs must bind the same canonical ciphertext, manifest/key version, and election domain. The contract must validate all required acceptance statements and atomically consume a nullifier. Initially publish ciphertext/proof data in calldata as well as archive copies. If proof verification is not viable on-chain, stop and redesign the acceptance/finalization model in a new ADR; do not substitute a trusted backend filter unnoticed.

## Trade-offs

Proof generation and ciphertext validity checks may dominate latency and gas. Non-native curve arithmetic can be prohibitive. Custom circuits increase review/setup burden. Threshold trustees add ceremony, recovery, and liveness complexity. A verifiable mixnet remains an alternative if ballot requirements change.

## Security implications

Require reviewed primitives, artifact/setup provenance, canonical encoding, complete public-input binding, group/range checks and an authenticated election public key. Normal operation decrypts aggregates only, but the single holder can decrypt any individual ciphertext; no secrecy against that holder is claimed. Fewer-than-threshold collusion and threshold availability assumptions apply only to a future threshold mode. A compromised client can disclose its own secret and choice.

Credential replacement after freeze is prohibited initially because a new secret changes the nullifier and can enable a second vote. Before freeze, replace the old commitment atomically and use only the final root. Issuer-level deduplication is still required; cryptography does not prove honest issuance. A cancelled election and restarted election are distinct records, not a hidden credential reset.

## Research implications

Gate MVP 3 on an interoperable proof-of-concept with mutation tests/review, browser measurements, on-chain validation cost, and aggregate tally/decryption evidence checked by internal test vectors. MVP 4 delivers the independent public dataset and CLI verification. Do not label mock proofs or internal checks as a completed independent public audit. Record failures of the composition gate as research limitations.

## Required evidence

Known-answer vectors; proof/ciphertext mutation rejection; cross-election replay rejection; browser/server/contract encoding agreement in MVP 3 and CLI agreement in MVP 4; artifact hashes; registry/nullifier invariants; single-holder compromise/loss analysis and future threshold threat analysis; and external composition review before any real electorate trial.

# ADR 0006: ElGamal aggregate tally with initial single-holder custody

Status: accepted approach by the project owner; concrete implementation and composition remain unvalidated. Date: 2026-10-11. Supersedes ADR 0003's threshold-first assumption; preserves its proof-binding and acceptance gates.

## Context

The owner selected ElGamal homomorphic encryption with client encryption, validity proofs, aggregate-only normal decryption and independent evidence verification. The research prototype starts with one election-specific private key and must support a later threshold design.

## Considered options

1. Single-holder ElGamal now, versioned threshold extension later.
2. Threshold ElGamal immediately, as previously proposed in ADR 0003.
3. Plaintext tally or backend-only encrypted-ballot filtering: does not satisfy the selected privacy/verification requirements.
4. Mixnet or another encryption family: not selected; reconsider only through an explicit architecture change.

## Decision

Choose option 1. Evaluate reviewed exponential/additively encoded ElGamal suitable for counting a one-hot selection vector. Ordinary multiplicative message encoding is not interchangeable with a vote-summing encoding. Every ballot is encrypted on the voter device with fresh randomness and the manifest's election public key. Require proofs of valid bit values, exact-one selection and correct encryption under that key; membership alone is insufficient.

Bind the membership message to the exact canonical ciphertext/validity evidence and election manifest. Homomorphically aggregate exactly the canonical accepted set and decrypt candidate totals only in normal operation. The holder produces reviewed decryption-correctness proofs tied to the public key and aggregate. An admin signature or a published count is not such a proof.

MVP 3 implements the encrypted protocol, evidence generation and internal cryptographic tests. MVP 4 publishes the complete public audit dataset and standalone CLI that independently reconstructs acceptance, checks every required proof and verifies the tally/decryption. Preserve public accepted ciphertext/proof records from MVP 3 so MVP 4 can reconstruct them; do not postpone evidence collection. Do not claim completed independent public audit at MVP 3.

Evaluate ElectionGuard's reviewed design and reference implementations first. An exact SDK revision, audit coverage, supported specification, single-holder configuration, browser integration and EVM proof-verification path remain selection gates. No custom primitives, hand-written ElGamal replacement, or assumed Semaphore/ElectionGuard compatibility. See the [compatibility evaluation](../cryptography-compatibility.md).

## Trade-offs

Single-holder custody reduces ceremony complexity but sacrifices privacy against that holder and creates a tally availability dependency. Exponent-encoded totals require bounded discrete-log decoding; candidate count, maximum ballots and group order must be fixed and tested. Proof verification/gas and browser arithmetic remain feasibility risks.

## Security implications

The holder can decrypt individual public ciphertexts, including retrospectively after compromise. Aggregate-only workflow is an operational policy, not a cryptographic restriction on that holder. The system makes no ballot-secrecy claim against the holder. No proof can establish that the holder did not decrypt other ciphertexts privately. Public audits must never request the private key, publish individual opening randomness, or decrypt cast ballots.

Homomorphic malleability is intentional: authenticate exact ballot bytes through proof binding, accepted-set commitments and canonical reconstruction. Do not expose a generic decryption oracle. Review subgroup/parameter checks, CSPRNG/nonces, proof transcript domain separation, count bounds and zero-ballot aggregation. Publication leaks metadata and small/unanimous totals may imply choices.

## Research implications

Measure client encryption/proving, acceptance verification, aggregation, bounded decoding and decryption-proof generation/checking separately. Label all initial results `single-holder`; aggregate correctness and privacy against public observers are different from privacy against operators. Compare threshold overhead only in a separately authorized future extension.

## Threshold upgrade path

Reserve versioned key configuration, `decryptionMode`, public setup evidence and proof-format dispatch. A future election may select reviewed distributed key generation, authenticated independent trustees, threshold `t-of-n`, proof-bearing partial decryptions and verified combination. Freeze these parameters before voting. Never implement threshold by merely handing out copies of the same secret or assuming a product of keys provides arbitrary `t-of-n` recovery.

Use a new election and new key/setup for migration; keep old single-holder records/verifier behavior reproducible. Sharing an already known old secret does not retroactively remove the old holder's ability to decrypt, and later threshold elections cannot restore secrecy of earlier ciphertexts. Threshold remains an upgrade path, not a required implementation in the current six MVPs.

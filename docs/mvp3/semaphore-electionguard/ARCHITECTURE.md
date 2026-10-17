# Research protocol candidate

The candidate election is a single contest with exactly three choices and at most one counted selection per ballot. Three synthetic identities belong to one Semaphore group. ElectionGuard Python 1.4.0 uses its own v0.95 manifest, ceremony, encryption, proofs, homomorphic tally and threshold decryption. No Core 2 record or verifier is used with it.

## Exact local binding

The Python probe uses ElectionGuard `BallotBox.cast` to obtain `SubmittedBallot` objects with proofs and without encryption nonces. It serializes each public object through pinned `to_raw`, parses that JSON and writes UTF-8 bytes using sorted keys and compact separators. `ballotDigest = keccak256(those exact file bytes)`. This is a versioned local byte format, not a general cross-language ElectionGuard canonical encoding.

For chain 31337, the Semaphore message is the unsigned integer value of:

`keccak256(abi.encode(BALLOT_DOMAIN, chainId, electionId, manifestDigest, contextDigest, ballotDigest))`

The scope is the integer value of `keccak256(abi.encode(SCOPE_DOMAIN, chainId, electionId))`. The domain constants are `keccak256("HCMUT-SEG-BALLOT-V1")` and `keccak256("HCMUT-SEG-SCOPE-V1")`. `manifestDigest` and `contextDigest` are Keccak-256 of the exact public JSON files. Semaphore v4.14.4 hashes the message and scope inside its proof circuit and Solidity verifier; [upstream `generate-proof.ts`](https://github.com/semaphore-protocol/semaphore/blob/v4.14.4/packages/proof/src/generate-proof.ts) and [Semaphore.sol](https://github.com/semaphore-protocol/semaphore/blob/v4.14.4/packages/contracts/contracts/Semaphore.sol) implement those paths. The research registry independently recomputes the message and scope, freezes the group root, verifies the real proof and marks the nullifier used atomically before appending the ballot digest.

The registry has an immutable sequence `acceptedBallots[index]` and `BallotAccepted` events. An auditor must fetch each exact public ballot byte file by digest and compare the ordered on-chain set to the published ElectionGuard aggregate. The local PoC reads back all three accepted digests, stores an ephemeral chain snapshot, matches exact ballot files, then a separate process verifies the ElectionGuard public record. This does not yet authenticate a persistent BSC checkpoint or prove archive availability. A hash without available bytes cannot support a public tally audit.

## Trust and acceptance limits

Semaphore only proves group membership and binding to a hash. The local registry **does not verify ElectionGuard ballot-validity proofs on-chain**. A malicious member can submit a digest for invalid or unavailable ciphertext and consume their nullifier. An off-chain API precheck does not cryptographically constrain direct contract calls. A validator signature could gate acceptance but would introduce validator censorship/trust; allowing ballot replacement would change one-ballot semantics. This protocol-level choice is unresolved, so the local registry is research-only.

The eligibility issuer must atomically issue at most one identity commitment per authenticated eligible account/election, then avoid storing a plaintext account-to-nullifier or account-to-ballot join. This was not implemented in the PoC. Auth and submission endpoints, timing, IPs, logs and backup access could still correlate voters. Three guardians in the current Python script have distinct processes and ephemeral in-process key storage. An allowlisted IPC protocol exchanges public keys, encrypted ceremony backups and public decryption shares; an explicit private accessor is denied. The same host administrator and parent orchestrator can still command all workers. Separate hosts/operators, authenticated requests, durable isolated storage and governance are required before a no-single-operator secrecy claim.

The normal ElectionGuard path decrypts only the aggregate. The PoC invokes native 2-of-3 compensation and returns `[1,2,0]`, but the shipped source verifier cannot validate that compensated share. Its 3-of-3 share verification succeeds even after a published tally integer is changed. A separate research verifier composes pinned upstream checks and recomputes the complete local 2-of-3 result from public data. It needs independent review, broader adversarial records and authenticated accepted-set reconciliation before deployment use.

# Solidity verification feasibility

The local experiment compiles official Semaphore v4.14.4 `SemaphoreVerifier`, `Semaphore` and Poseidon T3 with `solc 0.8.37`, optimizer 200 runs, `evmVersion=cancun`. [BoundBallotRegistry.sol](../../../research/mvp3/semaphore-electionguard/BoundBallotRegistry.sol) is a small research-only wrapper. Hardhat chain 31337 executed three real v4.14.4 proofs, accepted their election/ballot commitments and enforced nullifier uniqueness. This demonstrates a **hybrid** path, not ElectionGuard validity enforcement by Solidity.

| Local measurement | Observed value |
| --- | ---: |
| Poseidon deployment | 3,614,580 gas |
| Semaphore verifier deployment | 3,716,011 gas |
| Semaphore group deployment | 1,804,661 gas |
| Research registry deployment | 584,505 gas |
| Add three members | 277,723 gas |
| Ballot 1 / 2 / 3 submission | 333,524 / 316,436 / 316,448 gas |
| Registry submission calldata | 452 bytes |
| Verifier / registry deployed bytecode | 15,856 / 2,336 bytes |

Observed rejection probes: wrong frozen group root, wrong scope, swapped ballot digest, changed proof point, reused nullifier and submission after close. The registry recomputed the exact message for the first ballot on-chain and matched the proved value. `acceptedCount()` returned 3; all three ordered digest readbacks matched the public ballot files. Gas figures are local receipts on an ephemeral chain; no BSC receipt exists.

## ElectionGuard equations on EVM

ElectionGuard Python 1.4.0 uses ElGamal over a 4096-bit prime subgroup and Chaum-Pedersen-family ballot/decryption proofs ([source group type](https://github.com/Election-Tech-Initiative/electionguard-python/blob/1.4.0/src/electionguard/group.py), [ElectionGuard verification concept](https://electionguard.vote/concepts/Verifiability/)). Semaphore uses BN254 Groth16 and the EVM pairing precompile. These proof representations and groups are distinct. The EVM modular-exponentiation precompile could assist ElectionGuard equations, but a complete reviewed Solidity verifier, gas profile, calldata layout and bytecode are **not available in this investigation**. Full on-chain verification is **NOT VERIFIED**; no ElectionGuard on-chain gas number is asserted.

| Architecture | Enforcement | Finding |
| --- | --- | --- |
| A: Full on-chain | Semaphore plus ElectionGuard ballot, binding, aggregation/decryption proofs | NOT VERIFIED. Would require a separately reviewed ElectionGuard verifier for the selected v0.95 equations and expensive 4096-bit operations. |
| B: Hybrid | Solidity membership, root/scope/message binding, nullifier uniqueness and immutable digest order; ElectionGuard-native off-chain checks | Local code executes. Invalid/unavailable ciphertext can consume a nullifier. A research 2-of-3 public verifier works locally but needs independent review and authenticated archive completeness. Public auditability does not imply automatic on-chain ballot validity. |

The accepted digest sequence can be compared to an external public record, but the chain stores only digests. A missing archive prevents tally reconstruction. A pre-submission API validation is bypassable by direct contract interaction. Resolving invalid-ballot acceptance requires a reviewed protocol rule, not just adding an API check.

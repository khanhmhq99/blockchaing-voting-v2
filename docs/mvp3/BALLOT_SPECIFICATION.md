# Research ballot statement v1

Status: research only, 2026-10-13. This specifies the two-candidate `BoundBallotProbe` and patched DAVINCI circuit; it is not a released protocol.

## Canonical election parameters

- Manifest bytes are exactly `abi.encode(uint8(1), uint64(electionId), bytes32[2]([candidateId0,candidateId1]))`: 128 bytes. `electionId` is nonzero; candidate IDs are nonzero and distinct. Their array order is the tally order. Re-encoding must reproduce the bytes exactly. The contract stores `keccak256(manifest)` and checks every submitted manifest against it.
- The ballot mode is fixed to `numFields=2, groupSize=2, uniqueValues=0, costExponent=1, maxValue=1, minValue=0, maxValueSum=1, minValueSum=1`. The circuit therefore permits precisely `[1,0]` or `[0,1]` among the active fields. The unit weight is 1 and DAVINCI `address` is 0. No identity address is in the ballot statement.
- One fresh independent BabyJubJub ElGamal public key `(x,y)` is frozen per election. The circuit checks prime-order subgroup and nonidentity for each accepted proof. Contract constructor range checks alone do not prove the key usable; deployment validation must prove its generation and possession separately.
- Let `F = 21888242871839275222246405745257275088696311157297823662689037894645226208583`. Every public signal and ciphertext coordinate is an integer in `[0,F)` with no modular reduction of caller bytes. `processId` and `electionScope` are the first canonical field values among `keccak256(abi.encode(label, block.chainid, address(this), manifestHash, uint256(counter)))`, counter 0 through 255, for labels `HCMUT-MVP3-PROCESS-V1` and `HCMUT-MVP3-SCOPE-V1`. Failure to find one reverts.

## Ciphertext, hash and proof statement

The circuit has 16 fields. Each ciphertext field is four field elements `(c1.x,c1.y,c2.x,c2.y)`. The first two are ordered by the manifest candidate IDs. All 14 padded plaintext fields are zero, and **all 16** ciphertext fields must equal ElGamal encryptions under the same key and circuit-derived per-field randomness. Padded ciphertexts are accepted public evidence but excluded from the two-candidate tally.

`inputs_hash` is the circuit's existing `MultiPoseidon` over exactly 71 field values in this order: `processId`, `packedBallotMode`, `key.x`, `key.y`, `address=0`, `voteId`, 16 four-coordinate ciphertexts in index order, `weight=1`. It hashes four 16-field chunks and one 7-field chunk, then hashes those five outputs with Poseidon(5). The candidate IDs, election ID, chain and contract address are bound indirectly through the frozen manifest and `processId`; they are not direct Poseidon inputs.

The patched circuit exposes 72 Groth16 public signals in generated-verifier order: `0=mode`, `1=address`, `2=weight`, `3=processId`, `4=voteId`, `5=key.x`, `6=key.y`, `7..70=16 ciphertexts x 4 coordinates`, `71=inputs_hash`. The contract constructs signals 0..70 from frozen state and the submitted ciphertext, takes signal 71 from the Semaphore message, and verifies the ballot proof. The circuit constrains this message to the exact 71-field hash. The contract then checks the fixed root and election scope and calls Semaphore validation; only a successful transaction consumes the nullifier and emits `BallotAccepted(nullifier,voteId,inputsHash,manifestDigest,ciphertext)`.

The proof ciphertext field encoding is fixed-width `uint256[4][16]` in Solidity ABI. Manifest, key, process and scope are immutable for a deployment. The 72-signal verifier and patched witness/zkey are incompatible with upstream three-signal artifacts. The local research verifier has an untrusted phase-two setup and must not be deployed as an election verifier.

## Accepted-set interpretation

An accepted record is one `BallotAccepted` log from a successful canonical `accept` transaction addressed to this contract on the selected chain, at a block satisfying the election finality rule. Reconstruct from a fixed start and end block, verify receipt status, block hash, transaction destination/calldata and event equality, deduplicate nullifiers, and reject any missing or conflicting record. Reorgs require replay from a safe checkpoint. Sum only candidate fields 0 and 1 using BabyJubJub group addition. The tally count must equal the accepted record count. A tally without a checkable aggregate-decryption proof is **not publicly verified**.

The local probe checks two accepted records and their transaction/event equality but has no production finality rule, chain-wide indexer, or public decryption proof. Those are release blockers.

# ElGamal, membership proofs and verifier compatibility evaluation

Status: document-level evaluation on 2026-10-11. ElGamal aggregate tally and single-holder custody are selected; no SDK, curve, circuit or artifact version is approved or installed. This review does not establish integration security.

## Established implementation candidate

ElectionGuard is the first candidate family: its design is described in a peer-reviewed [USENIX Security 2024 paper](https://www.usenix.org/conference/usenixsecurity24/presentation/benaloh), with [official specifications](https://electionguard.vote/spec/) and [reference implementations](https://electionguard.vote/develop/Repositories/). A reviewed design is not evidence that every SDK revision or this new composition has been audited.

The [Python reference repository](https://github.com/Election-Tech-Initiative/electionguard-python) provides implementation and verifier components. Its [ElGamal source](https://raw.githubusercontent.com/Election-Tech-Initiative/electionguard-python/main/src/electionguard/elgamal.py) exposes exponential encryption, homomorphic accumulation and secret-key decryption; its [proof source](https://raw.githubusercontent.com/Election-Tech-Initiative/electionguard-python/main/src/electionguard/chaum_pedersen.py) includes selection-validity and Chaum-Pedersen proof checks. These moving-branch sources were inspected only as feasibility evidence; freeze an exact revision before use. Python is useful as a reference/vector oracle, not a reason to move client plaintext encryption to a backend.

The [verifiability documentation](https://electionguard.vote/concepts/Verifiability/) explains proofs of allowed selections, homomorphic tallying and correct decryption. This matches the required categories of evidence, but its election format and workflows must be checked against this project's exact-one rule and single-holder setup. Do not assume a supported one-guardian configuration, SDK/spec parity, browser runtime or EVM verifier without testing. Do not claim ElectionGuard compliance for a modified subset.

## Compatibility assessment

| Interface | Finding / inference | Unresolved gate and evidence |
| --- | --- | --- |
| Vote encoding | Additive tally needs exponent/point encoding with bounded count recovery, not multiplication of raw candidate identifiers | Pin group/parameters and count bounds; check one-hot exact-one proof, empty election, maximum total and no modular wraparound |
| Anonymous membership | [Semaphore v4](https://docs.semaphore.pse.dev/guides/proofs) binds a message to group membership and exposes a scope-based nullifier | Fix one election scope and frozen root; specify canonical ballot digest and library-compatible message encoding; reject alternate scope/root/digest |
| Proof composition | Membership and ballot validity can be separate statements bound to identical data; matching library names is insufficient | Prove/test all public-input bindings across browser, contract and CLI; do not simply truncate or reduce incompatible integers without a reviewed encoding argument |
| Group/field compatibility | An ElGamal group's arithmetic need not be native to the selected SNARK field or EVM | Benchmark supported verification algorithms/precompiles, calldata and gas; a curve swap changes proof/security assumptions and needs review |
| Ballot validity enforcement | API preflight cannot replace canonical acceptance checks | MVP 3 must enforce reviewed validity on-chain under the current design; if infeasible, obtain an explicit verifiable acceptance redesign, not a silent backend filter |
| Browser client | Reference Python/native code alone does not establish browser-safe encryption/proving | Evaluate maintained reviewed browser/WASM bindings, secure randomness, worker isolation, artifact integrity, memory and target mobile performance |
| Single-holder decryption proof | Need a proof of correct aggregate decryption, not an admin signature | Verify supported reviewed proof API/transcript for the frozen key, aggregate and bounded totals; never invent proof equations or disclose the secret |
| Setup and audit scope | Design publication, reference source and package installation do not establish audited composition | Identify exact SDK/spec versions, licenses, security advisories, audit scope and setup hashes; use known-answer/differential vectors and specialist review |
| Threshold extension | Versioning can retain a path to distributed custody; current holder has full secret | New election/key ceremony, reviewed DKG/partial proofs and threshold combine; no retrofit claim for old elections |
| Public verification | Deterministic evidence reconstruction and mathematical checks are required | MVP 4 CLI operates without identity login, private keys or privileged APIs; schema, dataset completeness and adversarial fixtures must be tested |

Conclusion: evaluate ElectionGuard implementations first, retain Semaphore v4 as the membership candidate, and do not freeze a concrete library/curve combination until the above gates pass. There is no implementation benchmark or exact-version audit claim in this review. If no reviewed browser/EVM-compatible composition fits, report the limitation and revise the architecture explicitly rather than implement primitives from scratch.

## Privacy and correctness limitations

An election private key holder can decrypt any individual ciphertext encrypted under that key. Decrypting only aggregates in normal operation limits application behavior, not the holder's cryptographic power. Key loss prevents tally; later key compromise reveals previously published encrypted votes. Keep independent keys per election and record backup/retention procedures without publishing secrets.

Encryption does not provide eligibility or uniqueness. A membership proof does not establish ballot validity. Correct decryption does not prove completeness of the accepted set. Even all those checks together do not prove honest issuance, cast-as-intended on a compromised device, freedom from coercion, or anonymity against timing analysis. Public verification preserves confidentiality only under the declared client, key-custody and cryptographic assumptions.

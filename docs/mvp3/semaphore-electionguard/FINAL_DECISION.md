# Pre-migration decision

**CONDITIONAL GO for further isolated research; NO migration approval.** The hybrid Semaphore + ElectionGuard Python v0.95 path is technically demonstrable with real local proofs, a genuine 2-of-3 native tally across three separate guardian processes and a separate public-record verifier using upstream primitives. The selected source verifier throws on 2-of-3 compensated shares **and accepts an altered final tally integer in a 3-of-3 record**; the research verifier handles the local 2-of-3 record and rejects a forged share, changed count and omitted ballot. Independent review, separate-host/operator guardian custody, invalid-ballot acceptance policy, browser-side ElectionGuard encryption and license/dependency clearance remain open. The existing MACI application remains the product baseline. Full-on-chain ElectionGuard verification is **NOT VERIFIED**.

## Decision matrix

| Criterion | Current MACI v3 local baseline | Semaphore + ElectionGuard full on-chain | Semaphore + ElectionGuard hybrid candidate |
| --- | --- | --- | --- |
| Voter anonymity | Anonymous-oriented MACI key workflow; database/coordinator metadata linkage known | Semaphore membership can hide which group member; issuer and metadata still matter | Three real proofs passed; issuer/metadata separation not implemented |
| Ballot secrecy | Coordinator key can read individual commands | Threshold could protect from a single holder if guardian isolation works | Native 2-of-3 tally with distinct local processes; same host/parent controls all workers |
| Coordinator/trustees | One coordinator controls processing key/progress | Three guardians plus on-chain proof rules envisioned | Three guardian keys, quorum 2, separate processes; independent operators/custody missing |
| Eligibility | Sponsored MACI registration policy locally exercised | Semaphore issuer plus root policy required | Group membership enforced locally; one-person issuance untested |
| Double voting | MACI registration/message rules; vote updates permitted | Election nullifier would enforce one ballot | Duplicate nullifier rejected on-chain in local registry |
| Tally verifiability | Local MACI processing/tally proofs accepted by Solidity; M0 audit open | ElectionGuard Solidity verifier unbuilt | Native aggregation and separate public 2-of-3 verifier pass locally; source verifier throws and accepts a changed 3-of-3 final count |
| On-chain ballot validity | MACI processing proof path; review gates remain | Required, not demonstrated | **Not enforced**; invalid ciphertext can consume nullifier |
| Gas | Existing MACI local benchmark ledger | Unknown; no ElectionGuard Solidity path | 316k–334k local ballot gas; four chain-97 creation estimates, no BSC ballot estimate |
| Licenses | MACI review deferred/open | Semaphore/ElectionGuard direct MIT but GPL/LGPL transitive review required | Same GPL `snarkjs` and LGPL `gmpy2` obligations; redistribution blocked |
| Dependency risk | MACI root audit reports high advisories | New verifier/dependency graph unknown | Npm audit 9 high/5 moderate; pip-audit one duplicated Pydantic advisory; reachability partial |
| Implementation complexity | Existing working application | Very high: 4096-bit proof verification Solidity | High: browser packaging, archive, verifier, guardian governance and issuer policy |
| Academic reproducibility | Existing full local app and proof evidence | No reproducible implementation | Isolated pinned scripts, public-record verifier and local accepted-set byte comparison; independent review and authenticated BSC checkpoint absent |

## Conditions before any migration decision

1. Review and harden the separately executable ElectionGuard v0.95 research verifier. It accepts the local **compensated 2-of-3** record and rejects forged share, changed final count and omitted ballot in externally modified public records without private keys. Test added records and more adversarial mutations; bind the complete accepted set to authenticated chain data. The source `verify_decryption` still fails these properties by itself. Do not mix Core 2 with Python v0.95 by assumption.
2. Move the three local guardian workers to independently controlled storage and operators; authenticate/limit share requests. The PoC has distinct process memory, a denied private accessor, two single-guardian failures and all three working 2-of-3 pairs, but the same parent/host can still command all workers. A single machine administrator remains outside the secrecy claim.
3. Resolve protocol admission for invalid/unavailable ciphertexts that can consume a nullifier in the hybrid contract. Define who can accept/reject, how censorship is detected, and whether replacement changes one-ballot semantics. Avoid claiming on-chain ElectionGuard validation without an actual verifier.
4. Demonstrate client-side ElectionGuard ballot encryption in an audited browser/WASM package without sending plaintext choice to NestJS. Design one-identity-per-voter issuance and separate identity/ballot privileges/logging.
5. Complete GPL/LGPL/native-library license obligations, package security triage, artifact provenance and read-only BSC compatibility. A testnet deployment remains a separate guarded decision; no transaction is authorized by this report.

The local experiments justify continued feasibility work, not replacing MACI. [Progress](PROGRESS.md) states the next executable task and exact observed exit results.

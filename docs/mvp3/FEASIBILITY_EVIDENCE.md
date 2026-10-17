# MVP 3 isolated cryptographic feasibility evidence

## 2026-10-14 owner workstation phase-two contribution

The original locally generated `ballot_final_pkey.zkey` was treated as `0000`: a no-contribution setup key. `research/mvp3/prepare-owner-ceremony.mjs` checked the pinned R1CS/ptau/0000/WASM/patch SHA-256 values, mixed fresh OS CSPRNG entropy with snarkjs randomness without logging or storing it, and generated `ballot_0001.zkey` with SHA-256 `6c82e0875a255359c8823bdc2cf299bfe95385706be915f384124d9dbf3419cd`. Its public contribution hash is `34e053f7619fda67a337b3a3edaec34e169ad75ec4eb80e46585a73de7dba84c98186548cf0ff011b160ab76ea70455f44830f129a96d2427d097b114d5bd606`. The helper verified it against the R1CS and ptau; a separate `snarkjs zkey verify` exited 0 and printed `contribution #1 Owner workstation 1 (automated)` and `ZKey Ok!`. The first helper invocation produced and verified the artifacts but retained a snarkjs worker handle; it was interrupted after output. An idempotent rerun exited 0, verifying all handoff hashes without regenerating a contribution. The separate CLI verification exited 0. The handoff manifest SHA-256 is `376aa42affe97aa1154fb94d81084cb24c2ec810cb65a2b0198c5c4f5c34e2e2`.

The earlier owner-only observation is superseded by the [returned-key and beacon record](TRUSTED_SETUP.md). The received `ballot_0002.zkey` and the final beacon key both passed `snarkjs zkey verify` against the pinned R1CS and ptau. The second contributor sent only the file; separate hash reporting and confirmation of independently controlled entropy are still absent. The first `snarkjs powersoftau verify` on the 302 MB ptau was interrupted after more than eight CPU-active minutes without result (exit 1); full phase-one transcript validation is **not yet claimed**. The prior local binding measurements used `0000`; final-key measurements follow below. No testnet transaction or `.env` update occurred.

A second full ptau verification attempt remained CPU-active for approximately 30 minutes, emitted no success/failure result, and was interrupted (exit 1). This does not validate or disprove the phase-one transcript; independent completion remains a setup prerequisite.

### Source-rights and focused security-review continuation

The pinned DAVINCI commit has no license/notice file, package license field or source-level grant found by the [recorded inspection](SOURCE_AND_CIRCUIT_REVIEW.md). The public npm package query returned 404. No redistribution permission can be asserted from another Vocdoni repository's AGPL license or from public visibility. Written clarification is required before any further sharing or publication of the modified source and derived artifacts. Draft [rightsholder](DAVINCI_PERMISSION_REQUEST.md) and [independent circuit-review](CIRCUIT_REVIEW_REQUEST.md) requests were prepared, not sent.

`node research/mvp3/audit-public-signals.mjs` exited 0, matching every one of the first 72 `.sym` entries and the final vkey's `nPublic=72`, `IC.length=73`. `circom2@0.2.23 --inspect` exited 0 but warned that `MaskGenerator.control.out` is not in parent constraints because a signal-valued `assert` is not an R1CS constraint; other circomlib intermediate-signal warnings were also emitted. The fixed two-candidate public mode and `valid_fields === num_fields` yielded no demonstrated accepted-statement bypass, but this is not an independent audit. A focused final-key Hardhat rerun exited 0 with `wrongPaddedCiphertext=true` and `wrongCandidateOrder=true`, adding targeted rejection of altered padded ciphertext and a canonically encoded manifest with reversed candidate IDs. First/second accepted-vote gas in this synthetic run was 1,053,297/1,053,261, full calldata 2,948 bytes. No circuit source or artifacts were changed by this review.

### Final beacon artifact and focused revalidation, 2026-10-14

The [precommitted drand round](BEACON_PLAN.md) `6551994` produced BLS-verified randomness `3cbd1bce0ee8d8dc15c288de01434b61987fc5f47e1a4fda43d98e2fbcdb9e66`. Two relays matched; the complete [public relay evidence](BEACON_EVIDENCE.json) was captured. `drand-client@1.4.2` was installed with exact top-level pin into the ignored ceremony tool directory (`npm install --ignore-scripts`, exit 0, audit 0 vulnerabilities). `snarkjs@0.7.6 zkey beacon` with iteration exponent 20 exited 0. A separate final-key `zkey verify` exited 0, printed the pinned circuit hash and contributions #1, #2 and #3, then `ZKey Ok!`. The final zkey is 77,964,745 bytes, SHA-256 `770e608bde16f587eb8e59c997c330bc69026f2610d336704b9b5e5a81ba30a6`. `zkey export verificationkey` and `zkey export solidityverifier` both exited 0; final vkey is 15,911 bytes, SHA-256 `c26ed7229f603c2b484fa57437dbf7216a3e9efa6fee67334898f6ff1546bf2e`, 72 public signals; final Solidity verifier source is 35,003 bytes, SHA-256 `32172fc4d577ba41287aff7e806d471a17edc49c3647e8de2952e921e9c20975`.

`MVP3_BALLOT_ZKEY`, `MVP3_BALLOT_VKEY` and `MVP3_BALLOT_VERIFIER` process variables pointed the existing `verify-bound-chain.mjs` at these final ignored artifacts. `node --import tsx research/mvp3/verify-bound-chain.mjs` exited **0** on local Hardhat chain 31337 with `solc@0.8.37`, EVM `cancun`, 72 signals, complete calldata **2,948 bytes**, accepted-vote gas **1,053,345** and **1,053,309**, and ballot-verifier deployment gas **1,798,888**. A second run to record bytecode hashes also exited 0, with accepted-vote gas **1,053,369** and **1,053,261** for different synthetic ciphertexts. The compiled final verifier creation-code Keccak-256 was `0x9f338be44dd700ab830ae26b957909efbb5fae0b0ae201cf2495fdbb39954a7f`; runtime-code Keccak-256 was `0x337772bf53bb4b49c97881596be3ce327107e3049675c7361b25af60c63e8b63` (8,082 runtime bytes). It accepted and reconciled two synthetic ciphertext records, obtained aggregate `[1,1]`, and rejected altered ciphertext, noncanonical field, manifest, scope, root, proof, vote ID, membership message, public key, duplicate/cross-deployment nullifier and invalid ballot/padding vectors. This revalidates the binding and local recording under the final verifier; internal decryption still lacks a public decryption proof. Edge 155 headless `browser-proof.mjs` with the final zkey exited 0: one ballot proof took **5,186.7 ms**, heap after proof **302,980,710 bytes**, 72 signals, 722-byte proof. This is one desktop run, not a mobile bound. No BSC execution or deployment occurred.

## 2026-10-13 final local revision: padded fields, canonical manifest and accepted-set tally

The first public-signal adaptation exposed a real underconstraint: a two-candidate witness containing a nonzero third plaintext field still produced a proof. The focused `probe-padding-gap.mts` exited 0: old proof generation succeeded; revised witness generation rejected the same invalid selection. The final [two-file patch](../../research/mvp3/ballot-public-signals.patch) exposes 72 public signals **and** forces all inactive plaintext fields to zero and all 16 ciphertexts to match ElGamal encryption. The patched circuit has 125,194 nonlinear and 14,550 linear constraints. The manifest is now an exactly 128-byte canonical ABI encoding of version 1, nonzero election ID and two distinct, nonzero ordered candidate IDs. See [ballot specification](BALLOT_SPECIFICATION.md).

| Final local research artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Two-file patch | 1,338 | `8b948152b2abdb4d9447f8d4d0b5e8701c4518de637b09b7a12ae17ac2e243d9` |
| R1CS | 27,810,460 | `42081cdba74a1e0cce3b688fcc23fc4b7399b278be7995b7b0be8af7d4bcdd10` |
| Witness WASM | 7,184,599 | `f472e9583cc88f1cb0ffed435bd9c43479690d16f0001c01768a946a417e6e4c` |
| Phase-one ptau | 302,083,218 | `9693220206afab749e3d88d4ab5fdf5d36120ea102e7e587ccea0e7a5208e711` |
| **Untrusted** local zkey | 77,963,444 | `8805314124beabe73f21a902d8823e7f45742aba0954735649b0c8b7743d12a8` |
| Local vkey | 15,911 | `3c72a675ad7c86fbba2dfaca9e9297fab9c9182a7fde90cf3ade55717d46c604` |
| Generated Solidity verifier | 35,003 | `87cfa5cd1ab2b5436404294b7e404c7f356ff6f57c38813339414360db82beed` |

`snarkjs zkey verify` against the revised R1CS and ptau exited 0 and printed circuit hash `fc26682b66eb5f71597a56683abb58c618340528923761b1fd8ffe407b343ae50c29e355010a6e1748d4d321f9a306e4a17195718481b65b3678ed12c8380069`. This is an integrity check, **not** an independent phase-two ceremony. [Ceremony plan and blocker](TRUSTED_SETUP.md).

The final `node --import tsx research/mvp3/verify-bound-chain.mjs` run exited 0 in a normal Windows environment after sandbox `uv_os_get_passwd` failed. On local Hardhat 31337 with solc 0.8.37, Cancun, optimizer 200, two different synthetic Semaphore members submitted valid ballots. Both transactions succeeded; their receipts, canonical block hashes, destination, decoded calldata and ciphertext events were reconciled. Aggregating candidate fields 0 and 1 from exactly those two accepted records with `circomlibjs` and decrypting the aggregate with the synthetic election key gave `[1,1]`, matching count 2. Focused internal checks detected an omitted record, a duplicated added record, a substituted count and a wrong decryption key. This is **internal** decryption only; public correctness evidence is [still blocked](TALLY_VERIFICATION.md).

| Final observed local probe | Value |
| --- | ---: |
| Node input construction / ballot proof / Semaphore proof for first ballot | 358.42 / 5,257.83 / 176.89 ms |
| Complete acceptance calldata, including 16 ciphertexts and manifest | 2,948 bytes |
| Accepted vote gas, first / second | 1,053,333 / 1,053,309 |
| PoseidonT3 / Semaphore verifier / ballot verifier deployment gas | 3,614,580 / 3,716,011 / 1,798,864 |
| Semaphore / bound research contract deployment gas | 1,793,629 / 707,371 |
| Ballot verifier / bound runtime bytecode | 8,082 / 2,872 bytes |

Altered ciphertext, noncanonical coordinate, altered manifest/scope/root/proof/vote ID/Semaphore message/key, duplicate nullifier and cross-deployment replay were rejected by focused simulations. Missing, multiple, out-of-range and nonzero-padded selection witnesses were rejected. Concurrent duplicates and reorg replay remain untested. [Edge headless proof](BROWSER_BENCHMARK.md) exited 0 at 5,559.60 ms with 320,951,881-byte JS heap after proof; this is one desktop run, not a mobile bound. There was **no BSC transaction or fork-equivalent probe**. Source/license/security review, independent phase-two contribution and public aggregate-decryption proof remain blocking; therefore no testnet deployment, `.env` change, ABI integration or product-facing Checkpoint 1 was performed.

## Earlier binding follow-up: superseded public-signal-only circuit

The following section records the earlier public-signal-only circuit before the padding flaw was found. Its hashes and measurements are historical and **must not** be used with the final patch.

The owner authorized a research-only contract adaptation. Inspection of upstream `ballot_proof.circom` and `builder.ts` found `inputs_hash = MultiPoseidon(71 fields)`: `process_id`, packed ballot mode, public key X/Y, `address`, `vote_id`, all 16 ciphertexts in `(c1.x,c1.y,c2.x,c2.y)` order, then `weight`. MultiPoseidon hashes four 16-field chunks and one 7-field chunk, then Poseidon(5) over those five hashes. The circuit constrains the hash and exact-one active selection. The election manifest, chain ID and contract address are **not direct circuit inputs**. The circuit checks the public key's prime-order subgroup and non-identity, but only active ciphertext fields are checked against encryption; padded ciphertexts must be excluded from tally. A production specification must define their canonical treatment.

Contract-only adaptation was insufficient: the published proof exposes only address, vote ID and `inputs_hash`, while the installed `circomlibjs` Solidity Poseidon generator supports at most 8 inputs and cannot reconstruct this exact Poseidon(16) tree without a new reviewed EVM implementation. The minimum research circuit change in [`ballot-public-signals.patch`](../../research/mvp3/ballot-public-signals.patch) makes its already constrained process ID, mode, key, 16 ciphertexts and weight public. It does not change ElGamal or the MultiPoseidon constraint. New R1CS/WASM/zkey/vkey/Solidity verifier artifacts are **mandatory**; old proofs and verifier are incompatible. The patched circuit has 72 public inputs, 125,194 nonlinear and 14,534 linear constraints.

[`BoundBallotProbe.sol`](../../research/mvp3/BoundBallotProbe.sol) constructs the 72 signals itself from a frozen two-candidate exact-one mode, unit weight, zero DAVINCI address, immutable election key and process ID, caller vote ID and complete 16-field ciphertext. It takes the final hash from the Semaphore message, then checks the revised ballot proof, frozen root, deployment-specific scope and manifest bytes before consuming the nullifier and emitting `BallotAccepted` with ciphertext. The circuit now verifies that this hash equals the exact public record; the caller cannot submit an unverified hash. Both process ID and scope use explicit rejection sampling into the BN254 field from a domain tag, chain ID, contract address and frozen manifest digest. The constructor freezes `keccak256(manifest)`; the manifest bytes are checked on every call and are available in deployment calldata. The immutable key and mode are available through contract getters. This is a two-candidate research configuration, not a general election contract or audit result.

Local artifacts used `circom2@0.2.23` (WASM wrapper around Circom 2.2.3), `circomlib@2.0.5`, `snarkjs@0.7.6`, `solc@0.8.37`, Semaphore core/contracts 4.14.3 and the DAVINCI source commit recorded below. The compiler and circuit library declare GPL-3.0; the exact source-license and combined-distribution decision remains open. The revised proving key came from `snarkjs groth16 setup` using the upstream phase-one Powers of Tau. **No independent phase-two contribution or beacon was performed. This proving key is unsafe to trust for any election, including testnet acceptance claims.** Artifact hashes (SHA-256):

| Revised research artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| Public-signal patch | 445 | `7d00d4785cdb0a7d61d43823a9d6a627eac4ded1f89821e69459f02adc50e0ac` |
| R1CS | 27,809,244 | `33bf4d3abe3509c893833d019b029625730d3010ec49ef17193c8df8602b354e` |
| Witness WASM | 7,184,476 | `e07ce8002caf0fd76fa04469eef1467615786887fba15f0b701ae9a4a9ab3cc5` |
| Phase-one ptau | 302,083,218 | `9693220206afab749e3d88d4ab5fdf5d36120ea102e7e587ccea0e7a5208e711` |
| Local zkey | 77,967,860 | `717d3d6e32d19241d5c5cc86ee3eb0935d39f47a64ae09c145ecdeb92e619ff6` |
| Local vkey | 15,905 | `5f6aa7ecd60403f8f8434ff093c700f3a1c47f7faa80103c37cab68be045b007` |
| Generated Solidity verifier | 34,997 | `28b78d75a3bde6fbe78489d69b7e4b1ed226ae229fb50b5a0add502e2bb88cd4` |

The final `node --import tsx research/mvp3/verify-bound-chain.mjs` run exited **0** on local Hardhat 31337, solc 0.8.37, Cancun, optimizer 200. It generated a real revised ballot proof and real Semaphore proof; the accepted transaction emitted one exact matching ciphertext event. Focused pre-acceptance simulations rejected changed ciphertext, noncanonical ciphertext coordinate, changed manifest, wrong root/scope, corrupted ballot proof, changed vote ID, changed membership message, and a ballot proved under another public key. A second contract rejected the first contract's scope; a post-acceptance duplicate nullifier was rejected. Missing `[0,0]`, multiple `[1,1]` and out-of-range `[2,0]` selections failed witness generation. The different-key probe changes both key and encrypted record, so it proves frozen-key enforcement for that ballot, not isolation of a single changed coordinate. Concurrent duplicate submissions, aggregate tally/decryption, browser proving and BSC execution were not tested.

| Observed latest local run | Value |
| --- | ---: |
| Encryption input construction | 349.81 ms |
| Revised ballot proving | 5,229.54 ms (Node; browser not measured) |
| Semaphore proving | 174.81 ms (Node) |
| Ballot proof JSON / Semaphore proof JSON | 725 / 1,032 bytes |
| Complete `accept` calldata, including 16 ciphertexts and manifest | 2,884 bytes |
| Accepted vote transaction including ciphertext event | 1,052,904 gas |
| PoseidonT3 / Semaphore verifier / ballot verifier deployment | 3,614,580 / 3,716,011 / 1,798,048 gas |
| Semaphore contract / bound research contract deployment | 1,793,629 / 648,975 gas |
| Revised ballot verifier / bound contract runtime bytecode | 8,078 / 2,630 bytes |

These are local observations, not BSC cost estimates. The full calldata includes proof and all 16 ciphertexts; on-chain event storage and nullifier consumption are included in vote gas. No testnet balance check, deployment, ABI integration or `.env` update was appropriate because the full cryptographic gate still fails on setup provenance, source/license review, compatible verifiable aggregate decryption, browser measurements and BSC compatibility. The existing deployment key and secret values were not read or printed; only environment variable names and the ignored status of `.env` were inspected. Existing MVP 1/2/2.5 flows remain untouched.

Reproduction from a clean DAVINCI clone: apply the pinned patch, install exact `circom2@0.2.23 circomlib@2.0.5` only in that ignored clone, run `circom2/cli.js circuits/ballot_proof.circom --r1cs --sym -o . -l circuits -l node_modules` from the clone root, then run `node ../compile-public-circuit.cjs` there for witness WASM. On Windows, the npm CLI failed to write witness WASM, while its programmatic runner succeeded; the runner skips an existing pinned-hash WASM to avoid an observed re-run hang. Download the phase-one ptau URL in upstream `prepare-circuit.sh`, check its hash, run `snarkjs groth16 setup`, then export vkey and Solidity verifier. The zkey is local setup output and may vary; verify a generated proof against its own vkey. Run `verify-bound-chain.mjs` with `node --import tsx` from the repository root. The research-only verifier and artifact files stay under ignored `davinci-circom/`; do not copy them into deployed packages.

## Earlier three-signal baseline probe

Recorded 2026-10-13, Windows, Node 24.21.0, npm 11.19.0, local Hardhat chain 31337. Base repository revision `4566b4f07a2d3653e16bca4a24c18aba675af03c` with the uncommitted research scripts under `research/mvp3/`. All voters, groups, ballots and keys were synthetic; no Supabase or public network was used. This is a focused research probe, not an automated test suite or a production verifier.

## Inputs, versions and artifact provenance

| Item | Exact version / SHA-256 | Provenance and limitation |
| --- | --- | --- |
| [Semaphore core](https://github.com/semaphore-protocol/semaphore/releases) and contracts | npm 4.14.3 each; MIT | Local install only under ignored `research/mvp3/semaphore-probe`. Core's proof helper selected 4.13.0 depth-2 artifacts. Published contracts, not a project-specific audit. |
| Semaphore depth-2 wasm | `877a989a8881ff6651866cfa32088f60e4abcb02a26f2e995868dfabd7f9385b` | 1,801,079 bytes, downloaded in temporary snark artifact cache. |
| Semaphore depth-2 zkey | `110e2d9de78730aa4f5c78c75017cfe4d769b4b7ce60f58484fb14733d7b0f35` | 1,653,555 bytes. Artifact source/version mapping needs verification before adoption. |
| [DAVINCI circuit repository](https://github.com/vocdoni/davinci-circom) | commit `a39a9f9867bb70726ad2137ed536d75670e042b9` | Cloned under ignored `research/mvp3/davinci-circom`. No clear circuit repository license file or phase-2 contribution record was found. |
| DAVINCI ballot wasm | `07ecaef89f730cd4a3ee0355821a1fee4eb235fe8934f3c4bf24744bf1c7e4d5` | 6,791,871 bytes from upstream artifacts. |
| DAVINCI ballot zkey | `4fa825ca364142b066f4a905564f54ed9ff330e6b748c517d08708f866eedf1e` | 37,228,548 bytes from upstream artifacts; setup trust not established. |
| DAVINCI vkey JSON | `129e828262d46b713d1e940ecfef8950c1ee18707666caf7fe8107749f844af2` | 3,394 bytes from upstream artifacts. |
| Generated Solidity Groth16 verifier | `4e1139257fc6b4880d59919d3d57a7cc3cdac95df382e228ce62c3d4c585698f` | Generated with `snarkjs@0.7.6` from that vkey; SPDX GPL-3.0. Kept out of product packages. |
| Research JavaScript dependencies | `circomlibjs@0.1.7`, `ffjavascript@0.2.63`, `snarkjs@0.7.6`; Solidity `solc@0.8.37` | Installed only in ignored research directories with no root lockfile change. `snarkjs` and `circomlibjs` declare GPL-3.0. Recheck release support, audits and license compatibility before adoption. |

The upstream DAVINCI webapp lockfile audit (`npm.cmd audit --package-lock-only --json --omit=dev`) exited 1 with 34 production findings (11 high, 5 moderate, 18 low). Its webapp was not installed or used for browser measurements. This audit is not a security assessment of the circuit.

## Observed focused probes

| Probe | Observation | Exit |
| --- | --- | --- |
| `probe-davinci-valid.mts` | Exact-one synthetic `[0,1]`, 2 candidates, BabyJubJub ElGamal, 16-field circuit; proof generated and off-chain verified. Encryption input construction 386.54 ms; proving 2,860 ms; verification 14.03 ms; proof JSON 724 bytes. Node runs varied (first 2,815 ms proving, 374.6 ms input construction). | 0 |
| `probe-davinci-invalid.mts` | `[0,0]`, `[1,1]`, `[2,0]` and mutated ciphertext witness all rejected during proof generation. These are circuit witness failures, not contract acceptance checks. | 0 |
| `probe-semaphore.mjs` | Three synthetic identities, depth-2 group, proof with message equal to DAVINCI public hash. Identity generation 70.22 ms, group 0.539 ms, warm-cache membership proving 360.95 ms, off-chain verification 16.05 ms, proof JSON about 1,034 bytes. Cold run proving 2,468 ms included artifact fetch. No identity secret persisted. | 0 |
| `verify-ballot-chain.mjs` | Real generated Solidity Groth16 verifier deployed on local Hardhat, solc 0.8.37, EVM Paris, optimizer 200. Latest deployment 390,425 gas; verification transaction 228,255 gas. Correct proof accepted and altered public hash rejected. Unchanged proof still verifies alongside altered ciphertext, key or packed-ballot-mode records because none is a verifier argument, demonstrating missing record authentication. The election manifest was not a contract argument either. | 0 |
| `verify-membership-chain.mjs` | Published Semaphore Solidity verifier + Semaphore group and generated DAVINCI verifier called through `CompositionProbe.sol` on local Hardhat, solc 0.8.37, EVM Cancun, optimizer 200. Root matched the off-chain tree. Correct composite accepted; wrong root/scope/message/hash and duplicate nullifier rejected. Composite transaction 500,070 gas; encoded calldata 772 bytes. | 0 |

The composite 772-byte calldata contains proof inputs, **not the ciphertext record**; it is therefore not a complete-vote calldata measurement. The public record JSON alone was 5,663 bytes in the latest run, but this is not a canonical calldata encoding. The wrapper cannot reject a changed ciphertext, key or manifest because those fields are absent from its function arguments. The mutation probe verifies the same proof with altered accompanying records; it does not claim that the altered records entered the contract. Mutating `inputs_hash` fails, but that does not establish binding of the hash to accepted bytes. Scope was a fixed synthetic chain/election string; deployment-address derivation and cross-election replay were not checked. Sequential duplicate rejection was observed; concurrent duplicate submissions were not measured.

Local deployment gas (Cancun run): PoseidonT3 3,614,580; Semaphore verifier 3,716,011; Semaphore contract 1,793,629; ballot verifier 385,717; composition wrapper 373,556. Direct membership validation 285,891 gas. Combined 500,070 gas includes membership nullifier consumption and ballot proof verification but no ciphertext authentication or accepted-record event. These values are observed on chain 31337, not estimates for BSC testnet. Browser proving time/memory, complete-vote calldata/gas, BSC fork parity, public deployment, tally aggregation/decryption evidence, network latency and finality are **not measured**.

## Reproduction

The committed-size probe sources are [under `research/mvp3`](../../research/mvp3/). Its `.gitignore` excludes third-party cloned source, dependencies, downloaded artifacts and generated synthetic proof records. Use the repository-local Node 24.21.0 and npm 11.19.0. Clone DAVINCI at the exact commit above into `research/mvp3/davinci-circom`, using its upstream `artifacts/`; install exact `circomlibjs@0.1.7 ffjavascript@0.2.63 snarkjs@0.7.6` in its `js` directory with `--no-save --package-lock=false --ignore-scripts --omit=dev`. Install Semaphore core/contracts 4.14.3 into `research/mvp3/semaphore-probe` in the same isolated manner. Generate `research/mvp3/ballot-verifier.sol` from the pinned vkey with `snarkjs zkey export solidityverifier`, then check its hash above. The root project provides Hardhat, viem, solc and tsx.

Run in this order: `probe-davinci-valid.mts`, `probe-davinci-invalid.mts`, `probe-semaphore.mjs`, `verify-ballot-chain.mjs`, `verify-membership-chain.mjs`. TypeScript scripts use `node --import tsx`; `.mjs` scripts use `node`. The Semaphore proof must be regenerated after regenerating the ballot proof because its message binds the new ballot hash. The local Hardhat probes spawn and stop their own chain. On this Windows setup, restricted-sandbox tsx/Hardhat calls failed due to `uv_os_get_passwd` or `ENOMEM`; the authorized normal Windows execution environment succeeded. No root dependency, lockfile or existing voting source was changed.

Equivalent reproduction commands, from the repository root in PowerShell, are:

```powershell
git clone https://github.com/vocdoni/davinci-circom.git research/mvp3/davinci-circom
git -C research/mvp3/davinci-circom checkout a39a9f9867bb70726ad2137ed536d75670e042b9
npm.cmd install --prefix research/mvp3/davinci-circom/js --no-save --package-lock=false --ignore-scripts --omit=dev --no-audit --no-fund circomlibjs@0.1.7 ffjavascript@0.2.63 snarkjs@0.7.6
npm.cmd install --prefix research/mvp3/semaphore-probe --no-save --package-lock=false --ignore-scripts --omit=dev --no-audit --no-fund @semaphore-protocol/core@4.14.3 @semaphore-protocol/contracts@4.14.3
node research/mvp3/davinci-circom/js/node_modules/snarkjs/build/cli.cjs zkey export solidityverifier research/mvp3/davinci-circom/artifacts/ballot_proof_pkey.zkey research/mvp3/ballot-verifier.sol
node --import tsx research/mvp3/probe-davinci-valid.mts
node --import tsx research/mvp3/probe-davinci-invalid.mts
node research/mvp3/probe-semaphore.mjs
node research/mvp3/verify-ballot-chain.mjs
node research/mvp3/verify-membership-chain.mjs
```

Use the verified repository-local Node/npm binaries where system `node`/`npm.cmd` resolve elsewhere. The research installs intentionally did not create a second lockfile; the top-level versions are exact, but transitive resolution is not fully frozen, another reason these are feasibility evidence rather than accepted reproducibility artifacts. Check the hashes above after downloads and generation.

## Security conclusion

The original local result established generation and Solidity verification of the two published proof types but failed accepted-record binding. The revised-circuit probe above adds local accepted-record binding without a new Poseidon implementation; it remains unsuitable for deployment because setup, review, tally evidence and target-environment gates are unresolved. The [decision record](DECISIONS.md) lists remaining blockers. Do not deploy `CompositionProbe.sol` or `BoundBallotProbe.sol` for real votes.

# Semaphore + ElectionGuard feasibility progress

Status: **F0 partial; F1 partial with isolated guardian processes and a separate public-record verifier; F2 local proof path demonstrated; F3 local hybrid path demonstrated; F4 partial. Migration is not authorized.** Updated 2026-10-17 Asia/Saigon. Base Git revision `4566b4f07a2d3653e16bca4a24c18aba675af03c` plus the owner's uncommitted MACI work. All experiments use synthetic records. No MACI source, managed database, or BSC state was changed.

## Recovery point

Pinned upstream source in ignored `research/mvp3/semaphore-electionguard/upstream/`:

| Component | Tag | Commit | Role |
| --- | --- | --- | --- |
| Semaphore | `v4.14.4` | `507866f91c53bfd262d942d772f5ec2994b8af69` | Selected proof and Solidity candidate |
| ElectionGuard Python | `1.4.0` | `d2f3d5fb0bffbbeedb54baf9474b2b80c7cd71d3` | Selected v0.95 cryptographic PoC |
| ElectionGuard Core 2 | `v1.91.18.2` | `9afcd5ca7d04e36c186f0b0cbc52ffb212608143` | Comparison only; README says pre-release/incomplete |
| ElectionGuard C | `v0.0.6` | `3115c412ece99dc5e19635995d049d4206bb217e` | Comparison only; older native build |

The **selected pair is a research candidate**, not cleared for redistribution or application migration. Core 2 and Python follow different ElectionGuard specification generations and their records/proofs have not been mixed.

## Observed local evidence

- `run_electionguard_probe.py` exited 0 under isolated official Python 3.10.11. Three guardian workers ran in distinct processes with ephemeral private-key memory and restricted IPC methods; a private-key accessor request was denied. Three valid encrypted ballots, native aggregation and all three 2-of-3 threshold quorum combinations ran. Choices `[0,1,1]` yielded `[1,2,0]` for each pair; guardians A and B separately failed the quorum check. Removing an input ballot and changing election scope were rejected. The reference `verify_decryption` throws `AttributeError` for a compensated 2-of-3 share **and accepts an altered published tally integer in a 3-of-3 record**. One machine administrator still controls all workers; durable independent key custody and separate operators are not demonstrated.
- `verify_public_record.py` exited 0 in a separate process with no private key input. It checked three guardian public records, three ballots, aggregation, direct and compensated share proofs, reconstructed the missing third share, recomputed `[1,2,0]`, and rejected a forged compensated share and modified final count. `probe_record_mutations.py` then changed six separate public record copies: forged share, altered final count, omitted ballot, wrong public key, altered ballot proof and duplicate ballot; all failed at the expected check. This research composition uses pinned upstream primitives; external review and broader mutation coverage remain open.
- `semaphore_probe.mjs` exited 0 with three real v4.14.4 membership proofs bound to the exact published `SubmittedBallot` byte digests. Three nullifiers were distinct. Non-member proof generation failed; altered message and scope failed off-chain verification.
- `run_local_chain.mjs` exited 0 on ephemeral Hardhat chain 31337 with the official Semaphore verifier and group contracts plus a research registry. Three real proofs were accepted. Root, scope, ciphertext digest, proof points, duplicate nullifier and post-close submissions failed. An ordered digest readback matched the proof inputs; `verify_accepted_set.mjs` separately matched those digests to exact public ballot bytes and rejected changed bytes. This snapshot is ephemeral, not a BSC audit checkpoint. Local gas and code sizes are in [Solidity compatibility](SOLIDITY_COMPATIBILITY.md).
- `bsc_readonly.mjs` exited 0 against BSC Testnet chain 97. It used `eth_chainId`, `eth_getBlockByNumber`, `eth_gasPrice` and `eth_estimateGas` for four creation transactions. No transaction was broadcast. See [BSC feasibility](BSC_FEASIBILITY.md).

## Gate state

| Gate | State | Unfinished requirement |
| --- | --- | --- |
| F0 license/version | CONDITIONAL | GPL/LGPL distribution obligations, native binary provenance, package advisories, artifact trust |
| F1 ElectionGuard | PARTIAL | Distinct guardian processes and separate public-record verifier pass locally; durable custody, separate operators, broader archive attacks and independent review remain |
| F2 Semaphore/binding | PARTIAL | Three real proofs and exact digest binding pass; issuer one-identity enforcement and full audit record do not |
| F3 Solidity | PARTIAL | Real local hybrid path passes; ElectionGuard proof verification on-chain is not implemented or gas-measured |
| F4 BSC/migration | PARTIAL | Read-only deployment estimates pass; no chain-97 call to a deployed verifier or complete throughput/cost study |

## Command and failure ledger

Run from repository root, with `.\.tools\node-v24.21.0-win-x64\node.exe` for JavaScript.

| Command or action | Exit | Observation |
| --- | ---: | --- |
| Four official `git clone --depth 1 --branch <tag>` calls | 0 | Exact commits above; source is ignored |
| `python -m pip download --only-binary=:all: electionguard==1.4.0` on Python 3.13 | 1 | No compatible Eel wheel |
| Python 3.13 import using selective dependencies | 1 | Mutable dataclass default rejected |
| Official portable Python 3.10.11 download/bootstrap and `pip install electionguard==1.4.0` | 0 | Portable archive SHA-256 `608619f8619075629c9c69f361352a0da6ed7e62f83a0e19c63e0ea32eb7629d`; get-pip SHA-256 `fb24e693bab954209a063d90953621412ccad4a500905a726286e038f508ddf6` |
| First ElectionGuard probe | 1 | Current `dacite 1.9.2` incompatible; pinned source-lock `dacite==1.6.0` |
| Second ElectionGuard probe | 1 | Source helper required `hypothesis==6.41.0`; installed in isolated runtime |
| Direct probe on Windows | 1 | Multiprocessing import recursion; guarded launcher added |
| First guardian-worker run | 1 | Launcher import path omitted; fixed before successful ceremony |
| First three-process run | 0 | Cryptographic path passed but upstream child logger printed synthetic encrypted-backup material; disabled child logging and restricted IPC methods before rerun |
| Final three-process ElectionGuard probe | 0 | Distinct processes; private accessor denied; `[1,2,0]` for all three 2-of-3 pairs; A/B alone fail; reference verifier `AttributeError`, 3-of-3 true, modified final count also accepted; 6,242 ms, summary-only output |
| Separate public-record verifier | 0 | No private keys loaded; 2-of-3 result `[1,2,0]`; forged compensated share and modified result rejected; 2,651 ms |
| External public-record mutation probe | 0 | Six copied file sets rejected at expected checks: forged share, altered count, omitted ballot, wrong public key, altered ballot proof, duplicate ballot |
| `npm.cmd install --prefix research/mvp3/semaphore-electionguard --save-exact ...@4.14.4` | 0 | 176 installed packages; no root lock change |
| `npm.cmd audit --omit=dev --json` in research package | 1 | 14 findings: 9 high, 5 moderate, 0 critical |
| `pip-audit==2.10.1` against exact Python runtime freeze | 1 | Two reports for Pydantic 1.9.0 under one advisory ID |
| First Semaphore proof run | interrupted | Printed success but left a Node handle open; explicit exit added |
| Final Semaphore proof run | 0 | Three real proofs tied to final ballot bytes, 932 ms proof loop |
| Hardhat probe in restricted sandbox | 1 | Documented `uv_os_get_passwd ENOMEM` before node startup |
| Hardhat probe in normal Windows execution | 0 | All six negative/duplicate/closed checks passed |
| Accepted-set byte check | 0 | Three ordered on-chain snapshot digests match public file bytes; one-byte mutation rejected |
| BSC read-only RPC in restricted sandbox | 1 | Outbound connection denied with `EACCES`; no RPC state change |
| BSC read-only RPC/estimate in normal Windows execution | 0 | Chain 97, final read at block 137166832; four creation estimates returned |

Ignored `outputs/` contains public synthetic ballot/proof records, compiler bytecode, raw audit reports and the portable Python runtime. The tracked scripts and [machine-readable dependency inventory](dependency-inventory.json) define the reproducible inputs. `outputs/` may contain cryptographic intermediate state; never publish it wholesale.

## Reproduction on Windows

Use repository-local Node 24.21.0 and npm 11.19.0. Exact npm versions are in `research/mvp3/semaphore-electionguard/package-lock.json`; the installed Python versions are in `research/mvp3/semaphore-electionguard/python-requirements-win310.txt` (SHA-256 `48c9fca38df5dda619cfa27a4a07cf72c59a1f06b1f046902d77ae40ccc30a6b`). Clone the four tags above under the ignored `upstream/` directory. The selected PoC only needs Semaphore and ElectionGuard Python; Core 2/C are comparison inputs.

Download the official Python 3.10.11 Windows embeddable archive from `https://www.python.org/ftp/python/3.10.11/python-3.10.11-embed-amd64.zip` into ignored `outputs/python310/`, verify the SHA-256 above, and extract to `outputs/python310/runtime/`. In `python310._pth`, enable `import site` and add the absolute path to `upstream/electionguard-python/src`. Download `https://bootstrap.pypa.io/get-pip.py`, verify its recorded SHA-256, then run `runtime/python.exe get-pip.py` followed by `runtime/python.exe -m pip install -r research/mvp3/semaphore-electionguard/python-requirements-win310.txt`. These are research-only dependencies; do not install them in the product workspace.

Then run, in order: `runtime/python.exe research/mvp3/semaphore-electionguard/run_electionguard_probe.py`; the same Python with `verify_public_record.py` and `probe_record_mutations.py`; `.tools/node-v24.21.0-win-x64/npm.cmd ci --prefix research/mvp3/semaphore-electionguard`; `.tools/node-v24.21.0-win-x64/node.exe research/mvp3/semaphore-electionguard/semaphore_probe.mjs`; the same Node with `run_local_chain.mjs` in normal Windows execution, then `verify_accepted_set.mjs`; and optionally `bsc_readonly.mjs` for read-only chain-97 observations. `run_local_chain.mjs` uses the existing root Hardhat/solc/viem research toolchain. The PoC uses fresh random ballots/identities each run; compare expected assertions and metrics, not byte-identical proof files. The generated public ballot bytes and matching Semaphore proofs must come from the **same run**.

## Exact next executable task

Move the three working local guardian processes to separately controlled storage/operators and authenticate share requests; the current parent/host commands all three. Subject the research public-record verifier to independent review and additional adversarial records, then bind archive completeness to an authenticated chain accepted set. Until these checks pass, do not mark F1 complete or migrate the app. Independently resolve GPL/LGPL distribution obligations, the Pydantic pin/advisory, and the hybrid invalid-ballot acceptance rule.

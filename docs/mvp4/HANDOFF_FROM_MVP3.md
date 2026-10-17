# MVP 4 handoff from MACI MVP 3

Status 2026-10-17: **READY TO START** after local synthetic MVP 3 academic acceptance. This document defines inputs for Monitoring, Auditing and Independent Verification; it does not implement the verifier. See [ADR 0011](../architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md) and the [verification data contract](../mvp3/VERIFICATION_DATA_CONTRACT.md).

## Existing export and trust boundary

`GET /v1/maci/elections/:id/audit` returns protocol, manifest, events, proofs and tally after the application audit checker has stored a `VERIFIED` record. The coordinator writes four public files: manifest JSON, event NDJSON, proof JSON and tally JSON. The API's public endpoint checks confirmation depth and the snapshot block hash against its configured RPC before serving. The checker compares canonical event sets, successful process/tally transactions, Groth16 proofs, on-chain verifying keys, commitments and tally. These are application checks; a standalone verifier must independently repeat them and must **reject a database-only `VERIFIED` claim**.

| Input or obligation | Currently available | MVP 4 work |
| --- | --- | --- |
| Election identity, candidate order, version and windows | Database election row; manifest has MACI/poll/chain and poll ID but no versioned candidate manifest or full configuration | Publish canonical, versioned configuration containing title-independent candidate identifiers/order, option count, windows, coordinator public key, protocol/circuit parameters and deployment binding; compare to frozen on-chain poll |
| Network and contract addresses | Manifest chain ID, MACI/poll/processor/tally addresses and deployment block; app checks `getPoll` | Verify bytecode/configuration and receipt provenance using an independently chosen chain source; pin expected deployment/code hashes |
| Events, transactions, receipts | Manifest event counts; public SignUp, PollJoined and PublishMessage rows; proof tx references | Requery logs from deployment through snapshot, receipts and full transactions; verify exact ordering, status, calldata, hashes and accepted-set completeness |
| Canonical chain and finality | Snapshot number/hash and configured confirmation depth; endpoint rechecks one block | Define checkpoint/finality policy, independent RPC or authenticated archive, reorg demotion and history-unavailable outcome; depth reduces, never eliminates, reorg risk |
| Processing and tally proofs | Proof JSON and successful tx references, including public inputs | Decode every batch call, recompute public inputs from the canonical state, verify against on-chain keys and circuit parameters, check contiguous batch coverage and final commitments |
| Keys, commitments and artifact provenance | On-chain registry and tally state; manifest artifact hashes; local artifact provenance record | Publish exact artifact IDs, bytes/hashes, VK identity, source/compiler/configuration and ceremony provenance; reject unknown or mismatched artifact versions |
| Final tally and candidate mapping | Tally JSON and application candidate array | Bind option index to versioned candidate identifiers, recompute commitments, check unused options zero, then report totals without trusting DB status |
| Independent output | No standalone CLI | Define canonical JSON/NDJSON, archive retention/mirrors, CLI and machine-readable `pass`, `invalid`, `incomplete`, `unsupported`, `error` with stable reason codes; non-pass uses nonzero exit |

## Required failure cases

The verifier must fail closed on omitted/inserted/changed logs or proofs, wrong poll/election/candidate ordering, forged receipt, altered tally/commitment, unrecognized circuit or key, insufficient depth, canonical hash change, unavailable RPC/archive, and incomplete processing. A database `VERIFIED` value is only an input assertion. Distinguish invalid evidence from unavailable evidence; report the exact checkpoint and check that failed. No private MACI key, decrypted command, identity-to-key join, witness, session token or raw identity belongs in the dataset.

## Start condition

Use the MVP 3 public envelope and current local `[0,1,1]` run as development fixtures. The MVP 3A current functional and negative/finality gates are recorded in [MVP 3 progress](../mvp3/PROGRESS.md); the independent verifier and versioned candidate-configuration binding are the first MVP 4 tasks. Do not treat full MVP 4 export/CLI implementation as a missing MVP 3 feature.

# MACI public verification data contract for MVP 4

Status 2026-10-17: specification of the **existing** `maci-v3.0.0-full-v1` audit envelope and the next verifier boundary. It is not a claim that an independent verifier exists. The current producer is `scripts/maci-coordinator.mjs`; the current checker is `services/api/src/maci/audit.ts`.

## Chain-grounded lifecycle

The application stores `REGISTRATION`, `OPEN`, `CLOSED`, `VERIFIED`. The monitor may derive richer display states, but only the following observations support them:

| Display state | Required evidence | Authority and limit |
| --- | --- | --- |
| Created | Configured MACI and poll addresses, poll ID, code, and deployment transaction | Chain plus locally checked configuration; no voting claim |
| Registration open | App eligibility/issuance window and registered `SignUp` events | App policy controls issuance; MACI does not expose this exact app transition |
| Voting open | Chain poll start/end window and app `OPEN` state | Chain time controls poll acceptance; app state may lag |
| Voting closed | Chain time after poll end, app `CLOSED` | Closing the web action is not proof of processing |
| Processing | `processMessages` transactions and processor batch progress | Chain transaction state, not a separate MACI lifecycle enum |
| Tallying | `tallyVotes` transactions and tally batch progress | Chain transaction state |
| Proof verification | Successful proof transactions plus independent checks against on-chain verifying keys/public inputs | Success of a receipt alone is insufficient |
| Verified | Canonical accepted events reconciled, processing and tally complete, all proofs and commitments valid, snapshot block confirmed | Current app can claim internally checked result; MVP 4 must independently verify |
| Failed | Specific rejected, reverted, missing, stale or reorged evidence | Operational outcome, not an invented on-chain status |

`INCLUDED` on an encrypted command means its exact ciphertext transaction and event were confirmed. It does not mean that command was valid, the final counted choice, or that the election result was verified. The current single-choice poll processes commands in reverse order: the later valid `nonce=1` command updated the choice, while an included `nonce=2` command was ignored in the observed run. Inclusion alone cannot establish a counted update.

## Current public envelope

`GET /v1/maci/elections/:id/audit` returns `{protocol, manifest, events, proofs, tally}` only after the application checker published the evidence. The endpoint now rechecks snapshot block hash and confirmation depth before returning it. This API is a distribution source, never a verifier's authority.

| Field/object | Current provenance | Independent validation requirement |
| --- | --- | --- |
| `protocol`, `researchClassification`, `repositoryRevision` | Coordinator manifest | Dispatch exact MACI version/configuration; reject unknown versions; source revision is descriptive, not a signature |
| `chainId`, MACI/poll/processor/tally addresses, `pollId`, `deploymentBlock` | Deployment/configuration and on-chain MACI `getPoll` | Obtain chain ID, code and poll contract addresses from an independently selected RPC/checkpoint |
| `snapshotBlock`, `snapshotBlockHash` | Coordinator's chain view | Check canonical block hash and sufficient confirmations/finality; report reorg or unavailable history as incomplete/error |
| Registration/voting windows and coordinator public key | Present in application election configuration and on-chain poll, **not yet in the audit manifest** | Retrieve from poll contract and compare to versioned election configuration before an independent `pass` |
| `eventCounts`, `events` | Public `SignUp`, `PollJoined`, `PublishMessage` logs | Requery authenticated canonical chain from deployment to snapshot; exact order, address, topic, data, block and receipt match; no omission or insertion |
| `proofTransactions`, `proofs` | Public processing/tally transaction references and Groth16 proof/public inputs | Decode every successful chain transaction, compare exact proof bytes/inputs, fetch on-chain verifying keys and verify all batches |
| `artifactHashes` | Coordinator manifest | Compare to independently acquired, pinned circuit and verification artifacts; hashes alone do not establish trusted setup provenance |
| `tally` and tally JSON commitments | Coordinator result and chain Tally state | Recompute/verify commitments and final result against chain after every required batch; never trust declared integers alone |
| `evidenceHashes` | SHA-256 of serialized event/proof/tally files | Check exact bytes for integrity, then check their chain and cryptographic meaning |
| `verified` | Coordinator Boolean | Treat as an untrusted assertion. The independent verifier must produce its own result. |

All field elements are decimal strings in proof public inputs and counts or canonical bounded hexadecimal strings in commitments as required by the existing API schemas. Bigint values must not be rounded through JavaScript numbers. The envelope excludes account IDs, private MACI keys, coordinator secret, decrypted commands, witness inputs, encryption randomness, cookie/session identifiers and identity-to-key joins.

## Independent verifier boundary

MVP 4 should implement four separate ports: (1) retrieval from a chosen canonical RPC and one or more archive sources, (2) MACI cryptographic proof/commitment validation with pinned artifact IDs, (3) accepted-set and final-result reconciliation, and (4) monitoring/reporting UI. A future machine-readable result should identify protocol/version, chain/checkpoint, artifact hashes, checks executed, finality, and one of `pass`, `invalid`, `incomplete`, `unsupported`, `error`, with nonzero exit for every non-pass outcome. Missing data, an unavailable chain, a reorg, an unknown circuit/version or a database-only `VERIFIED` flag cannot yield `pass`.

Before releasing that verifier, add a versioned election-configuration object and verification-key identifiers to the public export, fix archive retention/mirroring policy, define canonical JSON/NDJSON bytes, and exercise chain replay, mutation, outage and reorg probes. The present audit endpoint and MACI SDK code can inform the specification but cannot serve as independent evidence by themselves.

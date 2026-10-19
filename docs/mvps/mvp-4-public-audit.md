# MVP 4: Monitoring and public audit

Status: local academic MVP 4 scope completed on 2026-10-18 under the separately approved checkpoint Definition of Done; this broader release roadmap remains partially unimplemented. No tag created. See [local acceptance](../mvp4/FINAL_REPORT.md).

## Objective and scope

Provide operational observability and independent reproducible verification of the entire election record. Build the Public Audit Dataset + Standalone Election Verifier from MVP 3's public accepted records and generated cryptographic evidence. Deliver a documented CLI with machine-readable outcomes, complete public archive, resilient indexer, audit display and monitoring dashboards.

Exclude plaintext individual ballots, identity analytics, trusting backend-declared results, AI decision-making, and L2 optimization. Verification must function with the application backend offline.

## Dependencies

Accepted MVP 3 protocol/artifacts, canonical record/dataset schemas, single-holder aggregate tally/decryption evidence, manifest/close checkpoints, and D12 availability policy. Select pinned monitoring/storage dependencies only now; define bounded label sets and redaction/retention policy.

## Modules and architecture changes

Extract/extend `services/indexer`, create `packages/verifier` and its CLI, add public export/storage adapters and `apps/audit-web` if a separate deployment is useful, add Prometheus/Grafana in infrastructure. Keep verifier free of API database dependencies. Its chain input and local archive mode must be independently configurable.

## Implementation sequence

1. Define the public dataset schema, canonical order/count and hash vectors; anchor dataset/tally commitments to the chain and document independent reconstruction of accepted ciphertexts/proofs.
2. Implement reorg-safe cursor/checkpoint reconciliation and reproducible full replay.
3. Build standalone archive/chain/membership/validity/nullifier/aggregate/decryption-proof verification with versioned JSON and exit codes; check evidence rather than declared result fields. Include invalid/incomplete/unsupported/error outcomes.
4. Publish redundant immutable evidence archives and test retrieval/repair/reconstruction, including historical chain data access.
5. Add aggregate infrastructure/relay/chain health dashboards and operational alerts with no identity/ballot joining labels.
6. Add public election view and voter inclusion evidence; make authority-published versus independently verified results visibly distinct.

## Acceptance criteria and testing strategy

The table below is the original broader release acceptance matrix. The local academic checkpoint acceptance is recorded separately in [MVP 4 progress](../mvp4/PROGRESS.md); A5 indexer and A6 redundant mirror work were outside that approved local scope and have not been accepted.

| ID | Criterion | Verification |
| --- | --- | --- |
| M4-A1 | An auditor can obtain and verify complete data with backend offline | Fresh-machine CLI workflow using independent chain source and archive; no API DB access |
| M4-A2 | Dataset exactly matches canonical accepted set and commitments | Omission/insertion/reordering/truncation/duplicate-nullifier mutations; T12/T13 |
| M4-A3 | All required authorization/validity/tally evidence is checked | Wrong election key/circuit/membership/validity/decryption proof/result fixtures; recompute aggregate and bounded counts; declared result without proof fails |
| M4-A4 | Missing/unsupported evidence never produces success | Missing object, unknown protocol and unavailable chain/history tests |
| M4-A5 | Indexer survives restart/reorg and reconciles to chain | Rollback/replay/checkpoint corruption tests; T18 |
| M4-A6 | Archive availability policy is exercised | Disable a mirror, retrieve from another, restore/rebuild and verify checksums |
| M4-A7 | Monitoring is useful without exposing identity or choices | Metrics/log schema audit, cardinality bounds, private data injection tests; T10/T17 |
| M4-A8 | Public/inclusion UX and performance are documented | E2E inclusion, stale/finality status, complete verification reports and raw measurements |
| M4-A9 | CLI emits deterministic machine-readable results and preserves privacy | JSON schema/exit-code tests for pass/invalid/incomplete/unsupported/error, sanitized failure output, no identity/private-key/individual-plaintext requirement |

Include archive parser bounds/malformed-input tests, verifier mutation corpus, chain-provider disagreement, proof validation and dashboard log review. An internal library reused by two interfaces is not independent verification evidence by itself; use specification vectors and differential/manual cross-checks where feasible.

## Benchmark requirements

Rerun MVP 3 reference scenarios; measure index lag, replay/reorg recovery time, evidence bytes per vote, full download/verification latency and memory, per-proof/tally verification time, mirror failure/repair, and monitoring overhead with matched instrumentation settings. An audit speedup is invalid if checks are skipped.

## Risks and migration considerations

Withheld evidence, shared verifier bugs, dishonest RPC sources and telemetry correlation remain. Content hashes protect integrity, not availability. Publish retention/repair responsibility; keep old schema/verifier versions and artifact hashes reproducible. Do not reinterpret historic results under a new schema without an explicit version/migration record. Threat focus: T10/T12/T13/T14/T17/T18/T21/T23/T24. Passing decryption proofs demonstrate correct totals, not that the single holder refrained from individual decryption. A future threshold verifier dispatch must reject unknown modes until implemented and tested.

## Implementation summary

The local academic prototype now has an admin aggregate dashboard, original-byte public evidence/configuration endpoints, an independently runnable CLI and genuine on-chain proof verification. It has no resilient indexer service, redundant immutable archive/mirror, public deployment or released verifier package. See the scoped [acceptance report](../mvp4/FINAL_REPORT.md).

## Test evidence

Scoped local acceptance ran on Hardhat 31337 with an isolated PostgreSQL fixture; independent proof verification, byte downloads, browser probes and injected chain/RPC faults passed as recorded in the [acceptance report](../mvp4/FINAL_REPORT.md). The full broader A1-A9 release matrix has not been run.

## Benchmark results

One former local verifier process was measured at 44,004 ms wall time and 157,913,088 bytes peak sampled RSS; the matched final run measured 14,859 public artifact bytes plus a 1,701-byte configuration. No throughput or broader release benchmark claim is made.

## Known limitations

Public verification cannot certify honest real-world enrollment or prevent coercion. Verification requires available evidence and a trusted/validated canonical-chain source.

## Git revision or tag

Implementation revision: none. Tag: not created.

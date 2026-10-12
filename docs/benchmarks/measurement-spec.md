# Benchmark measurement specification

Status: methodology with initial exploratory MVP 1 runs. Updated 2026-10-12. See [observed baseline](mvp-1-baseline.md); repeated runs, committed revision and public-chain measurements remain pending.

## Storage layout and run manifest

When a benchmark is first implemented, use `benchmarks/results/<runId>/` for manifest and raw files; `benchmarks/reports/` for derived reports; `benchmarks/scenarios/` for input definitions. Large artifacts may live in a retained content-addressed archive with committed manifests/checksums. Never include real identities, keys, witnesses, or individual real plaintext votes.

Each manifest must contain:

| Group | Required metadata |
| --- | --- |
| Identity | `schemaVersion`, `runId`, experiment/scenario ID, milestone, protocol version, observed/simulated/estimated classification |
| Revision | Git commit, clean/dirty state and patch hash if dirty; tag if applicable; source and scenario hashes |
| Time | Start/end UTC ISO timestamps plus display timezone; monotonic clock implementation/resolution and clock synchronization method |
| Chain | Network name, chain ID, RPC/provider region/tier (redacted credentials), genesis/fork reference, start/end block hashes, finality policy, L1 settlement source for L2 |
| Build | Runtime/package-manager/package versions, lockfile hash, compiler/optimizer/viaIR/EVM settings, bytecode/ABI hashes, container digests |
| Crypto | Scheme/curve, root/tree depth, candidate count, circuit/proving/verifying artifact hashes, setup provenance, election public-key fingerprint, `decryptionMode`, and threshold/roster only for a future threshold run; `not_applicable` before MVP 3 |
| Hardware | OS, CPU, RAM, browser/device, network conditions, server/driver placement and resource limits |
| Workload | Dataset size/hash/seed, eligible and attempted voters, candidate count, concurrency/arrival process, warm-up, duration, fee/retry/timeout/batch policy |
| Outcomes | Attempted/accepted/rejected/failed/pending logical votes, attempt count, raw-file hashes, exclusions/reasons, completion/finality cutoff |
| Analysis | Script revision, statistical/CI method, seeds, units, model/threshold/split metadata if applicable |

Fields must be present with explicit `not_applicable`/`unavailable` reason rather than silently omitted. A run with no valid Git revision is exploratory and cannot serve as a reproducible milestone result.

## Raw records

Keep separate append-only JSONL or CSV tables with an explicit schema:

- `logical-submissions`: synthetic `logicalVoteId`, submission start/ack, terminal or censored status, accepted event reference, error category. No joinable real identity data.
- `transaction-attempts`: attempt ID, logical ID, sender role, nonce, replacement parent, hash, send/receipt/block observations, revert reason category, gas/fee fields, block hash, canonical/finality status.
- `crypto-timings`: device/profile, artifact-load/encryption/witness/prove/verify/aggregate/decrypt durations and memory, public configuration hashes; never witnesses/secrets.
- `verification`: dataset count/bytes, reconstruction/verification durations, fault class and outcome.
- `detection`: synthetic run/window/scenario IDs, injected onset, alert time, label, score, split and model version; no vote preference features.

Use integer nanoseconds or milliseconds for monotonic durations with declared resolution, integer gas units, and base-unit integer decimal strings for fees. Missing values are null with reasons, never zero. Chain timestamps are not substitutes for accurately measured client latencies.

## Metric definitions

| Metric | Definition |
| --- | --- |
| Gas units per accepted vote | Report successful acceptance transaction gas divided by accepted votes; also total workload gas including failed/replaced attempts divided by accepted votes |
| Actual total network fee | Receipt-derived charges for all relevant attempts, including failed transactions; L2 includes documented execution, L1 data/blob allocation, operator or other applicable fees without double counting |
| Voter / sponsor cost | Attribute actual paid transaction fees by payer role; report separately from relay compute/storage cost |
| Relayer operating cost | Sponsor fees plus separately measured/estimated compute, RPC, storage and queue costs over declared interval; avoid counting sponsored fees twice in system totals |
| Inclusion latency | Driver's first canonical receipt/block observation minus submission/send origin; report end-to-end selection-confirmation-to-inclusion separately from RPC-send-to-inclusion |
| Confirmation latency | Time until the declared confirmation-depth policy; label policy and reorg behavior |
| Finality latency | Time until the observed chain finality condition; on L2 distinguish sequencer inclusion, safe L1 data inclusion, L1-finalized derivation, and any additional settlement/withdrawal policy |
| Accepted throughput | Unique canonical accepted ballots in the fixed measurement window divided by its duration; separately report drained completion throughput and finality-qualified throughput |
| Failure rate | Failed/rejected terminal logical submissions divided by attempted logical submissions; report pending/timeouts separately and also transaction-attempt failure rates |
| Proof generation / verification | Timed isolated steps and end-to-end totals; off-chain wall time and on-chain gas are separate |
| Tally and dataset verification | Initial mode: aggregation, bounded decoding, single-holder decryption and proof generation/checking; MVP 4 full CLI/archive verification. Future threshold mode: share/combine timings separately. Record sizes and completeness outcomes. |
| Cost per 1k / 10k / 100k | Observed total for actual completed workload, otherwise labeled estimate from a stated model including setup amortization, batches/retries/fees and uncertainty |

If accepted count is zero, per-accepted-vote metrics are undefined, not zero. Record deployment/election setup/registration/finalization costs separately and an amortized total; state which cost basis is compared. Do not compare L1 gas prices with L2 gas units as if they were the same cost.

For an L1 EVM transaction, `gasUsed * effectiveGasPrice` captures its execution fee; account for any other applicable charges using actual receipt/protocol data. For L2, use the selected chain's current fee specification and receipts, not an assumed universal formula. The [OP Stack derivation specification](https://specs.optimism.io/protocol/derivation.html) distinguishes chain heads and L1-derived finality; exact network guarantees and additional fees are selected at MVP 6.

## Reproducibility and validity checks

Preserve all failed/pending attempts and relate replacements to logical submissions. Reconcile events against the selected canonical checkpoint; distinguish reorged inclusion from durable acceptance. Compute statistics from raw files using a versioned script. Use repeated runs and the [research methodology](../research/research-methodology.md), with no real benchmark numbers inserted into plan documents.

For simulation or cost projection, record the fee input source/time, extrapolation model, resource assumptions and uncertainty. Never convert testnet token fees to an observed production-currency spend. USD or VND estimates, if requested later, need dated exchange-rate sources and a clear estimated label.

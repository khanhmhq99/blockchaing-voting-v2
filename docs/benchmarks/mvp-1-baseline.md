# MVP 1 baseline measurements

Observed 2026-10-12. These are **exploratory local EVM observations**, not public-network capacity or production latency. The repository has no Git commit; revision is explicitly null and no milestone tag is justified.

## Workload and environment

Hardhat 3.19.0 automines on chain 31337 over loopback. Node 24.21.0/npm 11.19.0; Windows 10.0.26200; Intel i5-12400F, 12 logical CPUs, approximately 32 GiB RAM. Solidity 0.8.37, optimizer 200, EVM Paris. Two candidates with alternating selections. Each workload uses independent newly generated wallets; keys are held in memory and never persisted. Authorization batches contain at most 200 addresses. The driver is sequential (concurrency 1), with no warm-up.

Latency runs from client submission to the first local receipt, including client signing and RPC work. One local inclusion is the configured confirmation policy; public-chain finality is not measured. Raw records contain integer nanoseconds converted from the monotonic performance.now clock plus derived milliseconds; this does not imply nanosecond clock accuracy. Throughput is completed accepted votes divided by the voting-window driver duration, not maximum sustainable network throughput.

## Latest complete run per workload

| Voters / accepted | Vote gas min-max | Mean vote gas | p50 / p95 inclusion (ms) | Completion throughput (votes/s) | Failed / pending |
| --- | --- | --- | --- | --- | --- |
| 10 / 10 | 64203-98403 | 69339.00 | 9.020 / 14.016 | 104.17 | 0 / 0 |
| 100 / 100 | 64203-98403 | 64722.00 | 6.260 / 8.859 | 150.28 | 0 / 0 |
| 1000 / 1000 | 64203-98403 | 64260.30 | 5.423 / 7.786 | 175.19 | 0 / 0 |

First writes to storage cost more gas, so successful vote gas varies across first and subsequent candidate votes. Gas is an integer; the mean is a derived statistic.

| Voters | Create gas | Candidate registration gas | Authorization gas (all batches) | Freeze gas | Finalize gas | Total measured gas | Receipt-derived total fee (wei) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 98181 | 82857 | 312827 | 32951 | 37307 | 1257513 | 1325220481139258 |
| 100 | 81081 | 82857 | 2668121 | 32951 | 37307 | 9374517 | 9575684813379246 |
| 1000 | 81081 | 82857 | 26357585 | 32951 | 37307 | 90852081 | 90852082493279198 |

Fees are gasUsed multiplied by effectiveGasPrice from each actual local receipt. These are simulated-network native-token units, not money spent or a currency estimate. Setup and finalize are included in total measured gas/fees; contract deployment and synthetic balance funding are excluded.

## Raw evidence

- [mvp1-10-eb2a4ddb-47fe-48e1-b8a2-f1a0bc3e9ebb](../../benchmarks/results/mvp1-10-eb2a4ddb-47fe-48e1-b8a2-f1a0bc3e9ebb/manifest.json): source/driver/lockfile/raw hashes, environment, workload, checkpoints and summary. The same directory contains transaction-attempts.jsonl, logical-submissions.jsonl, the exact contract source and benchmark driver snapshot.
- [mvp1-100-ce88940c-4b75-4aef-8754-df8b7d1d49ce](../../benchmarks/results/mvp1-100-ce88940c-4b75-4aef-8754-df8b7d1d49ce/manifest.json): source/driver/lockfile/raw hashes, environment, workload, checkpoints and summary. The same directory contains transaction-attempts.jsonl, logical-submissions.jsonl, the exact contract source and benchmark driver snapshot.
- [mvp1-1000-4d0915c2-aff3-49ef-808c-dda288e7e6ae](../../benchmarks/results/mvp1-1000-4d0915c2-aff3-49ef-808c-dda288e7e6ae/manifest.json): source/driver/lockfile/raw hashes, environment, workload, checkpoints and summary. The same directory contains transaction-attempts.jsonl, logical-submissions.jsonl, the exact contract source and benchmark driver snapshot.

An earlier exploratory pass is also retained under benchmarks/results; it predates the integer-nanosecond/snapshot additions and is not the primary table above. Each current manifest still records one run, not repeated statistically controlled trials. No confidence interval is claimed.

## Reconciliation and limitations

The driver checks that VoteCast events, totalVotes and expected independent voter count agree before recording success. Failure rate is zero for the valid-voter workload only. Unauthorized, duplicate and lifecycle rejection cases belong to the separately observed contract/E2E tests; they are not mixed into this throughput denominator. No relayer, encryption, proof generation, database latency, browser interaction latency, L2 fees, public-network congestion or settlement latency was measured.

Supabase credentials were absent; results are retained as local files and were not persisted into the managed BenchmarkRun/BenchmarkMeasurement tables. The optional persistence path is implemented but unverified against a live project. System resource usage was not isolated, so workstation activity can affect timings.

Run `npm.cmd run benchmark:mvp1` to collect fresh local measurements. The runner starts and stops its own chain on port 18547. Keep a committed revision, repeated runs, all failure/censoring records and matched workload/finality conditions before using these observations as a thesis comparison baseline. Do not reinterpret these exploratory numbers as accepted milestone performance.

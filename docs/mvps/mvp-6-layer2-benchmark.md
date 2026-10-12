# MVP 6: Layer 1 / Layer 2 benchmark

Status: planned; explicit instruction and accepted prior milestones required. Intended tag: `mvp-6-layer2-benchmark`.

## Objective and scope

Evaluate cost and scalability on an Ethereum-compatible L1 baseline and at least one active EVM-compatible L2. Compare gas, total fees, inclusion/confirmation/finality, throughput, failures, proof cost, data availability, and single versus safely batched acceptance. Compare on-chain/calldata and off-chain storage only with explicit security/availability differences.

Exclude unapproved production deployment, unsupported claims of equivalent chain security, mixing confirmation with settlement finality, and presenting projected 100,000-vote costs as observed load tests. Do not duplicate the application for each chain.

## Dependencies

Frozen protocol versions and raw baseline scenarios from MVP 1-5; D15 network/EVM/fee/finality selection; D16 measurement budgets; public evidence/verifier invariants from MVP 4. Recheck official current network status, chain IDs, hardfork/opcode support, RPC limits, L2 fee components and settlement assumptions at implementation time. An OP Stack rollup is a candidate, not a selected deployment.

## Modules and architecture changes

Add environment-specific chain/deployment manifests, RPC/fee/finality adapters, workload drivers and analysis scripts. Preserve contract semantics across chains and save bytecode/config differences. Keep ElGamal parameters and `single-holder` custody identical across the initial comparison; threshold experiments require separate authorization and must not be mixed into a chain-only comparison. Introduce batching only if all authorization, ballot validity, nullifier and publication invariants remain enforceable; otherwise report that comparison unsupported with evidence.

## Implementation sequence

1. Choose the L1/L2 pair and controlled/public environments; document sequencer, data-availability, proof/challenge, settlement and RPC assumptions.
2. Freeze matching compiler/EVM/protocol/workload configs and verify contract/proof compatibility on both networks with local/test deployments within the authorized milestone scope.
3. Validate receipt-based fee and distinct finality collectors; record failed/replaced transaction charges.
4. Execute randomized paired baseline loads and adversarial/capacity cases with repeated runs, both offered-load and concurrency controls.
5. Implement/review optional batch and storage variants; isolate each variable and measure fill delay, total fees and audit evidence costs.
6. Publish raw runs, reproducibility manifests, analysis, confidence intervals, limitations, and observed/estimated scaling tables.

## Acceptance criteria and testing strategy

All statuses: **not run**.

| ID | Criterion | Verification |
| --- | --- | --- |
| M6-A1 | Same voting semantics work on L1 and at least one EVM L2 | Full contract/security/verifier regression on both configurations, bytecode/compiler metadata |
| M6-A2 | Measurements use comparable workloads and full metadata | Dataset/seed/config equality checks, paired randomized run manifest review |
| M6-A3 | Total fees include applicable L2 charges and sponsor costs | Receipt/fee-spec reconciliation; distinguish execution, L1 data, operator and infrastructure costs |
| M6-A4 | Inclusion, confirmation and L1-dependent finality are distinguished | Collector tests with delayed L1 publication/finality and reorg/sequencer faults where controllable |
| M6-A5 | Throughput/failure/proof measurements include load and censoring | Independent finalized-event reconciliation, retries/failures/pending preserved |
| M6-A6 | Batch/storage comparisons retain stated correctness and audit properties | Duplicate/invalid ballot in batch, atomic versus partial policy tests, withheld-data audit tests |
| M6-A7 | Cost per 1k/10k/100k and scalability conclusions are reproducible and labeled | Raw observed counts or explicit estimation model/uncertainty; recomputed reports |

Acceptance of a performance study does not require L2 to outperform L1 in every metric. Negative results are valid; omitting required controls is not. Unsupported batch/storage variants must be explicitly scoped and justified before claiming completion of the requested comparison.

## Benchmark requirements

Rerun a frozen L1 baseline before optimization. Vary chain, concurrency/arrival rate, voter count, batch size and storage mode one factor at a time or in a documented factorial design. Report gas units per accepted vote, all-in fee and sponsor expenditure, setup amortization, p50/p95/p99 with sufficient samples, accepted votes/second, failure/pending rates, proof/tally/verifier costs and archive bytes/availability. Include batch waiting time and revert cost; local high throughput does not predict public-chain throughput.

For L2, observe sequencer inclusion, data publication/safe head and L1-finalized derivation separately; any withdrawal/challenge settlement measure must be named and justified rather than folded into a generic confirmation time. Use chain-specific specifications and actual receipts. Public testnet fees support protocol-cost comparison, not real-money production expenditure claims.

## Risks and migration considerations

Network congestion, sequencer outages/censorship, changed fee schedules, RPC throttling, different consensus/finality and unsupported opcodes confound comparison. Never run the same real election concurrently on two chains without a reviewed cross-chain participation protocol. Benchmark with distinct synthetic elections and matched datasets. Preserve earlier deployments/configs and standalone verification; optimize gas only after maintaining correctness/privacy/evidence guarantees.

## Implementation summary

Not started. No networks selected, contracts deployed, batching changes or load driver implemented.

## Test evidence

Not run; no cross-chain functional/security comparison exists.

## Benchmark results

Not measured. No gas savings, throughput or projected costs claimed.

## Known limitations

Chain environments have different trust, availability and finality assumptions. Testnet/local results cannot certify production election capacity or cost. Any estimated scale requires a stated model.

## Git revision or tag

Implementation revision: none. Tag: not created.

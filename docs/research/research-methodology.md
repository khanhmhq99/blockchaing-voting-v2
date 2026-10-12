# Research methodology

Status: preregistered experiment design proposal; no experiments or results yet. Date: 2026-10-11. Use the [measurement specification](../benchmarks/measurement-spec.md) for raw data and the [MVP plans](../mvps/roadmap.md) for acceptance evidence.

## Research questions and falsifiable hypotheses

| ID | Question and hypothesis | Independent variables | Dependent variables / falsification |
| --- | --- | --- | --- |
| RQ1 | Can a contract enforce one accepted vote per authorized baseline wallet? H1: all modeled invalid/duplicate attempts are rejected and counts reconcile. | Authorization, candidates, time boundaries, concurrency and adversarial actions | Acceptance/revert outcomes, invariant violations, gas, latency; any bypass falsifies H1 for tested implementation |
| RQ2 | Does gasless submission remove voter fee payment with acceptable overhead? H2: voter fee is zero for sponsored votes while sponsor/network cost remains measurable. | Direct versus relayed same ballot semantics; queue load, fee policy | Payer balances/receipts, end-to-end latency, failure/retry rate, sponsor spend; nonzero voter fee or altered choice violates H2 |
| RQ3 | Is the proposed private protocol implementable with verifiable acceptance/tally and usable client cost? H3: reviewed composition passes invariants and browser workload budgets selected before measurement. | Protocol variant, electorate/tree size, candidate count, device, proof parameters | Proof generation/verification time/memory, gas, tally correctness, encoding/proof mutation outcomes; metadata analysis may refute broad anonymity claims |
| RQ4 | Can an independent auditor reconstruct and verify results under backend faults? H4: mutations and withholding prevent a passing report. | Omission/tampering, archive availability, independent RPC, dataset sizes | Detection rate by fault class, full verification time/bytes, false acceptance; any tampered accepted result is a critical failure |
| RQ5 | Do anomaly models improve operational detection over rules? H5: at a preregistered false-positive budget, a model improves held-out recall or detection latency. | Rules/statistics/Isolation Forest, scenario mix, thresholds, load | Precision, recall, F1, FPR, PR-AUC when suitable, latency, false alerts/hour; no improvement is a valid negative finding |
| RQ6 | Does an EVM L2 reduce comparable total cost while meeting explicit finality/availability assumptions? H6: fees per accepted vote decrease under matched semantics and workload. | L1/L2, batch size, load, storage policy, fee conditions | All-in fees, gas, throughput, failures, inclusion and settlement finality; fee reduction alone cannot establish equivalent security |

Security arguments and measured performance are separate evidence classes. Passing tests supports implementation correctness for covered cases; it cannot statistically prove cryptographic security, honest issuance, or anonymity against all adversaries.

## Controlled variables and environments

Keep ballot rule/candidate count, electorate dataset/seed, authorization semantics where comparable, client hardware/browser, runtime/dependencies, compiler/optimizer/EVM version, payload/circuit/key sizes, transaction type, fee strategy, RPC region/tier, load-arrival process, retries/timeouts, telemetry settings, and database/indexer configuration fixed or explicitly varied. Record security-property changes between milestones rather than treating protocols as interchangeable.

Use three labeled environment classes: deterministic local EVM/database for repeatability; controlled local rollup/devnet where practical for stress; and selected public L1/L2 testnets for environmental validation. A local chain has simulated finality; testnet token fees are not measured real-money production costs. Name exact networks and verify active status/chain IDs only when MVP 6 is authorized.

## Experimental design

1. Before changing each milestone, run the prior applicable baseline on the same environment. For MVP 1 there is no voting baseline before implementation: use an explicitly labeled RPC/no-op control for harness overhead, then establish MVP 1 as the first functional baseline.
2. Freeze run configuration and raw schema before measurement. Proposed pilot matrix: 100 and 1,000 synthetic voters; 2, 5, and 10 candidates; concurrency 1, 10, 50; optional larger runs after capacity estimation. These are planned workloads, not achieved capacities.
3. Pilot to estimate variance and safe load; then preregister final sample sizes and practical latency/fee/model budgets. Use at least five independent measured runs per main configuration as an initial plan, increasing based on precision rather than cherry-picking a desired result. Freeze any pilot-driven changes before the final set.
4. Separate warm-up and measured intervals. Use paired datasets/seeds and randomized run order to reduce fee/load/time confounding. Keep cold-cache/proof-artifact download tests separate from warm steady-state tests.
5. Test both fixed-concurrency and controlled open-loop arrival rates. Report offered load, queue depth, backpressure, retries, timeouts and censored completions; a closed-loop driver alone can hide overload.
6. Collect actual per-attempt receipts and logical ballot outcomes; reconcile against canonical accepted events after the specified finality boundary. Retain failed runs and document exclusions with predefined reasons.
7. Calculate sample count, median, p95/p99 where sample size supports them, mean/standard deviation, and 95% confidence intervals at the independent-run level. Do not treat thousands of correlated transactions in one run as independent replications. Publish analysis scripts and bootstrap seeds if used.
8. Compare paired distributions and effect sizes with uncertainty, not only best-run averages or headline percentage improvements. Report end-to-end and component timings separately.

## Privacy and cryptographic evaluation

Build an explicit property/assumption/test matrix from threat IDs T01-T24. Inspect every public artifact and all operator logs for synthetic identity joins. Evaluate enrollment/voting timing correlations and anonymity-set sizes with permitted synthetic ground truth kept outside public fixtures. Absence of an obvious identifier does not prove unlinkability. Use known-answer and cross-implementation checks for serialization/proofs; request specialist composition review before real-user experiments.

Measure browser proof latency and peak memory on named desktop/mobile profiles; separate artifact downloads, encryption, witness generation, proving, submission, on-chain verification and full tally verification. Initial single-holder experiments test unavailable/wrong keys, per-election separation, bounded count decoding and decryption-proof mutation. Future separately authorized threshold experiments vary available/malformed shares. Label custody mode explicitly; no initial result demonstrates threshold privacy. MVP 3 records internal proof checks; independent full-dataset/CLI measurements begin at MVP 4.

## AI study design

Use only synthetic or explicitly authorized operational datasets. Define fraud/abuse labels from injected scenarios (invalid-proof floods, retry storms, relay queue saturation, RPC anomalies) with exact onset times. A busy period is not inherently fraud. Keep legitimate flash crowds/mobile retries among negative controls.

Split by run/election/time and scenario family before fitting transforms; correlated rows from the same attack must not cross training/test boundaries. Fit normalization, feature selection, model parameters and thresholds on train/validation only. Hold out unseen scenario families and report prevalence. Do not include choice/candidate, identity, raw IP, wallet-to-person links, nullifiers, ballot digest, or generator-specific label proxies as features. Report class imbalance, confusion matrices, confidence intervals, and latency for detected events; undetected attacks count as misses, not omitted latency samples.

## Threats to validity

| Type | Risk | Control / limitation |
| --- | --- | --- |
| Internal | Different hardware, cache, compiler, fee environment, retry policies | Paired controlled runs, detailed manifests and ablations |
| Construct | Calling gasless free, RPC receipt final, or anomaly fraud | Separate payer/network cost, inclusion/finality, and alert/confirmed abuse labels |
| Statistical | Small sample, autocorrelation, p99 instability, favorable exclusions | Run-level intervals, retained failures, fixed sample/exclusion policy |
| External | Synthetic voters, local EVM, small groups and testnets | Restrict claims; validate selected conditions on named public environments |
| Privacy | Instrumentation reveals identities or choices | Synthetic-only detailed traces, allowlisted telemetry and retention review |
| Cryptographic | Composition bugs or unreviewed assumptions | Review and negative/interoperability tests; no proof of universal security from benchmarks |
| Reproducibility | Drifted dependencies, unavailable data, deleted chain history | Pins, code/artifact/data hashes, archive mirrors, recorded checkpoints |

## Reporting rules

Each conclusion cites raw run IDs, Git revision, environment, assumptions, statistical method and limitations. Label observed, simulated, estimated and not measured explicitly. Estimates for 10,000/100,000 votes require scaling assumptions and uncertainty; never present them as load-test observations. A negative or infeasible result is academically valid and must not be hidden by mock functionality.

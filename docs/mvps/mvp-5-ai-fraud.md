# MVP 5: AI-assisted operational anomaly detection

Status: planned; explicit instruction and accepted MVP 4 required. Intended tag: `mvp-5-ai-fraud`.

## Objective and scope

Investigate whether anomaly models improve detection of suspicious operational activity over rules. Implement rule/statistical baselines, an Isolation Forest candidate, synthetic abuse scenarios, rigorous evaluation and advisory dashboard alerts. Supervised models require suitable authorized labels.

Exclude political-preference inference, individual ballot-choice features, identity profiling, automatic invalidation of valid ballots, and claims that an anomaly establishes election fraud.

The detector has no access to the ElGamal private key or decryption process. Do not use individual ciphertext/proof records, nullifiers or identity-to-ballot joins as model features; use permitted operational aggregates. Public availability of the audit dataset does not authorize linking it to identity or transport logs.

## Dependencies

MVP 4 aggregate telemetry, D14 data authorization/split/false-positive budget, D16 evaluation design, pinned Python/NumPy/SciPy/scikit-learn environment. Keep synthetic ground truth out of features and production telemetry. Use the [research methodology](../research/research-methodology.md) to split data before transformation.

## Modules and architecture changes

Add `services/fraud-detection` with data schemas, synthetic generator, offline training/evaluation, versioned model artifacts and optional aggregate-stream inference. Add advisory alert API/dashboard integration. The model must have no keys/permissions for election state changes or acceptance policy. Preserve crypto acceptance independently of availability of the detector.

## Implementation sequence

1. Define permitted aggregate features (windowed submit/error/queue/fee/RPC counts) and forbidden identifiers/choices; review leakage and retention.
2. Generate legitimate flash-crowd/retry patterns and labeled injected abuse with onset times, class prevalence and seeds.
3. Split by run/election/time/scenario, implement rules/statistics, then fit model/transforms on training only and thresholds on validation only.
4. Evaluate once on held-out data; compare at matched FPR/alert budgets and report uncertainty and failed hypotheses.
5. Integrate advisory alerts with reason/context and human review; test voting during model failures/alerts.

## Acceptance criteria and testing strategy

All statuses: **not run**.

| ID | Criterion | Verification |
| --- | --- | --- |
| M5-A1 | Data is synthetic or explicitly authorized, and features contain no preferences/identity joins | Provenance record, feature allowlist/schema and leakage tests; T10/T20 |
| M5-A2 | Reproducible rules/statistical baseline and at least one justified model are evaluated | Frozen splits/seeds/environment/model hashes; rerunnable evaluation |
| M5-A3 | Metrics are correct and held-out leakage is controlled | Confusion-matrix unit checks, group/time split assertions, train-only transform fitting |
| M5-A4 | Report precision, recall, F1, FPR and detection latency with prevalence and uncertainty | Independent recomputation from raw predictions; include missed attacks and legitimate load controls |
| M5-A5 | Alerts cannot invalidate otherwise valid ballots | End-to-end valid voting during alert, detector outage, false-positive and unavailable-model cases |
| M5-A6 | Alerts integrate with monitoring and expose limitations | Human-review dashboard workflow, model/version/threshold record, privacy and bias discussion |

Success means a defensible implemented/evaluated study, not a promised accuracy number. A model failing to improve over rules can satisfy evaluation criteria if reported honestly; do not deploy it as superior. Security and valid-ballot acceptance criteria remain mandatory.

## Benchmark requirements

Capture MVP 4 operational overhead baseline. Compare rules and model inference latency, resources, detection latency distribution, precision/recall/F1/FPR and false alerts/hour across independent runs. Include unseen attack families, class imbalance and legitimate surges. Select thresholds without inspecting held-out labels. Report degradation/overhead when inference is enabled; avoid row-level pseudo-replication.

## Risks and migration considerations

Synthetic patterns may not generalize; proxies can leak labels; timestamps and IDs can memorize scenarios; false alerts may lead humans to discriminate. Keep advisory authority separate and audit model changes. Preserve dataset/model/schema versions for repeatability. L2 benchmarks must keep detection disabled or identically configured across compared runs and report overhead separately.

## Implementation summary

Not started. No dataset, trained model, detector or alert integration exists.

## Test evidence

Not run. No model-quality or privacy validation completed.

## Benchmark results

Not measured. No accuracy, false-positive or detection-latency values claimed.

## Known limitations

Operational anomalies are not proof of fraud. Models cannot verify cryptographic correctness or determine voter intent. Generalization beyond synthetic data remains an external-validity question.

## Git revision or tag

Implementation revision: none. Tag: not created.

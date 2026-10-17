# Six-MVP roadmap

> Current scope (2026-10-17): [ADR 0011](../architecture/adr/0011-mvp3-academic-scope-and-research-isolation.md) supersedes the historical row for MVP 3. The active application uses MACI v3; Semaphore + MACI is an isolated research PoC. MVP 4 prepares monitoring, auditing and an independent verifier as specified in the [handoff](../mvp4/HANDOFF_FROM_MVP3.md). The dated roadmap below is preserved for thesis history.

Update 2026-10-12: MVP 1 has been explicitly authorized and locally implemented with Supabase PostgreSQL/Prisma. See [current evidence](mvp-1.md); live database and real wallet acceptance remain pending. MVP 2-6 are not authorized for implementation.

Status: MVP 1 implementation authorized; completion gates remain open. Milestones 2-6 are plans only. Do not automatically begin any subsequent milestone.

| Milestone | Change in capability | Dependencies / key gate | Plan and record |
| --- | --- | --- | --- |
| 1 | Owner development wallet for testnet admin/deployment; public synthetic voting baseline | Runtime/toolchain setup; synthetic electorate; frozen single-choice rules | [Basic voting](mvp-1-basic-voting.md) |
| 2 | Sponsored submission with voter-authorized intent | MVP 1 accepted; replay/nonce/domain design | [Gasless](mvp-2-gasless.md) |
| 3 | Anonymous credentials, membership/validity ZK proofs, scoped nullifiers, client ElGamal and single-holder homomorphic tally | MVP 2 accepted; reviewed cryptographic composition and isolated issuance | [Anonymous ZK](mvp-3-anonymous-zk.md) |
| 4 | Public audit dataset, standalone CLI, aggregate and decryption-proof verification, monitoring | MVP 3 public accepted records and generated evidence; availability policy | [Public audit](mvp-4-public-audit.md) |
| 5 | Advisory operational anomaly detection | MVP 4 aggregate telemetry; synthetic/authorized evaluation datasets | [AI anomaly detection](mvp-5-ai-fraud.md) |
| 6 | Comparable L1/L2 cost, throughput, finality experiments | Prior frozen protocol variants; chosen active EVM L2 and fee/finality specification | [Layer 2 benchmark](mvp-6-layer2-benchmark.md) |

## Accepted custody and verification boundary

The owner's development wallet is for testnet administration, not the synthetic voter population. All secrets remain in secure environment configuration; election encryption keys are independent and distinct per election. Initial ElGamal custody is single-holder, with no secrecy claim against that holder. Threshold decryption is a future upgrade path and is not an implementation requirement for these six milestones.

MVP 3 generates and internally checks cryptographic evidence and preserves publicly reconstructible acceptance. MVP 4 publishes the complete dataset and independently verifies it through a CLI with machine-readable results. Never call backend declarations or internal tests a completed public audit.

## Common implementation workflow

On explicit instruction, inspect `AGENTS.md`, relevant ADRs, existing source/test suites and prior records. Present the concrete milestone scope, files, dependencies, security impact, test/benchmark plan, and acceptance criteria. Implement only that scope. Run applicable checks and benchmarks, retain raw evidence, update architecture/ADRs/limitations, and report in Vietnamese. Stop after the milestone.

Use one integrated application and separate protocol/configuration versions. Preserve older experiments with code revisions, lockfiles, compiler/network settings, schemas, synthetic datasets and artifact hashes. Do not create six application copies or rewrite unrelated modules.

## Definition of done and release evidence

Every applicable acceptance criterion must pass, required tests must run, measurements must be reproducible, assumptions and critical limitations must be visible, and a standalone synthetic demonstration must work. Record exact commands and exit results; attach raw run IDs and analysis revision. Unresolved cryptographic acceptance requirements block MVP 3 completion even if the UI works.

Each individual file below is both a detailed plan and an evidence record. Its implementation summary, tests, benchmarks, Git revision and tag remain explicitly empty until observed. Tags are created only after acceptance passes. `Not run` is never equivalent to `pass`.

No implementation timescale is promised before the cryptographic feasibility study and baseline measurements. Gasless convenience, privacy guarantees and L2 economics are separate research dimensions.

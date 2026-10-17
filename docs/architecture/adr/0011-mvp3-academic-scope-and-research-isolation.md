# ADR 0011: MVP 3 academic scope and isolated registration research

Date: 2026-10-17. Status: accepted scope decision; milestone acceptance remains evidence dependent.

## Context

[ADR 0010](0010-maci-mvp3-protocol-migration.md) selected MACI v3 for new elections. The initial MVP 3 plan predates that selection and required Semaphore membership, ElGamal ballot validity, and aggregate decryption in the main application. The current MACI application has a historical synthetic full election and a separate Semaphore + MACI local proof run. The [previous report](../../mvp3/FINAL_REPORT.md) identified operator linkability, coordinator visibility, archived MVP 1/2 routes, and release review as blockers. The owner revised the academic Definition of Done on 2026-10-17.

## Decision

MACI v3 remains the only active voting protocol. Browser credentials, authenticated eligibility and sponsorship, encrypted commands, vote updates, on-chain processing/tally proofs, and proof-dependent application results are the required MVP 3A path. The Semaphore + MACI wrapper remains an independent, synthetic MVP 3B research PoC; no product migration or testnet deployment is approved.

An application/database operator may correlate registration and participation keys, and the MACI coordinator can decrypt individual commands. These are accepted, explicitly disclosed academic research limitations, not evidence of anonymity against those actors. No production security certification, honest-issuer guarantee, coercion resistance, receipt-freeness, compromised-endpoint protection, or public deployment follows.

The earlier requirement to restore the exact wallet-based MVP 1/2 routes is **superseded** by functional continuity in the active MACI path. Historical source, ABIs, deployments, benchmarks and records remain in `research/legacy-mvp1-mvp2/` and historical documents. Do not recreate parallel voting protocols merely to reproduce old routes. The earlier ElGamal/Semaphore product-specific plan in [ADR 0009](0009-mvp3-encrypted-ballot-proof-composition.md) remains historical research; its cryptographic gates were not technically resolved by MACI.

The earlier release gates for public BSC deployment, real electorate use, trusted setup provenance and dependency security review remain separate from academic local acceptance. Managed Supabase writes, migrations, public transactions and production credentials require separate authorization. MVP 4 owns the independent public verifier and full audit dataset; the MVP 3 application must still check real MACI proofs and provide public reconstructible evidence.

## Consequences

Revise the [milestone DoD](../../mvps/mvp-3-anonymous-zk.md) and [roadmap](../../mvps/roadmap.md) explicitly. Mark academic MVP 3 complete only after current functional and negative acceptance gates have evidence, including status/finality behavior after recent edits. Treat a stored `VERIFIED` flag as an assertion; the MVP 4 verifier must derive its own result from canonical chain, proofs, commitments and pinned artifacts. Preserve prior evidence with its original date, environment and limitations.

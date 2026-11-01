# ADR 0012: isolate local chain deployment instances

Date: 2026-10-24. Status: accepted for the synthetic self-service enhancement.

## Context

Hardhat chain 31337 can restart and repeat deterministic contract addresses. MVP 3 originally keyed elections and public submission projections by chain ID and address. In a fresh local run against the preserved MVP 4 database, the new deployment received the same MACI and poll addresses as a historical deployment. Address capitalization accidentally allowed a duplicate row under the old case-sensitive unique index. Reusing those keys would merge historic join and encrypted-command counts with the new poll.

## Decision

Give every automated local deployment a stable UUID `deploymentInstanceId` equal to its durable job ID. Legacy elections and projections receive `legacy`. Include the instance in election uniqueness, anonymous join and encrypted-command uniqueness, API queries, and monitoring filters. Normalize new contract addresses to lowercase as the existing import path does. A job becomes ready only after transaction receipts, contract bindings, code hashes and the pre-election candidate anchor validate against the current chain. Preserve account and ballot separation: the instance marker is public operational metadata and creates no identity-to-ballot foreign key.

## Consequences

Migration `202610240002_local_chain_instances` replaces uniqueness indexes; deploy it only to an explicitly authorized database. The existing schema and ABI remain readable, but new writes require the migration and a regenerated Prisma client. Historical rows keep `legacy` and cannot be mistaken for a new deployment in projection counts. A recreated chain with bit-for-bit identical history cannot be distinguished by the RPC alone; independent checkpoints remain a trust requirement. The local fixture's initial new row was repaired after the migration, with the original research deployment files preserved.

# ADR 0002: Authoritative chain acceptance and immutable protocol versions

Status: accepted for planning. Date: 2026-10-11.

## Context

API rows can be edited, public-chain histories cannot be made private retroactively, and changing election rules during voting invalidates reproducibility and voter expectations.

## Considered options

1. Backend-authoritative votes with occasional hashes: inexpensive, but independent acceptance verification trusts the backend.
2. Upgradeable live contract: flexible, but administrators could change authorization/tally semantics.
3. Chain-enforced acceptance with immutable versioned deployments and rebuildable projections.

## Decision

Choose option 3. Freeze each election's rules before opening and preserve deployment/ABI/configuration metadata. Use wallet authorization in MVP 1, signed intents in MVP 2, and a distinct anonymous protocol version in MVP 3. Migration happens between elections, never within an open one. Retain old protocol fixtures for benchmarking. Future result commitments distinguish authority declarations from proof-verified results.

MVP 1/2 must use synthetic voters and disposable wallets because candidate selections are visible. This is an explicit experimental exception to the final system's plaintext-ballot prohibition, not permission to publish real votes.

## Trade-offs

New deployments cost gas and require discovery/version management. Immutable code does not protect against bugs already present. A cancellation/restart policy trades availability for integrity and must be documented publicly.

## Security implications

Only contracts can enforce uniqueness across independent submitters. Reorgs and canonical-chain selection must be handled. Administrative authority over eligibility and election timing remains a trust assumption. A wallet-permission list is not evidence of one human per wallet. No cross-chain double-voting protection exists if the same real election is opened independently on two chains; deployment policy must prohibit that.

## Research implications

Protocol version, chain ID, contract bytecode, EVM settings, and close checkpoint are experimental variables. The baseline's public choices and the final design's secrecy are different properties; gas comparisons must disclose the added guarantees.

## Revisit when

A reviewed governance/upgrade protocol becomes a stated research requirement. It is outside the six current milestones and must not be introduced for convenience.

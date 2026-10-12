# Architecture decision records

Updated 2026-10-12. The owner explicitly authorized MVP 1. Earlier planning decisions remain applicable; ADR 0007 records the implemented managed-database baseline.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-modular-monorepo.md) | Accepted for planning | One evolving modular monorepo; staged services |
| [0002](0002-chain-authority-and-versioning.md) | Accepted for planning | Chain acceptance authority, immutable versioned elections, synthetic baseline |
| [0003](0003-anonymous-protocol-gates.md) | Gate retained; threshold-first choice superseded by 0006 | Separate membership, ballot validity, tally and issuance assumptions |
| [0004](0004-evidence-availability-and-observability.md) | Accepted by owner; parameters pending | Public Audit Dataset + Standalone Election Verifier in MVP 4 |
| [0005](0005-development-wallet-and-key-separation.md) | Accepted by owner; development only | Personal development wallet, secure environment and separate election keys |
| [0006](0006-elgamal-aggregate-tally.md) | Accepted approach; composition unvalidated | ElGamal aggregate tally, single holder initially, threshold upgrade path |
| [0007](0007-supabase-prisma-mvp1.md) | Accepted; live database verification pending | Supabase PostgreSQL, Prisma, npm and executable MVP 1 lifecycle |

New ADRs must include context, considered options, decision, trade-offs, security implications, research implications, status, and evidence required to revisit the decision.

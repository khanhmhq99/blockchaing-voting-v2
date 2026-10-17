# Architecture decision records

Updated 2026-10-12. The owner explicitly authorized MVP 1. Earlier planning decisions remain applicable; ADR 0007 records the implemented managed-database baseline.

The subsequent explicit MVP 2 request authorizes signed gasless voting and local deployment. ADR 0008 records this extension; it does not close the live database or real-wallet acceptance gates.

| ADR | Status | Decision |
| --- | --- | --- |
| [0001](0001-modular-monorepo.md) | Accepted for planning | One evolving modular monorepo; staged services |
| [0002](0002-chain-authority-and-versioning.md) | Accepted for planning | Chain acceptance authority, immutable versioned elections, synthetic baseline |
| [0003](0003-anonymous-protocol-gates.md) | Gate retained; threshold-first choice superseded by 0006 | Separate membership, ballot validity, tally and issuance assumptions |
| [0004](0004-evidence-availability-and-observability.md) | Accepted by owner; parameters pending | Public Audit Dataset + Standalone Election Verifier in MVP 4 |
| [0005](0005-development-wallet-and-key-separation.md) | Accepted by owner; development only | Personal development wallet, secure environment and separate election keys |
| [0006](0006-elgamal-aggregate-tally.md) | Accepted approach; composition unvalidated | ElGamal aggregate tally, single holder initially, threshold upgrade path |
| [0007](0007-supabase-prisma-mvp1.md) | Accepted; live database verification pending | Supabase PostgreSQL, Prisma, npm and executable MVP 1 lifecycle |
| [0008](0008-gasless-signed-intents.md) | Implemented locally; managed acceptance pending | Direct EIP-712, immutable MVP 2 deployment, durable relayer and conservative sponsorship |
| [0009](0009-mvp3-encrypted-ballot-proof-composition.md) | Proposed; architecture decision required | Separate membership and ballot-validity proofs with authenticated accepted-record binding |
| [0010](0010-maci-mvp3-protocol-migration.md) | MACI product direction accepted; integration gates open | Versioned MACI replaces DAVINCI/Semaphore for new MVP 3 elections; preserve historical evidence |
| [0011](0011-mvp3-academic-scope-and-research-isolation.md) | Accepted academic scope; acceptance pending | MACI remains the main app; Semaphore + MACI remains isolated research; operator/coordinator limits are disclosed |

New ADRs must include context, considered options, decision, trade-offs, security implications, research implications, status, and evidence required to revisit the decision.

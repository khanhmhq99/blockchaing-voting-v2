# Open decisions and research gates

Updated after the owner's cryptography/verification decisions on 2026-10-11. ElGamal, single-holder initial custody, personal development-wallet administration and public dataset/CLI verification are selected; their implementation details remain gated. Proposed owners are responsibilities, not assigned real people. Defaults below let synthetic MVP 1 planning proceed; they do not authorize implementation.

| ID | Decision / default | Owner role | Gate and evidence |
| --- | --- | --- | --- |
| D01 | One contest, exactly one candidate, no write-ins/revote; synthetic voters | Project owner + researcher | Confirm/change before MVP 1 freeze semantics and test fixtures |
| D02 | Selected: owner development wallet for testnet deployer/admin, separate synthetic voters; API roles/cancellation still pending | Security/architecture | MVP 1: secure environment and role/chain checks, no committed secrets; API session is not contract authorization |
| D03 | Node 24 runtime, package-manager path repair, exact stack patches | Engineering | MVP 1 entry: executable package manager, advisory resolution, locked smoke-tested matrix; recheck announced Next.js security update |
| D04 | Supabase PostgreSQL + Prisma selected | Backend | Resolved by owner and ADR 0007; live migration/connectivity evidence pending |
| D05 | UI device/accessibility matrix | Frontend + owner | Before UX acceptance: supported mobile/desktop browsers, keyboard/screen-reader and language checks |
| D06 | Signed intent versus ERC-2771 / account abstraction | Blockchain | MVP 2: default direct EIP-712 intent; finalize nonce, expiry, sender/ERC-1271 policy and migration tests |
| D07 | Selected: client ElGamal homomorphic tally; exact SDK/parameters/validity/decryption proofs and Semaphore/EVM compatibility pending | Cryptography reviewer | MVP 3 gate: evaluate ElectionGuard reviewed design/reference code, pin audited scope/revision, browser support, encodings, costs and adversarial vectors; no custom primitives |
| D08 | Selected: one fresh independent election key and single holder initially; secure custody/backup/retention details pending | Crypto + operations | MVP 3: bind public key and mode, test key separation/loss, disclose holder can decrypt individuals. Threshold/DKG/roster is future extension only, requiring new election/key |
| D09 | Credential replacement/revocation/recovery | Identity + security | Default pre-freeze only; no mid-election replacement. Any relaxation needs proof of no extra accepted vote and privacy review |
| D10 | Metadata privacy, minimum meaningful anonymity set, small-result disclosure | Privacy + researcher | Before MVP 3 claims: synthetic linkage experiment, log/ingress audit, explicit observer/collusion assumptions |
| D11 | Canonical bytes, accepted-set tree/count, proof/key/circuit versions | Crypto + verifier | MVP 3 interoperability gate; mutation and cross-language vectors required |
| D12 | Selected: Public Audit Dataset + Standalone Election Verifier; retention/mirrors/repair details pending | Operations + owner | Retain public accepted records from MVP 3; publish anchored dataset and independent CLI in MVP 4, test missing/altered/duplicate/inconsistent evidence and privacy |
| D13 | Selected: decryption-proof evidence and independent CLI checks; exact proof format and any on-chain tally check pending | Blockchain + crypto | MVP 3 generates/internally checks evidence; MVP 4 verifies aggregate/decryption and machine-readable result. Commitment/signature alone cannot pass |
| D14 | AI authorized datasets, false-positive budget and evaluation split | Researcher | MVP 5 before final evaluation; train/validation/test separated by run/time; no ballot preferences |
| D15 | L1/L2 pair, EVM hardfork, receipt fee fields and finality policy | Blockchain + researcher | MVP 6 entry: verify active networks and security/availability assumptions; select one rollup, not a sidechain mislabeled as equivalent |
| D16 | Statistical sample size and practical latency/cost budgets | Researcher + owner | Pilot each milestone, then freeze target budgets/sample design before final measurements |

No outstanding question requires owner input to finish this document-only initialization. The next action is an explicit MVP 1 instruction. Decisions D01-D05 are then resolved at the implementation planning/setup stage; D07 is intentionally not promised as solved by the roadmap.

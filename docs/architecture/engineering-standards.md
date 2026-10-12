# Engineering standards

Status: project conventions; runtime enforcement will be added with MVP 1.

## Code and module boundaries

Use English names and TypeScript strict mode by extending the root base configuration. Configure `target`, `lib`, module format, `rootDir`, and `outDir` explicitly per package; frontend and backend requirements differ. Pure domain functions must not read environment variables, call RPC, or depend on Nest/React. Use explicit ports for chain reads, authorization, submission, storage, and time where actually needed. Do not create a universal abstraction for hypothetical protocols.

Keep shared models versioned and small. HTTP DTOs, domain values, database rows, chain ABI values, and proof witness inputs are different types. Runtime validation is mandatory for HTTP, environment settings, contract metadata, archive contents, and proof public inputs. Bound lengths, array sizes, integers, and payload sizes; reject unknown protocol versions.

## API contract conventions

The following are design requirements, not implemented endpoints:

| Surface | Proposed contract | Authorization |
| --- | --- | --- |
| Election discovery | `GET /v1/elections`, `GET /v1/elections/{electionId}` | Public; includes protocol/chain/checkpoint metadata |
| Administration | `POST /v1/admin/elections`, versioned configuration updates | Authenticated admin role; chain changes still require authorized signer |
| Gasless submission (MVP 2) | `POST /v1/submissions` with signed intent and bounded payload | Signature-authorized ballot, not merely authenticated session |
| Submission lookup | Opaque receipt reference and normalized status | No sequential identity-linked identifiers; no choice leakage in errors |
| Issuance (MVP 3) | Separate origin/API for enrollment and credential lifecycle | Identity session; cannot call ballot endpoints with forwarded session |
| Public verification (MVP 3/4) | Immutable manifest/dataset by content hash | Public and independently downloadable |

Define OpenAPI and runtime request/response schemas in MVP 1. Errors use `{ "error": { "code": "STABLE_CODE", "message": "Safe explanation" } }`; no stack traces, secrets, or raw RPC payloads. Correlation IDs, when needed internally, must not cross identity and voting systems. Publish status and retryability without misrepresenting an RPC timeout as a rejected vote.

Use explicit units and string encodings for bigint values. Reject ambiguous field encodings, out-of-range scalars, wrong checksum/length, mismatched chain IDs, and duplicate IDs. All commitment serialization needs versioned test vectors across browser, server, Solidity, and independent verifier. Do not hash arbitrary JSON object iteration order.

Admin HTTP sessions require secure cookies, CSRF protection, role checks, bounded requests, and session expiry. A wallet connection does not authenticate a human identity. If wallet login is introduced, use a reviewed challenge-signature flow with domain, nonce, expiry, and server-side nonce consumption. That login remains separate from contract voting authorization.

## State and failure handling

On-chain acceptance is authoritative. Submitters track logical submissions separately from attempts; replacement transactions share intent but may have new hashes. Use transactional queues/outbox patterns only when introduced by a real retry requirement. Recover after crashes by reconciling durable jobs and receipts. Database constraints support idempotency, but chain state enforces vote uniqueness.

Indexer checkpoints contain block number and hash, transaction hash, log index, and finality level. Roll back orphaned projections and rebuild from canonical history. Never silently rewrite finalized datasets: publish a superseding record with reason and evidence if the network assumptions fail.

## Tests and CI planned for MVP 1

| Check | Purpose | Evidence required |
| --- | --- | --- |
| Lint, format, typecheck, build | Consistent code and executable artifacts | Exact tool versions, commands, exit codes |
| Unit/property tests | Domain state transitions, encoding, boundary conditions | Inputs, seeds, meaningful invariants |
| Contract tests | Access control, eligibility, duplicate prevention, timing, events | Local chain configuration, actual revert/state assertions |
| Integration | API/storage/chain reconciliation and failure recovery | Isolated database/chain; no shared testnet state |
| E2E | Create, authorize, vote, reject duplicate, close, show correct results | Synthetic accounts; test wallets clearly isolated from real keys |
| Security-focused tests | Untrusted input, role abuse, race/replay, secret/log leakage | Threat-model ID coverage and negative fixtures |
| Benchmark | Reproducible gas/latency/outcomes | Raw data, run manifest, analysis script and revision |

CI will run locked installs and required checks on pull requests using least-privilege tokens and pinned actions. Synthetic integration jobs need no real secrets; deployment keys must not be available to untrusted pull-request jobs. Record advisory scans separately from functional tests. Add circuit, proof mutation, verifier and load suites at their milestones. A skipped check is not a pass.

Do not create redundant tests for text conventions alone. Current initialization checks validate documents/configuration, not security properties or runtime compatibility.

## Configuration, secrets, and reproducibility

Use `.env.example` only for nonsecret names/placeholders and validated environment-specific config. Never expose RPC secrets, admin keys, trustee shares, or database passwords through frontend public variables. Local automated tests use disposable fixture accounts; the owner's personally controlled development wallet is selected for testnet deployment/admin during authorized MVP work. Load its secret from secure runtime environment configuration; never embed it in fixtures, command-line arguments or artifacts. Each encrypted election has a fresh independent ElGamal key, accessible only to the tally process and separate from signing/relayer keys. Never derive it from a wallet seed or signature. Environment injection does not protect against a compromised host. See ADR 0005 for custody, backup and loss limitations; this is development-only key management.

Use migrations with rollback/recovery notes and test database restoration. Pin dependency/compiler/container versions, optimizer settings, EVM target, contract bytecode hashes, circuit/verifying key/proving artifact hashes, and dataset schemas. Large public artifacts belong in versioned object storage with checksums and retention, not unreviewed Git blobs. Preserve benchmark outputs or content-addressed pointers; no blanket results ignore rule.

## Git and release policy

Keep `main` as the existing branch. Suggested focused commit prefixes: `docs:`, `chore:`, `feat:`, `fix:`, `test:`. These are new conventions, not discovered history. Use small reviewable changes and preserve unrelated work. Record decision changes in ADRs rather than overwriting past rationale without trace.

Milestone tags are only permitted after the matching acceptance record passes: `mvp-1-basic-voting`, `mvp-2-gasless`, `mvp-3-anonymous-zk`, `mvp-4-public-audit`, `mvp-5-ai-fraud`, `mvp-6-layer2-benchmark`. Preserve old contracts/configurations; new election versions must not mutate existing histories. Initialization creates no tags and makes no claim of an implementation release.

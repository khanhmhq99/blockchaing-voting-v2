# Engineering instructions

## Purpose and current scope

On 2026-10-14 the owner explicitly authorized MVP 3 implementation using MACI, superseding the earlier MVP 2 stop boundary and the DAVINCI/Semaphore-specific MVP 3 cryptographic plan below. Resume from `docs/mvp3/maci/PROGRESS.md` and `docs/mvp3/maci/IMPLEMENTATION_PLAN.md`. Preserve all prior source, ABI, deployments, research and evidence. No mainnet, real electorate, destructive managed-database migration or automatic trusted setup ceremony is authorized. BSC Testnet deployment is conditional on the MACI license, artifact provenance, local proof and compatibility gates in the current plan.

This is an HCMUT Master's thesis research prototype for blockchain-based electronic voting. Prioritize correctness, security and privacy, independent verifiability, reproducibility, maintainability, performance, then development speed.

The owner explicitly authorized MVP 2 gasless implementation and local blockchain deployment on 2026-10-12, superseding the earlier MVP 1 stop boundary. Preserve MVP 1 source, ABI, deployments and benchmark evidence. Acceptance gates are recorded in docs/mvps/mvp-1.md and docs/mvps/mvp-2.md; live Supabase and real MetaMask acceptance remain separate gates. Finish MVP 2 verification and documentation, then stop. Do not start MVP 3, deploy to mainnet, spend real cryptocurrency or perform destructive managed-database migrations.

The owner additionally authorized deploying GaslessVoting to BSC Testnet (chain 97) and filling the environment deployment address/block on 2026-10-12. Only test BNB may be spent; this does not authorize mainnet or managed database changes.

Communicate with the owner in Vietnamese. Use English for code, comments, identifiers, filenames, API specifications, and architectural terminology. Documentation in this repository is written in English for consistency.

## Navigation

- `README.md`: project status and document index.
- `docs/architecture/`: inspection, component boundaries, technology evaluation, engineering standards, and ADRs.
- `docs/protocols/voting-protocol.md`: baseline versus proposed anonymous protocol.
- `docs/security/threat-model.md`: assumptions, threats, verification requirements, residual risks.
- `docs/research/`: research design and unresolved decisions.
- `docs/benchmarks/measurement-spec.md`: reproducible measurement contract.
- `docs/mvps/`: roadmap and individual milestone plans/evidence records.
- `tsconfig.base.json`: shared strictness settings; not a standalone build configuration.

MVP 1 uses one Next.js web app in apps/voter-web, one modular NestJS API in services/api, Solidity contracts and shared types in packages. Supabase PostgreSQL through Prisma is the only runtime relational database. Business logic and API orchestration stay in NestJS; never expose database credentials or Supabase privileged keys to the browser. No Supabase Auth or Realtime is approved.

## Architecture and modification rules

Read relevant ADRs, protocol, threat model, and previous milestone records before edits. Inspect Git state; preserve the owner's unrelated changes. Plan affected files, dependencies, architecture/security impact, acceptance tests, and measurements before implementation. Prefer additive, focused changes and versioned interfaces over rewrites. Record breaking changes and reproducibility consequences in an ADR.

Domain logic must not import web, database, RPC, or cryptographic implementation frameworks. Use small authorization and submission ports when first needed; do not implement future adapters early. Keep crypto and proof generation outside UI components. Treat the chain as authority for accepted votes and the database as a rebuildable projection. Separate identity storage, ballot storage, service credentials, and logging by MVP 3; logical folders alone do not establish a trust boundary.

## Code and dependency standards

Extend `tsconfig.base.json`; explicitly configure module resolution and runtime settings in each future package. Validate every external input at runtime. Use stable error codes and sanitized messages. Use integers/bigints for gas, fees, and field elements; serialize bigints as specified strings. Never silently round field elements or accept noncanonical encodings. Avoid circular imports, duplicated rules, hardcoded secrets, or floating dependency versions in reproducibility artifacts.

Before installing packages, recheck official release support, advisories, peer dependencies, compiler bugs, and target EVM compatibility. Pin exact versions, package-manager/runtime versions, and one lockfile after smoke tests. Do not use an unchecked `latest` scaffold. Follow `docs/architecture/technology-stack.md`; proposed version families are not a tested dependency matrix.

## Commands and checks

Available commands: npm.cmd run lint, typecheck, build, prisma:validate, test:unit, test:integration, test:contracts, test:e2e, benchmark:mvp1, db:check and db:migrate:status. See docs/deployment/supabase.md. Use Node 24.21.0 and npm 11.19.0 with the single package-lock.json. Tests with an in-memory database are explicitly labeled; do not report them as Supabase connectivity or migration validation.

Runtime database configuration uses DATABASE_URL with verified TLS and bounded pools. Migrations use MIGRATION_DATABASE_URL on direct/session connectivity. Never run reset, db push or destructive migrations on the owner's project without explicit authorization.

On Windows use npm.cmd and the verified repository-local Node when needed; do not change system execution policy. Restricted sandbox tsx/Hardhat checks may require the authorized normal Windows execution environment due to uv_os_get_passwd failures.

Run git status and git diff --check; untracked files also need whitespace/link checks. Preserve existing changes. Record actual exit results; skip missing managed services explicitly.

## Security and privacy rules

Use reviewed primitives, never custom encryption or proof systems. Every security claim must name assumptions, an adversary, and a verification method. ZK membership is not ballot validity or tally correctness; blockchain immutability is not election correctness. Preserve authorization-to-ballot binding and enforce uniqueness atomically on-chain.

Never commit or publish real identities, contact details, credentials, secrets, private keys, individual real plaintext votes, or identity-to-ballot/nullifier joins. MVP 1/2 use synthetic voter identities and disposable voter wallets; the owner's personally controlled development wallet is permitted separately for testnet deployment/admin when MVP implementation is explicitly requested. Their chain histories cannot later be made private. Real electorate experiments require a separate approved research/privacy protocol.

Do not log request bodies, credentials, proof witnesses, encryption randomness, session identifiers, or joins between identity and voting endpoints. Public cryptographic evidence needs a deliberate publication path, not unrestricted telemetry. Follow the threat model for revocation, single-holder key misuse/loss, future trustee collusion, timing correlation, withheld data and compromised clients.

AI may emit operational alerts only; it must not use individual choices as features or invalidate valid votes. Do not claim coercion resistance, receipt-freeness, protection from compromised endpoints, or honest identity issuance.

## Accepted cryptography and verification decisions

Follow ADRs 0004-0006. Load the development signing key only through secure environment configuration; never request/commit/log private keys or seed phrases. Keep admin/deployer, relayer and election-decryption secrets separate. Generate a fresh independent ElGamal key pair for each encrypted election; never derive it from the development wallet. The initial single holder can decrypt individual ciphertexts even though normal operation decrypts aggregates only; do not claim secrecy against that holder. Threshold decryption is a future versioned upgrade, not an initial requirement.

MVP 3 delivers anonymous credentials, membership/ballot-validity proofs, election nullifiers, client ElGamal encryption, homomorphic tally and internally checked decryption evidence. MVP 4 delivers the Public Audit Dataset and independent CLI verifier with machine-readable proof-validation results. Preserve publicly reconstructible accepted records from MVP 3. Evaluate reviewed implementations; do not implement custom cryptographic primitives. No permanent voter wallet is required in the final credential design.

## Evidence and completion

Use meaningful tests for acceptance invariants, negative cases, concurrent duplicates, replays, reorgs, crypto input mutation, and audit completeness as applicable. Record exact commands, exit results, environment, Git revision, raw measurements, and limitations in the MVP record. Never fabricate tests or benchmarks. Label observed, simulated, estimated, and not-measured values separately.

Use one evolving application and preserve earlier protocol configurations. Only tag a milestone after all acceptance criteria pass. No commit, tag, or deployment is implied by architecture initialization. A milestone with unresolved cryptographic gates is incomplete, even if a UI demonstration works.

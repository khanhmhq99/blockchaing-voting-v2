# Blockchain-Based Electronic Voting

HCMUT Master's thesis research prototype. **MVP 1 is implemented and locally exercised; acceptance is incomplete until live Supabase and real MetaMask checks pass.** Updated 2026-10-12. No public-network deployment, commit or milestone tag was created. MVP 2-6 remain design only.

The baseline uses public synthetic wallets and choices. Smart contracts determine eligibility, one-vote enforcement, lifecycle and results. Database rows cannot authorize a vote or override a tally.

## Implemented architecture

- One Next.js/React/TypeScript web app with Vietnamese voter and admin views, Tailwind and an injected-wallet adapter.
- NestJS/TypeScript API with signed, expiring administrative challenges and Viem blockchain reads/indexing.
- Supabase PostgreSQL through Prisma, with a private schema, verified TLS and separate runtime/migration configuration. No Supabase Auth, Realtime or browser database credentials.
- Immutable Solidity contract with OpenZeppelin owner checks, candidate commitments, batched synthetic-wallet authorization, frozen configuration, timed voting, cancellation and finalization.
- Vitest tests, real Hardhat EVM scenarios, Playwright browser workflow, and exploratory 10/100/1000-voter benchmark artifacts.

Node 24.21.0, npm 11.19.0 and all package versions are pinned. See [technology matrix](docs/architecture/technology-stack.md) and the single package-lock.json.

## Setup and run

Follow [Supabase and deployment instructions](docs/deployment/supabase.md) for credentials, TLS, private-schema roles, migrations and MetaMask. Copy .env.example to an ignored .env and fill only the actual project configuration. There is no local PostgreSQL service or fake production database fallback.

On this Windows workstation, select the verified portable runtime when the global Node shim fails:

```powershell
$env:PATH = "$PWD\.tools\node-v24.21.0-win-x64;$env:PATH"
npm.cmd ci
npm.cmd run prisma:generate
npm.cmd run prisma:validate
npm.cmd run db:migrate:status
# Review the additive migration against your existing project first.
npm.cmd run db:migrate:deploy
npm.cmd run db:check
```

Run the following in separate terminals as directed in the deployment guide:

```powershell
npm.cmd run chain
npm.cmd run deploy
# Copy the public deployment address/block into local .env, then:
npm.cmd run dev:api
npm.cmd run dev:web
```

Open http://localhost:3000. Use chain 31337 and separate public development wallets only on the disposable local network. Admin workflow: create, register candidates, sign metadata update, authorize voters, freeze, wait for start, then finalize after the deadline. Voters review their eligibility, select a candidate, confirm wallet/network/gas and inspect the receipt. Local chain confirmation depth should be 1. See the guide for recovery after metadata failures and the optional synthetic seed.

## Verification

```powershell
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
npm.cmd test
node node_modules/@playwright/test/cli.js install chromium
npm.cmd run test:e2e
npm.cmd run benchmark:mvp1
```

See [MVP 1 evidence and remaining gates](docs/mvps/mvp-1.md) and [actual baseline measurements](docs/benchmarks/mvp-1-baseline.md). Browser tests use an injected provider transport against real local transactions and a clearly labeled memory database. They do not establish live Supabase or MetaMask extension compatibility. CI is configured but has not been run on GitHub in this session.

## Documentation

| Document | Purpose |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Engineering, security and milestone boundaries |
| [System overview](docs/architecture/system-overview.md) | Current and future architecture diagrams |
| [ADRs](docs/architecture/adr/README.md) | Decisions, including Supabase and Prisma |
| [API v1](docs/architecture/api-mvp1.md) | Routes, payloads and admin authorization |
| [Deployment](docs/deployment/supabase.md) | Environment, pooling, migrations and demo |
| [Threat model](docs/security/threat-model.md) | Assumptions, mitigations and residual risks |
| [Protocol](docs/protocols/voting-protocol.md) | Public baseline and future anonymous protocol |
| [Cryptographic compatibility](docs/architecture/cryptography-compatibility.md) | ElGamal/ZK composition gates; no custom crypto |
| [Roadmap](docs/mvps/roadmap.md) | MVP 1-6 boundaries |
| [Measurement contract](docs/benchmarks/measurement-spec.md) | Reproducibility and metric definitions |
| [Initialization report](docs/initialization-report.md) | Historical pre-implementation inspection |

Future encryption uses a fresh election-specific ElGamal key, initially a single holder who can decrypt individual ciphertexts. Anonymous credentials and homomorphic tally belong to MVP 3; public datasets and an independent verifier belong to MVP 4. Do not infer privacy from blockchain immutability or start later milestones without an explicit instruction.

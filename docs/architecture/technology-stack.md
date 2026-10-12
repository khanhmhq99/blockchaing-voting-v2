# Technology evaluation

Review date: 2026-10-11, Asia/Saigon. This is a recommendation, not an installed or tested bill of materials. Version families below are intentional: exact package pins require package metadata, advisory review, and smoke tests at implementation time. No registry install or transitive dependency audit was performed in this phase.

## Recommended candidates

| Area | Recommended evaluation target | Compatibility, maintenance, and alternative |
| --- | --- | --- |
| Runtime | Node.js 24 LTS; 24.21.0 is a verified published candidate, subject to newer security patches | The official schedule supports the 24 line through April 2028. Local Node 20 is not the target. Node 22 is a fallback only if a dependency requires it. [Release schedule](https://github.com/nodejs/Release), [24.21.0 release](https://github.com/nodejs/node/releases/tag/v24.21.0) |
| Package manager | npm 11.19.0, Node 24.21.0 | Selected MVP 1 matrix; one npm workspace lockfile. See ADR 0007. |
| Web | Next.js 16.4 family, React/React DOM 19.3 family as compatibility candidates | Recheck patched releases before installation. Next 16.4 documents React 19.3 support. Use one app initially; Vite is a simpler alternative if SSR is unnecessary. [Next 16.4](https://nextjs.org/blog/next-16-4), [installation](https://nextjs.org/docs/app/getting-started/installation) |
| API | NestJS 12 family, Node 24, ESM | Current migration guide describes ESM-only v12 packages, a higher CLI Node floor, and TypeScript 6. Account for ESM test/ORM plugins. Fastify directly is a lighter alternative; Nest provides clearer modular boundaries. [Migration guide](https://docs.nestjs.com/migration-guide) |
| Types | TypeScript 6.0 family, strict; exact patch pinned after peer review | Prefer a tested common compiler version, not an automatic compiler-major upgrade. Configure frontend bundler and backend NodeNext resolution separately. [6.0 notes](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html) |
| Styling | Tailwind CSS 4.x | Validate the intended mobile browser matrix; v4 has modern browser requirements. Native CSS is a fallback without build/plugin coupling. [Upgrade/browser guide](https://tailwindcss.com/docs/upgrade-guide) |
| Contracts | Solidity 0.8.37 as compiler candidate; explicit EVM target and optimizer settings | Read known compiler bugs for the exact options. Do not use development builds. Select opcodes supported by both eventual target chains. [Official announcements](https://forum.soliditylang.org/c/announcements/5), [known bugs](https://docs.soliditylang.org/en/latest/bugs.html) |
| Contract tools | Hardhat 3.x and compatible Viem toolbox | Node 24 fits the documented Node floor; verify ESM/plugin peers. Foundry is an alternative for fuzzing if needed, not a second mandatory toolchain. [Getting started](https://hardhat.org/docs/getting-started), [Hardhat 2 lifecycle](https://hardhat.org/docs/reference/hardhat-2-end-of-life) |
| EVM client | Viem 2.x, exact patch pin | Typed ABI and bigint interfaces; confirm toolbox peers and TypeScript types. Ethers 6 is the fallback if a selected integration requires it. Avoid two clients in the baseline. [Viem documentation](https://viem.sh/docs/getting-started) |
| Access control | OpenZeppelin Contracts 5.x | Pin the selected package and confirm each imported file's Solidity pragma. Prefer non-upgradeable election contracts. [Contracts docs](https://docs.openzeppelin.com/contracts/5.x), [advisories](https://github.com/OpenZeppelin/openzeppelin-contracts/security/advisories) |
| Database | Supabase PostgreSQL + Prisma/client/adapter-pg 7.10.0 and pg 8.23.1 | Existing managed project; private voting schema; separate runtime/migration URLs, verified TLS. Server version must be recorded once connected. No local PostgreSQL container. |
| Anonymous membership | Semaphore v4 evaluation at MVP 3 | Match identity/group/proof/contracts packages and circuit artifacts. Freeze tree depth, supported root policy, scope, hash encoding, setup provenance. [Protocol](https://docs.semaphore.pse.dev/), [proof API](https://docs.semaphore.pse.dev/guides/proofs) |
| Custom constraints, if necessary | Circom 2 + snarkjs, exact compatible artifacts deferred | Reuse reviewed circuits where possible. Custom constraints and their composition require review and fresh setup where applicable. [Circom proof workflow](https://docs.circom.io/getting-started/proving-circuits/) |
| Ballot/tally protocol | Selected: ElGamal homomorphic tally, one election-specific key/holder initially; threshold upgrade path | Evaluate ElectionGuard implementations against their supported specification and review evidence. Exact library/curve, browser support, single-holder proof API and EVM cost remain unvalidated; see [compatibility evaluation](cryptography-compatibility.md). [Official specifications](https://electionguard.vote/spec/), [verifiability concepts](https://electionguard.vote/concepts/Verifiability/) |
| Public data | S3-compatible object storage plus independently operated mirror | Content hashes and immutable manifests; content addressing alone does not guarantee availability. Provider/version deferred to MVP 3/4. No PII buckets in the public namespace. |
| Observability | Prometheus + Grafana; versions deferred to MVP 4 | Only aggregate allowlisted metrics. An early JSON receipt collector suffices for MVP 1. Separate deployment/credentials from identity data. |
| AI | Python 3.13 + scikit-learn 1.9 family as future evaluation candidates | Recheck NumPy/SciPy wheels and pin the entire environment at MVP 5. Begin with rules; models are experimental. [Installation matrix](https://scikit-learn.org/stable/install) |
| Tests | Node test runner for compatible Hardhat tests; Vitest and Playwright candidates for app testing | Pin after ESM/TS/browser integration checks. Test actual authorization and state transitions, not only mocks. |
| Infrastructure | Supabase managed database and Hardhat loopback EVM | No Docker dependency for MVP 1. No public hosting performed. |

## Advisory findings and installation gate

The [official Next.js notice dated October 8, 2026](https://nextjs.org/blog/upcoming-nextjs-security-update-october-2026) announces an upstream security update planned for October 14. At this review date that patch is not yet available from the cited notice. Therefore no exact Next.js patch is approved here, and no claim of an unaffected deployment is made. Recheck affected versions and patched releases before selecting the implementation pin; document the resolution. This is a concrete dependency risk, not a reason to delay architecture work.

OpenZeppelin's advisories and Solidity's known-bug list were consulted as review entry points. Without a selected import graph, optimizer configuration, or lockfile, applicability remains unresolved. Package-audit output alone cannot establish contract or circuit security.

Before installing for an authorized MVP:

1. Verify release dates, maintained branches, package `engines`, peer dependencies, licenses, security notices, and known compiler bugs from primary sources. Record URLs and date.
2. Select exact Node, npm, framework, client, contract library, compiler, and test versions. Freeze one lockfile; no unchecked `@latest` generation.
3. Run a minimal web production build, API startup, shared-package typecheck, contract compile/test, and browser-to-local-chain transaction smoke test. These are future validation tasks, not results.
4. Inspect dependency advisories including transitive packages; document accepted limitations and resolve critical applicable issues before a demonstrable release.
5. Save the tested matrix, container digests, compiler settings, and source/artifact hashes. Re-run affected tests on updates.

## Accepted development key and audit model

The owner's development wallet is selected for testnet deployment/admin, with secure environment injection and no committed secrets. Encrypted elections use independent fresh ElGamal keys, initially one holder; no privacy against that holder is claimed. MVP 4 selects Public Audit Dataset + Standalone Election Verifier with public chain anchors, evidence reconstruction and machine-readable results. These choices do not approve any installation or deployment now.

## Cryptographic compatibility gate

Semaphore v4 handles anonymous membership messages; it does not supply encrypted-choice validity or aggregate decryption. Circom arithmetic fields, encryption group operations, canonical encodings, and Solidity verifiers must agree exactly. Groth16 custom circuits need circuit-specific setup in addition to reusable powers of tau; verify artifact provenance. No compatibility is inferred merely because packages install together.

Do not label an ElectionGuard-inspired subset as ElectionGuard-compliant. Adopt a reviewed supported implementation, verify known-answer/interoperability vectors, and record deviations. If enforcing ballot validity on-chain is infeasible, an explicit pending-ballot and verifiable-finalization redesign is required; a backend-only validity filter is not an equivalent security claim.

## Tested MVP 1 package matrix (2026-10-12)

Exact pins are in package.json/package-lock.json: Node 24.21.0, npm 11.19.0, Next 16.4.0, React 19.3.0, Nest 12.1.2, TypeScript 6.0.2, Tailwind 4.3.3, Prisma/client/adapter 7.10.0, pg 8.23.1, Viem 2.57.4, Hardhat 3.19.0, OpenZeppelin 5.6.1, solc 0.8.37, Vitest 5.0.3 and Playwright 1.64.0. Compiler target is Paris with optimizer 200. This matrix has a local build/test record; actual Supabase server version and migration compatibility remain unverified.

ESLint 10.12.0 and typescript-eslint 8.71.1 support the selected TypeScript major; the earlier candidate ESLint/TS plugin combination was rejected by peer checks. Transitive overrides pin deepmerge-ts 8.0.2, mysql2 3.24.5 and tmp 0.2.7 after package audit findings. Prisma generation/validation, builds and exercised tests passed with these overrides; this does not establish all unused transitive functionality. The installed dependency audit reported zero vulnerabilities.

The earlier announced Next.js advisory remains a public-hosting review gate; the previously recorded notice could not be fetched in the final documentation recheck. No claim of an unaffected release is made from a clean npm audit. This prototype is local and uses a static frontend export; recheck official advisories and patches before public deployment. No dependency upgrades beyond the tested lockfile are automatic.

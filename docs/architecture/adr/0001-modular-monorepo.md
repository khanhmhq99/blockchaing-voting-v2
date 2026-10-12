# ADR 0001: One modular monorepo with staged services

Status: accepted for planning. Date: 2026-10-11.

## Context

The repository was empty at discovery. Six thesis milestones must remain one reproducible application, while identity, relay and tally-key boundaries need separation. ADRs 0005-0006 subsequently select initial single-holder custody; independent trustees remain a future extension.

## Considered options

1. Six independent applications: easy snapshots, duplicated logic and incomparable workloads.
2. All proposed microservices and three frontends immediately: explicit process boundaries, excessive setup and integration cost.
3. Modular monorepo, one web app and API initially, extracting processes when required by a milestone.

## Decision

Choose option 3. Use Next.js voter/admin routes and a NestJS modular API in MVP 1; pure domain/shared types/contracts are packages. Add the relayer at MVP 2 and isolate identity issuance at MVP 3. Create a dedicated audit frontend only if MVP 4 warrants it. Defer all runtime scaffolding until MVP 1 authorization. The package-manager proposal is superseded by ADR 0007: npm 11.19.0 workspaces and one package-lock.json are used for MVP 1.

## Trade-offs

Lower setup overhead and simpler end-to-end testing, but discipline is needed to prevent cross-module imports. Service extraction needs new deployment/authentication boundaries; folders alone do not enforce isolation.

## Security implications

The synthetic baseline can share administration/eligibility infrastructure. Anonymous voting cannot claim operator separation until databases, ingress, sessions, credentials, and logs are actually isolated. Client proof generation is outside the server trust boundary but still depends on a trustworthy delivered client bundle.

## Research implications

Shared scenarios and versioned adapters improve comparison. Any process extraction changes latency and resources; record those confounders explicitly. Do not compare an unoptimized baseline with a heavily optimized new protocol and attribute all improvement to cryptography.

## Revisit when

Measured resource contention, deployment trust requirements, or frontend permissions justify a split. Record the benchmark and threat-model evidence before adding infrastructure.

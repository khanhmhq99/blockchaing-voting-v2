# MVP 2: Gasless voting

Status: explicitly authorized and implemented locally on 2026-10-12. This original plan is retained; actual scope, verification and unresolved gates are recorded in [MVP 2 evidence](mvp-2.md). Live MVP 1 gates remain open and are not retroactively claimed complete. Intended tag: `mvp-2-gasless` only after full acceptance.

## Objective and scope

Sponsor transaction fees without permitting the sponsor to invent or modify votes. Implement signed intent, on-chain verification, replay/domain protection, queue/retry/idempotency, budgets, status and cost measurement. Improve voting UX and evaluate walletless mechanisms for the next milestone.

Exclude anonymous credentials, encrypted ballots, AI, L2 and a mandatory permanent custodial wallet for each person. This milestone may still require MetaMask signing and exposes the choice.

## Dependencies

Accepted MVP 1 code/configuration/raw benchmark; D06 authorization decision; exact EVM/signature-library versions. Baseline direct EIP-712 intent is proposed. Assess ERC-2771 or account abstraction only if justified by requirements; do not add all three. Define EOA/contract-wallet coverage and sponsor funding for disposable local test accounts.

## Modules and architecture changes

Add `services/relayer`, durable submission jobs and cost/receipt tracking; add signed-intent contract path in a new protocol/deployment version, shared typed-data schemas, and web status/signing flow. Extend API/status projections and synthetic scenarios. Preserve MVP 1 replay fixtures and direct submission semantics. Use one shared wallet-spent invariant across direct/relayed paths if both are enabled.

## Implementation sequence

1. Freeze intent fields, domain/version, nonce scope, expiry semantics and canonical digest vectors.
2. Implement on-chain signer authorization and replay protection with mutation tests for every field.
3. Add relayer preflight checks, configured contract/chain/function allowlists, bounded queue/fees/rate budget, a limited-purpose relay signer separate from the admin/deployer and election decryption keys, and durable intent state.
4. Implement atomic worker nonce allocation, receipt reconciliation, crash recovery, replacements and retry limits. Never blindly resubmit on timeout.
5. Add web signing/confirmation/status and compare direct/sponsored workflows.
6. Produce a walletless options ADR: client-generated anonymous credentials versus embedded/custodial wallets, with recovery/linkability assumptions. No walletless claim solely from sponsorship.

## Acceptance criteria and testing strategy

All statuses: **not run**.

| ID | Criterion | Verification |
| --- | --- | --- |
| M2-A1 | Sponsored valid vote consumes zero voter-paid network fee | Actual receipt/payer balance reconciliation on local synthetic accounts |
| M2-A2 | Relay cannot fabricate/modify authorization | Invalid/missing signature, changed candidate/manifest/election tests; T04 |
| M2-A3 | Replays/expired/wrong-domain intents cannot create another vote | Wrong chain/contract/version/nonce/election tests, direct/relay race; T02/T03 |
| M2-A4 | Retries and worker restarts preserve at-most-one acceptance | Crash after send/before persistence, nonce contention, replacement and timeout integration tests |
| M2-A5 | Sponsorship policy bounds resource spend and admission | Flood invalid intents, exhaust budgets, reject arbitrary calldata/destinations; T05 |
| M2-A6 | UI tracks actual lifecycle and usable failure states | E2E signing refusal, queued, included, reverted, dropped/replaced/reorged states |
| M2-A7 | Sponsor cost and direct/relay comparison are reproducible | Per-attempt fees and infrastructure basis; paired same-workload runs |
| M2-A8 | Migration and public-choice limitations are explicit | Updated ADR, threat model, API spec and walletless evaluation |

Run existing MVP 1 regression, contract replay/access-control suites, relayer database/queue integration, end-to-end sponsored vote, and privacy/log review. If ERC-1271 is unsupported, reject/document rather than falsely claiming every wallet works.

## Benchmark requirements

Measure the prior direct baseline before changes, then paired direct/relayed executions under matched semantics. Separate gas units, fee payer, sponsor network spend, queue wait, inclusion/finality, failures/retries, and relay compute/storage cost. Include budget exhaustion and invalid submission load. Gasless is not lower gas by definition; extra signature verification may increase system cost.

## Risks and migration considerations

Relayer censorship/availability and IP/timing visibility remain. Weak nonce/state management can duplicate attempts or waste sponsor funds. Map T02-T06/T18/T19. Isolate submission transport from authorization so MVP 3 can use proof-authorized messages without durable citizen wallets. Preserve old signed-intent deployments for synthetic reproducibility; never reuse old signatures under a new domain.

## Implementation summary

Not started. No relayer, signature verifier or gas sponsorship implemented.

## Test evidence

Not run; no operational or replay-resistance claims established.

## Benchmark results

Not measured. Zero voter cost is a target, not an observation.

## Known limitations

Keep the owner's development admin wallet separate from synthetic voter authorization and the relay signer. Public wallet identity and plaintext choice remain; sponsor can censor; gasless alone is not walletless or anonymous.

## Git revision or tag

Implementation revision: none. Tag: not created.

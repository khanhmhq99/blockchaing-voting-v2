# MVP 3 architecture audit and target boundaries

> Historical DAVINCI/Semaphore architecture. Product-specific cryptographic requirements are `SUPERSEDED_BY_MACI` by [ADR 0010](../architecture/adr/0010-maci-mvp3-protocol-migration.md). See the [MACI architecture](maci/ARCHITECTURE.md). Prior research findings remain historical evidence, not resolved security gates.

Status: source audit and isolated proof probes on 2026-10-13 at Git `4566b4f07a2d3653e16bca4a24c18aba675af03c`. The full composition gate is **blocked**. This target design is conditional on [proposed ADR 0009](../architecture/adr/0009-mvp3-encrypted-ballot-proof-composition.md). The original [research wrapper](../../research/mvp3/CompositionProbe.sol) is unsafe for ballot acceptance; the revised [local binding probe](../../research/mvp3/BoundBallotProbe.sol) verifies and records an exact synthetic ciphertext but is not deployment-ready.

## What exists in source

| Area | Observed implementation | MVP 3 consequence |
| --- | --- | --- |
| Web | Next.js desktop portal with account login, voter/admin pages and preserved `/mvp2-baseline` | Keep the design and route family; add an explicit anonymous mode only after proofs work |
| API | NestJS controllers; Prisma on Supabase PostgreSQL; app-owned username/password and opaque HttpOnly sessions | There is no Supabase Auth integration; the issuer may authenticate, the ballot submission path must not carry that session |
| MVP 1 | `BasicVoting.sol`, public addresses/candidates and direct-wallet UI | Preserve public historical records and comparison path |
| MVP 2 | `GaslessVoting.sol`, EIP-712 intent, on-chain nonce/spent checks, relayer queue/budget/reconciliation | Reuse operational sender controls only through a new anonymous adapter; the current signed intent embeds voter address and plaintext candidate |
| MVP 2.5 | `AppUser`/`AppSession`/`ElectionVoterIdentity`; API-generated encrypted EOA key per user/election; `AuthService.vote` accepts `candidateId` | This flow is walletless but not anonymous; account, EOA, plaintext candidate, request and transaction are linkable |
| Data | `GaslessVoteRequest` stores address and candidate; `ElectionVoterIdentity` links account to address; indexed events and chain counts are projections | Never reuse these tables for anonymous ballots. Existing data cannot be made private retrospectively |
| Lifecycle | Draft configuration, owner eligibility, freeze, active window, close/finalize/cancel on chain | A new contract must freeze root, key, manifest, candidate order and proof versions before opening |

`AuthService.vote` checks the logged-in account's election identity, reads chain eligibility/nonce, signs with the API-held key and sends a plaintext candidate to the existing relayer. The current API therefore can read and change the choice; its database can join account to public ballot. The current relayer validates `VotingIntent.candidateId` and `voter`, and its durable queue persists both. The browser shows transaction history per authenticated account. The chain remains the authority for acceptance, while PostgreSQL is a projection and operational queue.

NestJS starts with its logger disabled and a sanitized exception filter. This limits default application logging, but no complete ingress/proxy/RPC/hosting analytics or backup audit has been performed. CORS and cookie configuration are same-origin oriented. A shared API process, origin, database role or operator can still correlate enrollment and ballot timing even if tables have no foreign key. Separate folders alone would not establish an anonymity boundary.

## Conditional target

```text
Authenticated browser -> issuer endpoint -> private account/commitment registry
Client-held election secret -> public frozen commitment snapshot -> local witness
Client selection + frozen election public key -> local encrypted one-hot ballot and validity proof
Local witness + bound ballot digest -> Semaphore membership proof / election nullifier
Uncredentialed ballot request -> anonymous relay -> new contract enforcing both proofs
Canonical chain calldata/events -> public accepted-set reconstruction -> aggregate tally
Restricted tally process + election secret key -> aggregate decryption evidence
```

The issuer authenticates with the existing account cookie and enforces one active commitment per eligible synthetic account and election. It stores only commitment state and minimum deduplication data; the secret is generated on the client. Before freeze, replacement atomically removes the old commitment. After freeze, no replacement or alternate root is accepted. A client-controlled backup may support recovery; password-derived identities and server-readable escrow are excluded. Loss after freeze means no vote with a replacement credential in this version. The snapshot is public and identical for all voters; no personalized Merkle path endpoint.

The anonymous request carries no account ID, session cookie, EOA, plaintext candidate or ballot opening. The contract derives fixed scope from protocol version, chain, deployment and election, checks exactly the frozen root, validates the membership message against the exact ciphertext/proof/manifest/key record, verifies exact-one ballot evidence, then consumes the nullifier and emits a canonical accepted record atomically. Full ciphertext and proof bytes remain reconstructible from canonical transaction calldata. API preflight can reject obviously invalid payloads for sponsor protection but never substitutes for contract checks.

Separate issuer and ballot roles, databases or schemas, origins, credentials, backups and logs are required before a meaningful operator-separation claim. The current single NestJS process and Supabase schema do not meet that boundary. The relayer may sponsor by transaction simulation, gas budget and idempotent digest, but must not join its request/transaction table with `AppUser`, `AppSession` or `ElectionVoterIdentity`. A browser cannot attach the account cookie to the ballot request. Even with these changes, the relay/network operator may correlate IP and timing; a single election-key holder can decrypt archived individual ciphertexts. Small or unanimous results can reveal choices.

## Cryptographic and verification conditions

Semaphore v4 supplies group membership, public message, scope and nullifier, not ballot validity or tally correctness. Its default on-chain group behavior can accept old roots for a limited period; this election must enforce the one frozen root explicitly. The **first** local wrapper verified Semaphore 4.14.3 and a DAVINCI BabyJubJub ElGamal exact-one proof but did **not** authenticate the accepted ciphertext, key or manifest against DAVINCI's `inputs_hash`; changing the ciphertext record while reusing the proof was possible. The final revised local wrapper closes that record-binding gap for its research ballot specification. A production contract still needs independent review, trusted artifacts and accepted-set tally evidence. See [decisions](DECISIONS.md), [specification](BALLOT_SPECIFICATION.md) and [evidence](FEASIBILITY_EVIDENCE.md).

DAVINCI's circuit has a 16-input Poseidon step not supplied by the installed Solidity Poseidon generators. The final patch exposes the ballot statement and closes an upstream padded-field underconstraint: all inactive plaintexts must be zero and all 16 ciphertexts must be valid encryptions. The contract builds the 72 public signals, fixes a two-candidate exact-one mode, checks a canonical 128-byte manifest, and binds process ID/scope to deployment, chain and frozen manifest with explicit field rejection sampling. The revised verifier locally rejected altered ciphertext, key, manifest, root, scope, vote ID and proof. Two accepted records were aggregated and internally decrypted; a public decryption proof remains absent. One Edge headless proof was measured, while mobile bounds, independently contributed setup, BSC fork behavior and source review remain open. No silent modulo reduction of a ciphertext digest is permitted. ElectionGuard is a separate specification and group/proof ecosystem; it cannot be substituted without a complete compatibility design.

Verification claims require named assumptions and evidence. Membership only says that a credential holder belongs to the frozen set, not that issuance was honest or the ballot is valid. Validity only says that a ciphertext encodes exactly one selection under the chosen manifest/key. Correct aggregate decryption says nothing about ballots withheld from the accepted set or private misuse of the single key. MVP 4 adds the independent CLI and complete Public Audit Dataset; MVP 3 must preserve source records and internally check all of its evidence.

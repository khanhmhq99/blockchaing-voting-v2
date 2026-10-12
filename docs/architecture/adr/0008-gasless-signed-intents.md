# ADR 0008: Versioned EIP-712 voting and durable sponsorship

Status: accepted for implementation by explicit MVP 2 request, 2026-10-12.

## Decision and scope

Preserve BasicVoting.sol, its ABI, deployment records and baseline measurements byte-for-byte. Deploy a new immutable GaslessVoting contract; its lifecycle starts from the baseline snapshot, with one shared internal cast function for direct and sponsored votes. This intentional version snapshot preserves historical compiler input and gas measurements. Do not upgrade or move open elections. New synthetic elections require explicit address configuration and fresh metadata.

Choose direct EIP-712 with the installed OpenZeppelin EIP712/ECDSA implementations. ERC-2771 would add a forwarder and change sender context throughout owner and voting logic without benefit for this one operation. No new dependencies are needed. The signed VotingIntent contains electionId, manifestHash, candidateId (uint256), voter, nonce and deadline. Domain: HCMUT Gasless Voting / 2 / chainId / verifyingContract. Election-scoped nonces and the shared hasVoted guard are consumed atomically for both voting paths. Only EOA signatures are supported; ERC-1271 and delegated smart accounts are outside this version.

## Relayer and persistence

NestJS separates authorization checks from transaction signing/submission. The private voting schema gains additive request, history, transaction and sender-budget records. The intent digest is the idempotency key. A unique active slot prevents competing requests for one voter/election/nonce. Failed pre-broadcast requests release that slot; retries preserve history and are bounded.

A PostgreSQL transaction advisory lock coordinates each chain/sender. Only one unresolved transaction is signed at a time. Persist the exact signed raw transaction, its deterministic hash, nonce and conservative maximum fee reservation before broadcasting. After a crash, reconcile that hash and rebroadcast only identical bytes; never allocate a fresh nonce to an uncertain request. Keep signatures/raw bytes only while recovery needs them, then erase them at terminal confirmation/rejection. Public chain calldata remains permanent. The lifetime budget counts conservative reservations, including orphaned/reverted transactions; no automatic refund or fee bump is made.

Confirmation requires canonical receipt block, configured depth, expected sender/destination/calldata and matching VoteCast. Status reads recheck confirmed receipts and can demote them on reorg. A consumed sender nonce without the expected receipt is a replacement/uncertainty condition and blocks the sender for operator reconciliation. This sacrifices liveness for safe nonce and budget handling. A dropped transaction can be resent as the same bytes until its intent expires; it remains unresolved after expiry if the sender nonce is unconsumed. No fresh automatic transaction retry follows a revert.

## Files, validation and research plan

Change contracts/compiler, shared intent schema, API relayer module/configuration, additive Prisma migration, wallet signing adapter and voting UI. Add adversarial contract tests, real-EVM API tests with explicitly labeled memory persistence, browser signing/recovery tests, and a gated managed-database test. Run existing regression suites, lint/typecheck/build/schema validation, zero-balance sponsorship verification and 10/100/1000 paired local benchmarks with raw fee/timing records. Preserve all MVP 1 evidence. Live Supabase and real MetaMask are separate acceptance gates.

## Assumptions and consequences

The first compile detected MCOPY in the pinned OpenZeppelin 5.6.1 cryptography dependency. MVP 2 therefore targets Cancun; MVP 1 remains Paris. Only Cancun-compatible networks may run MVP 2. The benchmark reports this compiler-target confounder explicitly. The compiler also emits upstream warnings about a future reserved identifier in ECDSA; no custom cryptography or package downgrade is substituted.

ECDSA security, an honest configured RPC/canonical chain and trustworthy voter client are assumptions. A malicious relay cannot alter signed fields or forge authorization under those assumptions; mutation/replay tests verify implementation behavior. It can censor/delay and sees public choices. Separate server-only relayer/admin keys are enforced. Sponsorship is bounded but availability under sustained abuse is not guaranteed. No anonymity or gas reduction is claimed. Future proof authorization gets a new verifier and contract version, reusing transport/persistence only after a separate MVP 3 approval.

References: [EIP-712](https://eips.ethereum.org/EIPS/eip-712), [OpenZeppelin cryptography](https://docs.openzeppelin.com/contracts/5.x/api/utils#EIP712), [baseline decision](0007-supabase-prisma-mvp1.md).

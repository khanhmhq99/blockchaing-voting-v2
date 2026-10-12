# Voting protocol

Status: design specification, not implemented or cryptographically validated. Date: 2026-10-11. MVP 1/2 and MVP 3+ are separate versioned protocols in one application. Never upgrade an open election to a different protocol.

## Shared election semantics

Initial research scope: one contest, one selection from a frozen candidate set, no write-ins, no ranked choice, no revoting. Nonparticipation is permitted; explicit blank-ballot support would change the validity statement and must be decided before freeze. Use only synthetic electorates until a separate real-data protocol is authorized.

An election manifest includes a schema/protocol version, election ID, chain ID, contract address, candidate ordering, start/end times, eligibility rule, root/allowlist commitment, acceptance rules and finality policy. Anonymous versions add ElGamal parameters, public key/key ID and setup evidence, `decryptionMode: single-holder`, circuit/artifact hashes, canonical serialization/hash rules and archive/retention policy. A future threshold mode adds a trustee roster, threshold and ceremony evidence under a new protocol version. Freeze the manifest digest and public key on-chain before opening.

Use chain-enforced `startTime <= block.timestamp < endTime` and an explicit noncancelled state. Closing snapshots a canonical accepted set after the end; finalization never reopens voting. Reorg-dependent close/finality semantics must be specified per chain. Candidate IDs are immutable indexes/identifiers, not mutable display names.

## MVP 1: Public wallet baseline

The owner's personally controlled development wallet is the testnet deployer/admin, with signing secrets loaded only from secure environment configuration. Local automated tests use disposable admin accounts; test voters use separate synthetic identities and wallets. No signing key is reused or derived as an election encryption key. This is a development-only trust model, not production custody. See [ADR 0005](../architecture/adr/0005-development-wallet-and-key-separation.md). This document does not authorize deployment now.

1. **Eligibility:** an administrator validates synthetic eligibility and registers disposable wallet addresses before freeze. One authorized wallet is not proof of one real person.
2. **Authentication:** MetaMask connects a wallet; this exposes an address and allows transaction signing, not civil identity authentication. Admin API authentication is separate from the contract's admin signer authorization.
3. **Configuration:** publish and freeze candidates, allowlist, manifest and window. The voter verifies chain/contract/manifest rather than trusting only API text.
4. **Authorization and submission:** the wallet sends a signed transaction selecting one candidate. The contract checks sender eligibility, voting window/state, candidate validity and unspent status.
5. **Acceptance:** atomically mark the wallet spent, record/increment the selected candidate, and emit an accepted event. Reverting transactions must not consume the wallet's opportunity.
6. **Status:** derive inclusion from receipt/event and finality from the selected chain policy; distinguish timeout/drop/replacement/reorg from rejection.
7. **Tally:** after close, read/reconstruct public counts and reconcile against accepted events and spent-wallet count. Results must equal the accepted set, not an editable database total.
8. **Evidence:** retain receipt, gas, actual fees, event sequence, runtime/chain configuration and benchmark records.

There is no anonymous credential, encryption, ZK proof, or threshold decryption in MVP 1. Sender and choice are visible in transaction data. API redaction does not hide this. Only synthetic ballots are permitted; never describe the baseline as private or anonymous.

## MVP 2: Signed gasless intent

Implementation update 2026-10-12: the exact delivered type is `VotingIntent(uint256 electionId,bytes32 manifestHash,uint256 candidateId,address voter,uint256 nonce,uint256 deadline)` under `HCMUT Gasless Voting` / version `2`. Both direct and sponsored acceptance increment `nonces[electionId][voter]`. The sponsored path is EOA-only. See the [implemented protocol/API](../architecture/gasless-voting.md) and [evidence](../mvps/mvp-2.md); the proposal below is retained as design context.

Use a direct reviewed EIP-712 voting-intent scheme as the initial candidate; ERC-2771 forwarding and account abstraction are alternatives, not additional mandatory subsystems. [EIP-712](https://eips.ethereum.org/EIPS/eip-712) standardizes typed signing but does not supply replay protection.

Proposed typed data (exact Solidity/TypeScript encoding and test vectors are an MVP 2 deliverable):

```text
Domain: name, version, chainId, verifyingContract
VoteIntent: electionId, manifestHash, candidateId, nonce, deadline
```

The contract recovers/validates the voter, checks the election-specific nonce and deadline, eligibility, state, and candidate, then atomically consumes authorization and accepts the vote. The same spent-wallet guard must cover direct and relayed paths if both are supported. Do not trust the relayer's claimed voter address. Smart-contract wallets require explicit ERC-1271 support/tests or a documented EOA-only baseline.

The relayer prevalidates the intent, enforces sponsorship budgets and bounded admission, submits with its own funded signer, and reconciles receipts. A stable digest identifies the logical intent; retries and replacements must not create multiple accepted votes. A relayer cannot change any bound field, but can censor or delay. Multiple relayers and direct submission can be evaluated without changing authorization semantics.

Measure zero voter-paid transaction fee separately from positive network gas and sponsor expenditure. This milestone remains public and wallet-based. A walletless recovery/credential option is evaluated, but backend-controlled permanent citizen wallets are not the target architecture.

## MVP 3+: Anonymous authorization and encrypted ballots

### Blocking cryptographic design gate

ElGamal homomorphic tally with one independent key pair per election and a single initial private-key holder is selected. Before implementation claims, validate the encryption, validity proof, membership binding and decryption-proof composition. [Semaphore v4](https://docs.semaphore.pse.dev/guides/proofs) remains the membership candidate; it is not a ballot-validity or tally protocol. [ElectionGuard specifications](https://electionguard.vote/spec/) and reference implementations are the first evaluation target, not a confirmed EVM-compatible integration. See the [compatibility evaluation](../architecture/cryptography-compatibility.md).

MVP 3 implements encryption, proof-bound acceptance, homomorphic tally and generation/internal checking of decryption evidence. MVP 4 implements the complete Public Audit Dataset + Standalone Election Verifier. Required public accepted records must be preserved from MVP 3; public audit delivery is not a reason to discard evidence or skip internal correctness tests.

The statements below are requirements, not a new cryptographic construction. Concrete hash-to-field conversion, group selection, serialized bytes, verification artifacts, and proof equations must come from selected reviewed specifications and interoperability tests. No ad hoc encryption or unreviewed circuit substitution is allowed.

### 1. Eligibility, authentication, and credential lifecycle

- Authenticate to a separate identity service using the chosen institutional or synthetic identity provider. The issuer enforces one active credential per eligible person per election through a private deduplication record.
- Generate the credential secret on the client with a reviewed CSPRNG/library; send only its identity commitment for registry enrollment. Do not derive secrets from public identity numbers, email, or passwords.
- Prefer election-specific secrets/commitments to reduce cross-election linkage. The issuer may retain the minimum private association required for pre-freeze replacement; it must not know the secret or a ballot/nullifier identifier.
- Before freeze, an authenticated replacement removes the prior commitment and adds the new one atomically. Publish only the final common snapshot/root accepted by the election.
- After freeze/open, prohibit secret replacement and root changes in the initial protocol. A new secret would produce a new nullifier; accepting old and new roots is not a safe recovery policy. Lost/stolen credentials can cause disenfranchisement or first-use theft. Investigate advanced recovery only in a separate reviewed design.
- Revoke before freeze by removing the commitment. If a serious compromise requires intervention during voting, follow the public cancellation/restart policy, not a hidden per-voter exception.
- Client-controlled encrypted backup is an option to evaluate. Server-readable secret escrow would change the trust model and is not assumed. Record retention/deletion policies for issuer mappings, including backups, before using real identities.

Distribute the complete public commitment snapshot independently of identity login so clients can construct membership witnesses locally. No personalized root/path response should reveal the participant's ballot request to the issuer. Separate enrollment and voting sessions/origins and avoid identity cookies on submission.

### 2. Election key setup and client ballot encryption

Generate a fresh independent ElGamal key pair per election with the reviewed implementation. Keep it separate from the owner's EVM deployer/admin key and all voter credentials. Authenticate/freeze the public key, parameters and proof mode in the manifest. One designated holder initially retains the private key in secure environment-backed custody accessible only to the tally process. Public clients and verifiers receive the public key only; neither application logs nor audit artifacts contain the private key. Loss/backup/compromise procedures must be documented before use.

Represent a selection as a one-hot vector with the selected reviewed exponential/additive ElGamal encoding. Encrypt each element on the client using fresh secure randomness. The validity proof must establish bit values, the exact-one sum, encryption under the manifest key and required group/range constraints without revealing the selection. Bind candidate order/count and context. Bound total votes for unambiguous count decoding without modular wraparound. Do not publish cast-ballot randomness or expose an individual-ballot decryption endpoint.

The holder nevertheless has the mathematical ability to decrypt individual ciphertexts. Aggregate-only normal operation is a policy, not protection against that holder. A future threshold mode requires a new election/key, reviewed distributed setup and partial-decryption proofs; it cannot restore secrecy to old single-holder elections.

### 3. Proof binding and election scope

The public membership message binds a canonical ballot record containing protocol/manifest/key identifiers, ciphertext vector, and ballot-validity proof digest. The authorization proof's fixed election scope includes protocol domain, chain/deployment and election identity. Clients cannot choose arbitrary scopes to bypass uniqueness. Use the chosen library's specified scope/nullifier construction; do not invent a hash formula.

Membership proves knowledge of a secret whose commitment is in the frozen root, with the library's scope-derived nullifier and the exact ballot message. It must reveal neither the secret nor its leaf/index. Ballot validity is separately verified against the same ciphertext/key/manifest. Changing ciphertext, proof bytes, key, root, election, or domain must cause rejection under canonical encoding tests.

### 4. Anonymous submission and acceptance

Send ciphertext and proofs to a ballot endpoint without identity authentication tokens or permanent wallets. The relayer sponsors the transaction. On-chain acceptance requires:

1. Correct protocol/manifest and open, noncancelled election.
2. Exactly the frozen registry root and contract-derived scope.
3. Successful membership authorization bound to the ballot record.
4. Successful ballot-validity verification for the same record and key.
5. Unused election-scoped nullifier.
6. Atomic nullifier consumption and record/event commitment.

Preflight checks are for efficiency; they cannot replace contract enforcement. If on-chain ballot-validity verification is infeasible, MVP 3 pauses for an ADR defining a verifiable alternative acceptance model. An unchecked ciphertext must not silently become a counted ballot.

Calldata initially carries the accepted ciphertext/proofs; events carry canonical identifiers/digests and nullifier. Mirrors store the same bytes. Retry after timeout must check canonical acceptance before resending. Copying a valid payload can change the submitter but not the choice; later duplicate acceptance is rejected.

### 5. Public Audit Dataset and accepted-set commitment (MVP 4)

MVP 3 retains public accepted ciphertexts and proofs in transaction calldata/records, with acceptance events and manifest/key anchors. MVP 4 publishes a portable dataset containing the manifest, registry snapshot, ordered accepted records, contract/ABI/artifact hashes, chain references, all membership and ballot-validity proofs, aggregate ciphertexts, aggregate counts, decryption proofs and close checkpoint. Anchor the dataset root/count and tally evidence digest on-chain. Omitted pre-MVP-4 records must remain reconstructible from canonical public chain data.

A deterministic ordering (canonical block number, transaction index, record/log index) and canonical encoding determine dataset roots. Define tree padding, leaf/node domain separation, count and empty-set behavior in implementation vectors. A Merkle root without a committed record count can leave completeness ambiguous. Validate the dataset against independently obtained chain records, not just a publisher-supplied root or manifest.

Public receipts contain inclusion evidence for ciphertext/commitment only, never opening randomness or plaintext. Verify record counts and reconstruct the chain accepted set so publishers cannot omit an accepted ballot or add a nonaccepted ballot. Public evidence distribution must not share authenticated identity analytics.

### 6. Privacy-preserving tally

Close and stabilize the canonical accepted set under the finality policy. Validate every ballot and homomorphically aggregate each candidate's ciphertexts over exactly that set. The initial holder decrypts only those aggregates in normal operation and generates reviewed decryption-correctness evidence, such as the selected implementation's Chaum-Pedersen-style proof, without revealing the secret. Decode bounded nonnegative counts and verify that they sum to accepted ballots for the exact-one policy. Define/test zero-ballot aggregation explicitly rather than invoking a library accumulation API on unsupported empty input.

Bind tally/decryption evidence to the manifest, public key, close checkpoint, accepted-set root/count and aggregate through the reviewed transcript/context and reconstruction checks. MVP 3 generates this evidence and checks it with internal vectors; MVP 4 publishes and independently verifies it. If the contract cannot verify tally proofs, its publication remains `authority-published`; only completed evidence checks justify an independently `verified` report. An admin signature or result hash alone does not prove decryption correctness.

An unavailable/lost single key or missing proof makes the tally incomplete; do not fabricate final results. A dishonest or compromised holder can decrypt individual published ciphertexts now or later, and valid aggregate proofs cannot detect such private misuse. Small/unanimous aggregate results may also reveal choices. In a future threshold mode, missing sufficient shares prevents completion and threshold collusion defeats secrecy; these are future-mode assumptions, not protection present in the prototype.

### 7. Standalone Election Verifier (MVP 4)

A standalone CLI accepts an archive path/URL and independently obtained chain parameters/checkpoints. It needs no identity login, election private key or privileged backend API. An offline mode requires supplied independently authenticated public chain evidence and must report that trust anchor; it cannot treat a self-declared archive as chain proof. It must:

1. Validate schemas/encodings/artifact hashes and recognize the declared protocol version.
2. Verify manifest/root/key/contract anchors, finalized close boundary, and immutable parameters.
3. Reconstruct every canonical accepted record; match dataset count/content with no extras or omissions.
4. Verify unique nullifiers, expected scope/root, all membership bindings and ballot-validity proofs.
5. Recompute aggregate ciphertexts and accepted-set commitments.
6. Verify the election public-key binding, aggregate decryption proofs and resulting bounded counts; dispatch to trustee setup/share checks only for a supported future threshold mode.
7. Verify result commitments and emit machine-readable JSON with `pass`, `invalid`, `incomplete`, `unsupported` or `error`, assumptions and chain finality evidence. Only a complete successful check returns exit code 0.

Proposed output contract (fields to freeze in MVP 4): `schemaVersion`, `verifierVersion`, `protocolVersion`, `electionId`, `chainId`, `contractAddress`, `checkpoint`, `datasetRoot`, `decryptionMode`, `status`, `checks` (stable code/status per check), `expectedRecordCount`, `observedRecordCount`, `aggregateCounts`, `assumptions` and sanitized `errors`. Aggregate fields may be absent with a reason if checking cannot complete; never substitute unverified declared counts. No voter identity, private key, opening randomness or individual plaintext appears in output.

Proposed exit codes: 0 = pass; 1 = invalid evidence; 2 = incomplete evidence or unavailable chain data; 3 = unsupported version/algorithm; 4 = internal/operational error. Known invalid evidence takes priority over missing-data status; an inability to finish any required check always prevents success. Machine-readable results must identify unchecked items instead of silently skipping them.

Provide mutation fixtures: truncated archive, duplicated nullifier, missing ciphertext, altered root/key/proof/share/count, wrong chain/close checkpoint, and unknown protocol. A verifier that only asks the API whether the election is valid is insufficient. Cryptographic validity does not establish fair registration, coercion freedom, or cast-as-intended on compromised clients.

# MACI architecture candidate

Status: proposed for a versioned new-election protocol. Upstream MACI v3.0.0 is the current evaluation candidate, **not an approved integration pin**. Exact contract APIs, circuit dimensions and artifacts await source inspection.

## Flow and authority

```text
Username/password browser -> NestJS eligibility issuer -> one-use registration authorization
Client MACI keypair -> sponsored registration -> MACI gatekeeper / poll join
Client signs and encrypts command to coordinator -> MACI relay -> canonical poll message
Coordinator key -> decrypt/process messages -> processing proof -> on-chain verifier
Coordinator tally -> tally proof and public results -> on-chain verifier
Chain events, commitments and proofs -> rebuildable Supabase projection
```

The client holds the MACI private voting key. It is a protocol credential, not an EVM wallet; the coordinator key, sponsor key and deployer key are separate. No plaintext choice or voter secret may enter the API or its logs. The coordinator can decrypt individual commands; MACI therefore does not establish secrecy against that operator. A malicious coordinator can withhold processing or tallying, which must be visible as an incomplete election rather than a final result. The issuer knows accounts and registered public keys; the relay observes network metadata and encrypted messages. Their combined timing records can link participation even without a database join.

Tag v3.0.0 provides `QV`, `NON_QV` and `FULL` modes. `FULL` with exactly one initial voice credit is the stronger candidate for traditional single-choice voting: the upstream processing code rejects a valid command that leaves unused credit and zeros other option weights after an accepted update. It uses a `MessageProcessorFull` circuit and the non-QV tally path. This is a source-level inference that still needs a real proof and adversarial vote-update probe. Configure one credit per eligible identity, allowed candidate indices and one final counted choice. MACI accepts later valid commands; **one final counted choice** and **one accepted transaction** are different policies. The UI must say “Submitted” after chain inclusion and “Results verified” only after proof verification; it cannot assert an individual command counted without a privacy-safe inclusion method.

The gatekeeper must enforce issuer authorization on chain, consume each authorization once, and prevent more than one registered identity for the same eligible account/election. An ordinary account ID or personal identifier must never be published on chain. The exact mechanism remains unresolved: a signed authorization may reveal a stable hash or allow transfer, while a Merkle proof may require a separate credential design. The issuer's honest one-person policy remains a trust assumption in either case. No Semaphore dependency is selected.

Tag v3.0.0 source shows `MACI.signUp` and `Poll.joinPoll` call policy `enforce(msg.sender, data)`. Under a sponsored transaction, `msg.sender` is the sponsor, **not the logged-in voter**. A stock sender-keyed policy cannot enforce one account/one credential in this UX. A new reviewed policy must validate a one-use election/account authorization bound to the voter MACI public key and poll context while hiding personal identifiers. The policy design is a concrete M2 blocker; routing all voters through the same relayer address without it would be a Sybil vulnerability. `Poll.publishMessage` accepts encrypted messages from callers and hashes each into the chain; `relayMessagesBatch` allows a registered relayer to add message hashes plus an IPFS reference, so the chosen submission path must prove full message availability before claiming independent replay.

The current `AuthService.vote` accepts plaintext `candidateId`; `GaslessVoteRequest` persists it. Neither may carry MACI ballots. Existing BasicVoting/GaslessVoting contracts, ABIs, deployments, history and database records remain their own protocol versions. New storage must be additive and project only chain/proof state. Separate service credentials, access roles and ingress are required before claiming identity/ballot operator separation. A folder split inside one API process is insufficient.

Client key recovery requires an explicit user-held encrypted backup or an equivalent reviewed mechanism. Local browser storage alone loses access on device loss, while a password-derived private key is exposed to password guessing and server knowledge. Until a backed-up lifecycle is implemented and reviewed, credential recovery is unresolved and must be explained before registration.

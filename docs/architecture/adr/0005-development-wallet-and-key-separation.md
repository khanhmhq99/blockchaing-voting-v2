# ADR 0005: Development wallet and election key separation

Status: accepted architecture decision by the project owner; implementation not authorized. Date: 2026-10-11.

## Context

The owner selected a personally controlled development wallet for testnet deployment and administrative operations. Earlier plans used only disposable local accounts and deferred all testnet administration. This decision changes that planned operational model without starting deployment.

## Considered options

1. Disposable local accounts for every operation: useful for CI, but insufficient for the requested owner-controlled testnet demonstration.
2. Owner-controlled development wallet for testnet administration, separate synthetic voter accounts, separate election encryption keys.
3. Production multisignature/HSM custody and distributed trustees immediately: beyond the initial research scope.

## Decision

Choose option 2 for development only. The owner's wallet may hold deployer and contract-admin roles on a selected testnet. Local automated tests still use disposable accounts. Never use the administrative wallet as the synthetic voter population or as an encryption key.

Load signing secrets from secure environment configuration at runtime, supplied by an owner-controlled secret store or protected, untracked local configuration. Never commit keys, seed phrases, secret values, or backups; never place them in CLI arguments, logs, frontend public variables, fixtures, images or CI artifacts. `.env.example` contains names/placeholders only. Ignore rules are not a substitute for access control and secret scanning. This task neither requests nor reads wallet secrets.

Generate a fresh independent ElGamal key pair for every encrypted election using the selected reviewed implementation. Do not derive it from the development wallet's key, seed or signature. Freeze the public key, key identifier, scheme/parameter version and `decryptionMode` in the election manifest. Only the tally process can load the election private key; relayer, web application, issuer and public verifier receive no decryption secret. The relayer should have its own limited-purpose signer rather than inherit admin authority.

Initial custody is one election-specific decryption key holder. A single operator may control both administration and tally in this development model, but keys/configuration/process access remain separate; this is not institutional independence. Recovery/backups must preserve the same election key, remain encrypted/access-controlled, and have an explicit retention policy. Lost keys make tally unavailable; compromise exposes that election's archived ciphertexts. Do not rotate the public key within an open election to hide the incident.

Use separate synthetic voter identities and disposable voter wallets for MVP 1/2 authorization and duplicate tests. MVP 3 replaces voter-wallet authorization with anonymous credentials generated on the client; no permanent citizen wallet is required.

## Trade-offs

Owner-controlled signing simplifies the testnet demonstration but centralizes admin power and operational failure. Separate election keys reduce cross-election compromise scope, while backup handling and environment isolation add work. Runtime environment injection does not protect a secret from a compromised host with access to that process.

## Security implications

No production custody or protection from a malicious key holder is claimed. Validate role separation, testnet chain configuration, secret redaction and fresh independent election-key generation. A decryption proof checks result correctness, not custody hygiene or the absence of private individual decryption. See [ADR 0006](0006-elgamal-aggregate-tally.md).

## Research implications

Record public deployment addresses, chain IDs, transaction hashes and key fingerprints, never private material. Label testnet costs appropriately. Record `single-holder` custody in every encrypted-election experiment so future threshold results are not treated as equivalent trust assumptions.

## Required evidence and boundary

MVP 1 must test unauthorized admin calls and synthetic duplicate voting, inspect secret handling, and record a testnet demonstration when implemented. MVP 3 must test election key mismatch/reuse prevention and unavailable-key behavior. No wallet connection, key generation, package installation, contract deployment or MVP work is performed by this ADR update.

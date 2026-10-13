# MVP 2.5: Walletless account voting

Status: implemented in the local codebase; database migration and runtime acceptance remain pending. Date: 2026-10-13.

## Contract review and selected change

`GaslessVoting` already supports EIP-712 `VotingIntent` signatures, an election-scoped nonce, an election-specific eligibility mapping, and an atomic `hasVoted` guard shared by direct and sponsored submissions. The signature binds the election, manifest, candidate, voter address, nonce, deadline, chain and contract. Its relayer verifies the signature and submits the existing `voteWithSignature` call.

MVP 2.5 keeps that contract and uses an API-held EOA key as the signer for each authenticated user's identity in each election. The API authenticates the session, loads the server-created identity for that user/election, confirms eligibility and current chain state, reads the on-chain nonce, signs the exact existing typed intent and submits it to the existing relayer. The contract still verifies a real ECDSA signature. A password is never interpreted as an on-chain signature.

No Solidity, ABI, deployment, or MVP 1/MVP 2 baseline change is required. If the project later requires a voter to authorize a particular choice independently of the API, the contract must add a reviewed authorization scheme such as a second-factor credential or anonymous proof; username/password alone cannot provide that property. That is outside MVP 2.5.

## Identity and eligibility mapping

- `AppUser` stores normalized case-insensitive username uniqueness, an scrypt password hash, display name, role and account status.
- `AppSession` stores only a SHA-256 digest of a random opaque session token. The raw token is an HttpOnly, SameSite=Lax cookie with an eight-hour expiry.
- `ElectionVoterIdentity` has one unique row per user, chain, contract and election. It stores the public EOA address and AES-256-GCM encrypted private key. Its database uniqueness constraints also prevent address reuse by two app users in the same election.
- An authenticated administrator assigns a registered username to a draft election. The API creates a random EOA and returns its address to the admin UI. The contract owner then signs `setEligibility` with the existing owner wallet before freezing the election. The API checks this on-chain eligibility again for every vote.
- A public registration always creates role `USER`. The demo `admin` account is seeded only by an explicit, loopback-only local seed command.

The DB-to-chain mapping is reliable under the assumptions that the database constraints/migration are applied, the API checks the authenticated session and exact user/election row, and the chain RPC reports canonical state. The chain remains authoritative for eligibility, nonce consumption, one-vote enforcement, accepted event and tally.

## Key custody and trust assumptions

`VOTER_KEY_ENCRYPTION_KEY` is a 32-byte hex secret available only to the API process. It encrypts each generated private key using AES-256-GCM with a fresh random IV and authentication tag. The database contains no plaintext private keys. The API decrypts a key only to sign an eligible user's intent. The key must be backed up and protected separately from the database; losing it makes uncast assigned identities unusable. Rotating it requires a reviewed re-encryption procedure. The application does not expose private key material or derive it from a password.

This is centralized signing custody. An API operator or attacker who can execute code in the API process can cast a vote for any eligible account that has not voted. An attacker who obtains both the database and encryption key can recover all remaining election keys. A stolen account password/session can submit one ballot as that user. The owner remains trusted to set or withhold eligibility. The relayer can delay or censor requests. These properties are checked through server-side identity/role/eligibility lookup, authenticated encryption, on-chain signature recovery, nonce and `hasVoted` checks; no independent voter signature protects the choice from the API.

This threat is tracked as [T25 in the threat model](../security/threat-model.md).

The public chain exposes each managed voter address and its selected candidate in `VoteCast`. Since the database links that address to an account, an administrator with database access can link an account to its choice. MVP 2.5 does not provide ballot anonymity, receipt-freeness, coercion resistance, or protection from a compromised client/API. Anonymous ZK voting remains an MVP 3 objective.

## Routes and operations

| Route | Purpose |
| --- | --- |
| `POST /v1/auth/register` | Create a USER account |
| `POST /v1/auth/login` / `POST /v1/auth/logout` | Create/revoke an HttpOnly session |
| `GET /v1/auth/me` | Validate the session and return its public account |
| `GET /v1/auth/elections` | Return elections with the signed-in user's eligibility/vote status |
| `GET /v1/auth/history` | Return only the current account's request status and transaction hash |
| `POST /v1/auth/elections/:id/vote` | Server-authorized EIP-712 signing and existing relayer submission |
| `POST /v1/auth/admin/elections/:id/identities` | ADMIN-only identity assignment in a draft election |
| `GET /v1/auth/admin/elections/:id/identities` | ADMIN-only identity/address review, excluding encrypted keys |

The browser never receives the database connection, key encryption secret, private keys or signatures. Voters use username/password, a session cookie and the backend vote endpoint; they do not connect a crypto wallet or hold chain tokens. Contract-owner actions still use the separately trusted owner wallet.

## Migration and limits

`202610130001_walletless_accounts` is additive and was applied to the configured Supabase project on 2026-10-13 with explicit owner authorization. The API runtime role received DML grants on the three new tables. The demo admin seed refuses production and non-loopback databases. Automated tests are intentionally omitted per the enhancement scope. Local schema validation, TypeScript compilation and production build are implementation checks, not test-suite evidence.

Current constraints: local per-process login throttling is not distributed; email/phone verification and account recovery are not implemented; the initial password requirement allows a one-character password for the requested demo behavior; session revocation on password change is not applicable until password change is implemented; owner-wallet signature remains needed to write eligibility; key rotation and disaster recovery require an operational procedure before a real electorate. Use only synthetic accounts and ballots.

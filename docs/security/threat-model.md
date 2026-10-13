# Threat model

## MVP 2 implementation update (2026-10-12)

MVP 2 adds public EOA signed intents and a funded NestJS relayer. Under A1/A3/A4, a malicious relayer or competing voter cannot alter a bound choice or forge an accepted signature: the versioned contract checks EIP-712 domain, frozen manifest, election, voter, candidate, nonce and deadline. Real-EVM tests mutate these fields, replay across domains, race duplicate transactions and verify shared direct/gasless uniqueness. This is not one-person-one-vote, anonymity, coercion resistance or protection from a malicious wallet/client.

The sponsor key is environment-only and prohibited from matching the admin. Under an honest database/operator, persisted fee reservations and a chain/sender advisory lock bound sponsorship and coordinate nonces. Stored raw transaction hash, recovered sender, destination, chain, value and call selector are checked before sending. Tests cover low balance, gas/budget caps, malformed/unauthorized requests, duplicate admission, persistence failure before broadcast and RPC uncertainty. Global rate buckets are per-process; public read/ingress abuse limits and live SQL concurrency remain deployment gates. A malicious privileged database/operator can censor, change operational budgets or withhold status, but cannot manufacture a voter signature without breaking A3/A4 or stealing it.

Receipt success additionally requires matching VoteCast and canonical block/depth. Reorg tests demote confirmed requests. Unknown replacements, expired unresolved transactions and deep reorgs after recovery-data purge block the lane for operator reconciliation. No automatic fresh transaction retry follows a revert. Active recovery signatures/raw bytes are private database operational data and are purged at terminal outcomes; signatures/choices in accepted transaction calldata remain public forever. Backups may retain purged material until their configured expiry. Define backup retention before external operation.

Relayer availability/censorship, dishonest RPC responses, administrator cancellation/eligibility manipulation, endpoint compromise, public wallet-choice linkage and timing remain residual risks. The prototype uses one sender lane and no automated failover or fee bumps. No real electorate is authorized. See [architecture](../architecture/gasless-voting.md), [ADR 0008](../architecture/adr/0008-gasless-signed-intents.md) and [MVP 2 evidence](../mvps/mvp-2.md).

## MVP 1 implementation update (2026-10-12)

The owner authorized implementation. Supabase PostgreSQL is a managed metadata/projection store accessed only through NestJS/Prisma. Database compromise must not grant eligibility or change accepted votes: contract tests enforce authorization and atomic uniqueness, and API integration tests corrupt metadata while confirming results still come from the chain. Metadata and candidate profile commitments are checked before display. A malicious API/RPC/client can still mislead a user; this baseline is not the MVP 4 independent verifier.

Runtime and migration credentials are separate, environment-only, and require verified TLS. The private `voting` schema must remain unexposed to Supabase Data API roles. Actual project grants, connectivity, migrations and transaction rollback behavior remain unverified until credentials are configured. No Supabase Auth/Realtime or frontend privileged key is introduced. Tests using the explicit memory database are not evidence of PostgreSQL isolation or RLS behavior.

Administrative API writes require a short-lived, one-use EIP-191 challenge bound to origin, chain, contract, current owner, operation and payload digest. Replay, alteration, expiry and wrong signer are tested. Single-process nonce memory is a prototype deployment limitation. Contract configuration uses OpenZeppelin owner checks; the owner's ability to authorize arbitrary wallets and cancel an election remains a central trust assumption. The deployment/admin key is separate from all future encryption keys.

Wallet account/network changes clear UI selection; Viem checks the configured chain when submitting. A replacement receipt is accepted only if sender, destination and calldata match the requested operation. Pending/timeouts remain uncertain until checked against the chain. Snapshot reads and event rebuilds recheck block hashes; the indexer atomically replaces projections through a confirmation checkpoint and an advisory lock. Reorg integration tests use a real local EVM with a memory database; cross-process SQL concurrency is a remaining live-database gate.

The Next.js frontend exports static assets, but framework/dependency advisory review is still required before public hosting. An empty package-audit report is not proof of security. API errors are sanitized and request-body logging is disabled. Local Hardhat development keys are public and never suitable for real funds. All recorded benchmark ballots and addresses are synthetic. No anonymity, coercion resistance, receipt-freeness or protection from compromised clients is claimed.

Status: design analysis, not a security assessment of implemented software. Date: 2026-10-11. Mitigations below are requirements to implement and test. No test in this document has been run.

## Assets and adversaries

Protect election rules, eligible participation, unique acceptance, ballot secrecy against declared observers, correct tally, evidence availability, credential/election-decryption/admin keys, relayer funds and reproducible records. The initial model uses the owner's development wallet for testnet deployment/admin and one distinct ElGamal key holder per encrypted election. Synthetic voter identities remain separate. Future trustee shares are a separate asset class, not initial protection.

Actors include unauthorized users, malicious eligible voters, dishonest election/identity administrators, the single election-key holder, compromised web/API hosts, malicious relayers, RPC/indexer operators, archive hosts, network observers, compromised voter devices and coercers. Future threshold mode adds colluding trustees. One developer may control several prototype roles; separate keys do not prove organizational independence.

Attack surfaces include browser bundles/extensions/storage, authentication and issuance endpoints, registry download paths, ballot APIs, signature/proof encodings, contract methods, RPC responses, queues/databases, logs/backups/metrics, setup artifacts, dependencies/CI, trustee ceremonies, archive manifests, and benchmark data processing.

## Explicit trust assumptions

| ID | Assumption | Validation or evidence and limit |
| --- | --- | --- |
| A1 | The selected canonical chain meets its consensus/finality assumptions | Pin chain/checkpoint and node configuration; test reorg handling. Does not prove chain security or remove RPC trust unless independently validated. |
| A2 | Eligibility authority applies an agreed real-world rule and does not issue extra credentials | Audit issuance counts, procedures, and synthetic adversarial cases. ZK cannot prove that a real person is eligible or that the issuer is honest. |
| A3 | Client-generated secrets/randomness and client software are trustworthy for that voter | Review dependencies/CSPRNG, verify artifacts, test tampering where possible. A compromised endpoint can always disclose a choice. |
| A4 | Selected cryptographic schemes, parameters, setup ceremonies, and implementation composition are sound | Review proofs/specifications, audits, artifact hashes, known-answer/differential tests, and circuit constraints. Tests alone do not establish cryptographic security. |
| A5 | Initial single holder protects the election key and follows aggregate-only normal operation | Test restricted process access, key separation, backups and aggregate proof correctness. No secrecy against the holder: it can privately decrypt every ciphertext; policy compliance is not cryptographically provable. Key loss blocks tally. Future threshold assumptions apply only after a new reviewed deployment. |
| A6 | An anonymity set contains multiple non-colluding eligible participants and metadata is not fully correlated | Freeze common roots, measure synthetic timing/linkage, separate ingress/logging. No guaranteed anonymity against a global observer. |
| A7 | Required evidence is retrievable from chain history or at least one independent archive | Outage/rebuild tests and content verification. Hashes do not ensure availability. |
| A8 | Owner-controlled development wallet and its runtime environment are trusted for testnet admin operations | Test role/chain checks, secret redaction and environment isolation. Admin authority remains centralized; this is not a production security model. |

## Threat scenarios and required tests

Priority indicates impact before mitigations; it is qualitative, not a measured probability. C = critical, H = high.

| ID / priority | Scenario and boundary | Proposed mitigation | Required verification | Residual risk |
| --- | --- | --- | --- | --- |
| T01 / C | Unauthorized voting bypasses API | Contract eligibility/signature or membership proof, bound election root | Direct contract calls by unauthorized wallets; forged proof/public-input mutation | Dishonest issuance A2 |
| T02 / C | Duplicate/concurrent votes | Atomic spent-wallet/nullifier update in same successful transaction as acceptance | Two concurrent submissions, multi-relayer race, retry after crash; only one canonical acceptance | Distinct credentials issued to same human |
| T03 / C | Replay across elections/chains/deployments | Fixed domain, election ID, version, nonce/expiry for signed intents; fixed election scope for ZK | Replay on wrong domain, election, deployment, root and expired intent | Chain forks with same domain; two independently authorized real-world elections |
| T04 / C | Relayer changes/invents a choice | Voter authorization binds exact intent/ciphertext and proof digest; contract verifies | Mutate each bound field; submit without authorization | Client may authorize the wrong thing; relay censorship |
| T05 / H | Relay spam drains funds or stalls votes | Preflight proof checks, bounded queue/fees, rate budgets, least-funded signer | Invalid payload floods, gas spikes, nonce collision, retry bounds | DoS can still deny service; rate limits can harm anonymity/fairness |
| T06 / H | Front-running copies or reorders a vote | Bound immutable payload; duplicate nullifier rejects later copy; no sender-based tally semantics | Mempool copy/reorder and mutated copies | Timing leakage/censorship; copied valid vote may be included by another submitter |
| T07 / C | Admin edits rules or bypasses lifecycle | Freeze manifest, candidates, root, key, window; immutable deployment; role checks | Unauthorized calls, exact time boundaries, post-freeze mutation, cancellation | Authorized cancellation and eligibility manipulation remain trusted powers |
| T08 / C | Issuer creates phantom/duplicate voters | Private eligibility deduplication, restricted issuance roles, auditable registry count/freeze | Duplicate/replacement races and injected commitments | Public proof validates membership, not issuer honesty |
| T09 / C | Stolen credential or unsafe recovery | Client-only secrets; pre-freeze replacement removes old leaf; no replacement after freeze | Old-path rejection, root mismatch, backup/recovery review | Thief may vote first; loss after freeze can disenfranchise |
| T10 / C | Identity/ballot correlation through logs and APIs | Separate origins, sessions, roles, databases, logs; no shared IDs; full snapshot downloads | Trace synthetic identity through logs/backups and inspect all telemetry fields | Same operator/network observer may correlate timing/IP; small sets leak |
| T11 / C | Invalid ballot, overvote or malformed group element | Reviewed validity proof bound to same ciphertext/key/manifest; canonical/group checks | Encrypt out-of-range values, wrong key, invalid curve/subgroup, altered public inputs | Circuit/specification bugs A4 |
| T12 / C | Incorrect aggregation or fraudulent tally | Canonical accepted-set reconstruction, validity checks and aggregate ElGamal decryption proofs | Omit/add/reorder/duplicate ballot; wrong aggregate/key/proof/count/close checkpoint; declaration without proof | Institutional declarations and shared verifier bugs; correct proof does not prove absence of private decryption |
| T13 / H | Missing/withheld audit data | Calldata evidence plus mirrors, hashes, retention plan; incomplete verifier status | Remove object/proof, truncate dataset, disconnect mirror, rebuild from chain | All archives/history unavailable; temporary inability to verify |
| T14 / C | Single holder misuses, loses or leaks the election key | Independent key per election, restricted environment-backed custody, protected backup/retention policy, aggregate-only API and public-key binding | Wrong/reused key rejection, unavailable-key outcome, public proof verification, secret/log review; simulate individual decryption only with synthetic fixtures to demonstrate the limit | Holder or later compromise can expose every individual archived ballot for that key; software policy cannot prevent this. Future threshold needs independent custody and share-proof tests. |
| T15 / C | Compromised browser/device | Reviewed client, integrity-controlled builds, minimized dependencies, clear verified manifest | Bundle tampering exercises and dependency review | Cast-as-intended and secrecy on compromised devices not guaranteed |
| T16 / H | Coercion, vote buying, transferable receipt | Explicit research exclusion; no opening secrets in receipts; privacy-oriented UX | Analyze credential/randomness disclosure and screenshot/coercion scenarios | No coercion resistance or receipt-freeness claim |
| T17 / H | Timing, traffic analysis, singleton registry | Shared frozen root, separated enrollment/voting periods, aggregate telemetry; evaluate relay/network techniques | Synthetic correlation study, root-size checks, IP retention review | Global observers and adversarial set isolation remain threats |
| T18 / H | RPC lies, chain reorg, indexer disagreement | Independent chain source, checkpoint hashes, replay/reconciliation and rollback | Orphan receipts/logs, RPC timeout, conflicting providers, restart at checkpoint | Consensus failure or mutually dishonest sources A1 |
| T19 / C | Compromised dependency, setup, CI or signing key | Exact pins/artifact hashes, advisory review, least-privilege CI, key separation | Hash substitution, known malicious fixture, secret scanning, unauthorized admin signer | Unknown supply-chain flaws and setup collusion |
| T20 / H | AI wrongly labels/blocks eligible voters | Advisory-only outputs; no contract/API acceptance permission for model | Demonstrate valid vote acceptance despite alert; feature/label leakage tests | Human misuse of alerts; biased synthetic distributions |
| T21 / H | Small/unanimous result reveals individuals | Analyze anonymity-set and result granularity; set disclosure policy before enrollment | Small-set and all-but-one-known-vote analysis | Aggregate results can imply choices despite encryption |
| T22 / H | Benchmark cherry-picking or lost failures | Immutable raw attempts and manifest; independent chain reconciliation | Recompute summaries, include retries/timeouts, detect missing raw rows | Public network variance and prototype external validity |
| T23 / C | Development signing secret leaks or is reused for encryption | Secure runtime environment, no secrets in Git/logs/client/CLI arguments, independent key generation, separate tally/relay/admin access | Secret handling scan, role-separation tests, distinct election keys and key mismatch tests | Compromised host/operator can access injected secrets; centralized admin can censor/configure eligibility |
| T24 / C | Invalid ElGamal encoding/nonces or generic decryption oracle | Reviewed additive encoding, fresh CSPRNG nonces, group/range/transcript checks, bounded decoding and aggregate-only input path | Wrong subgroup/key/domain, nonce misuse fixtures, empty/max totals, malformed proof and oracle endpoint tests | Primitive/composition errors; homomorphic malleability requires exact ballot binding, not a claim of CCA security |
| T25 / C | API operator or attacker casts as a walletless account | Authenticated session, account/election-specific encrypted EOA, backend role and on-chain eligibility checks, contract EIP-712 verification, nonce and atomic `hasVoted` guard | Review request/session/identity boundaries, AES-GCM key handling, account-to-address uniqueness, wrong-user election lookup, signature/domain/nonce checks and contract duplicate rejection | API process can sign for every eligible uncast account; database plus encryption-key compromise exposes keys; password/session theft can submit as that account; no independent voter signature |

## Privacy claims by adversary

| Observer | Intended visibility in MVP 3 | Conditional claim and remaining leakage |
| --- | --- | --- |
| Public blockchain observer | Root, nullifier, ciphertext/proofs, relayer address, timing, aggregate tally | No direct identity/choice in the record under A3-A6; participation timing and small-set inference remain |
| Identity operator | Real identity/eligibility and issuance commitment, no secret or ballot ID | Membership proof should hide which leaf was used; operator may know population and correlate enrollment/vote timing |
| Relayer | Ciphertext, proof, nullifier, network metadata | Cannot alter an accepted choice under A4; may observe IP, censor, delay or correlate |
| API/indexer/archive operator | Public record and read projections | Must not acquire identity joins; shared hosting/logging can defeat intended separation |
| Single election-key holder (initial) | Public record and full election decryption key | Can decrypt individual ciphertexts; no secrecy guarantee against this actor, even when published tally proofs pass |
| Trustees below threshold (future only) | Public record plus their own shares | Conditional protection only after reviewed independent threshold setup; not implemented or required in the initial prototype |
| Trustees at/above threshold (future only) | Enough key material to decrypt | No secrecy guarantee against collusion; aggregate-only software policy cannot prevent key-level collusion |
| Network/global observer | Traffic endpoints, timing, volume | ZK does not hide transport metadata; no global-observer anonymity claim |

## Security claim checklist and release gate

Every milestone report must link each claimed property to assumptions and evidence. For example, one accepted vote per registered credential needs T02/T03/T09 tests and A1/A2/A4; it does not establish one vote per human. Secret ballots additionally need validity/encryption/tally composition review, A3-A6, and metadata analysis.

MVP 3 provides internal correctness tests and evidence generation; independent public dataset/CLI verification is delivered in MVP 4. The CLI must recompute acceptance/aggregate and verify decryption, not trust a declared result. Passing JSON reports must expose the single-holder custody assumption. Public audits cannot certify that no individual decryption occurred privately.

Do not proceed from a cryptographic mock to a security claim. Record unresolved critical issues and their gates. The owner's testnet wallet choice is accepted for future authorized MVP work, not authorization to deploy now. Real identity data, production deployment or a real electorate require a separately scoped review beyond synthetic demonstrations. Research completion is not public-election certification.

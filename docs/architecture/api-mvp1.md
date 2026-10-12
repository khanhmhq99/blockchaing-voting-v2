# MVP 1 API v1

NestJS owns API orchestration. Bigints are decimal strings. The API never returns database credentials or RPC authentication. Errors use sanitized `{ "error": { "code", "message" } }` responses. Invalid input is HTTP 400, invalid admin authorization 401, conflicting metadata/index operations 409, bounded challenge capacity 429, and dependency failures 503.

| Method/path | Behavior |
| --- | --- |
| `GET /v1/health` | Actual Prisma query and chain/deployment check |
| `GET /v1/config` | Public chain ID, contract address and confirmation depth |
| `GET /v1/elections` | Up to 100 metadata-discovered elections with live chain snapshots |
| `GET /v1/elections/:id?voter=0x...` | Manifest/candidate integrity, lifecycle, counts, eligibility/spent status, block checkpoint |
| `GET /v1/elections/:id/candidates` | Hash-verified candidate metadata or explicit missing/mismatch |
| `GET /v1/elections/:id/results` | Live chain counts, total, eligible count, lifecycle/finalization and checkpoint |
| `GET /v1/elections/:id/voters/:address` | Live chain eligibility and hasVoted, not an SQL authorization flag |
| `GET /v1/transactions` | Latest 100 indexed, event-producing transaction receipt summaries; not a pending pool |
| `GET /v1/benchmarks` | Latest 20 saved benchmark run manifests and summaries |
| `POST /v1/admin/challenge` | `{ action: "metadata" | "index", digest: "0x..." }`; bounded 120-second nonce challenge |
| `POST /v1/admin/elections/:id/metadata` | Validate exact manifest hash/candidate commitments against chain, then atomic nested metadata upsert |
| `POST /v1/admin/index` | Rebuild confirmed contract events and corresponding receipt summaries at a canonical checkpoint |

The manifest is `{ title, description, candidates: [{ name, biography }] }`, strict (unknown fields rejected), 2–100 candidates. Metadata digest is Keccak-256 of recursively key-sorted JSON over this validated structure, retaining candidate order. Candidate IDs are their zero-based array offsets. The same canonical encoding commits each candidate profile. No floats or bigint values are accepted in this manifest.

For metadata authorization, hash `{ electionId: "decimal", manifest }`; for index authorization, hash `{}`. Request a challenge with this digest, verify chain/address/action/payload in the displayed message, then sign it with the contract owner's wallet using EIP-191 personal signing. Send `x-admin-nonce` and `x-admin-signature` on the matching POST. Each nonce is consumed even if the attempted authorization fails. No password/session or Supabase Auth is involved. This administrative API protection is distinct from future MVP 2 gasless transaction authorization.

On-chain changes are signed in the admin wallet and submitted directly through Viem. The API cannot create eligibility by changing the database. If chain state changed but metadata storage failed, the same committed manifest can be retried idempotently. Read APIs trust the configured RPC for chain observations; they are not independent cryptographic verification.

Baseline limits: one API process for challenge state; discovery list and recent history have fixed caps without pagination; full index rebuild is explicit and admin-triggered. Expand operational scale in a reviewed change, preserving the blockchain authority boundary.

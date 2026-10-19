# Public MACI evidence and standalone verifier

Status 2026-10-18: the matched local synthetic MACI v3 election `mvp4_1792310083` returned independent on-chain `PASS`, exit 0, using only files downloaded from the public API and a prior configuration hash. Application publication, monitor and browser acceptance passed; details are in [the report](FINAL_REPORT.md). Historical MVP 3 candidate order remains unbound.

## Obtain exact bytes

For a published election UUID, the unauthenticated `GET /v1/maci/elections/:id/evidence/:artifact` endpoint serves each original coordinator file: `manifest.json`, `events.ndjson`, `proofs.json`, `tally.json`. Save those names in one directory without reformatting. The public `/verify` screen links them. The existing `/audit` JSON envelope is convenient to read but serializes parsed objects and must not be substituted for the exact four files when validating their SHA-256 hashes. The API is a distribution source; the CLI never contacts it or Supabase.

For a newly anchored election, `GET /v1/maci/elections/:id/configuration.json` returns the canonical candidate configuration bytes. Save it as `election-config.json` and compare SHA-256 against a hash obtained **before** relying on the API copy. `GET /v1/maci/elections/:id/configuration` returns a readable descriptor and warning. The API publishes the anchored file only after checking its canonical bytes, election/poll/candidate scope and successful pre-election self-transaction. The independent CLI repeats the chain checks itself. Historical records without a stored anchored file retain a `legacy-unbound` descriptor and have no `configuration.json` artifact.

The four-file MVP 3 manifest commits the other three original file byte streams with SHA-256. It records chain/poll, snapshot, public events, proof transactions, artifact hashes and tally, but does **not** contain a frozen candidate-order commitment. Hashes of `.zkey` and WASM are identities only, not proof of ceremony provenance or correctness.

## Configuration format

`maci-election-config-v1` is canonical UTF-8 JSON plus one LF. Object keys sort lexicographically by JavaScript UTF-16 code unit; arrays retain order. Integers outside `Number.MAX_SAFE_INTEGER` are canonical unsigned decimal strings. Duplicate JSON object keys and noncanonical Unicode handling need a stricter cross-language parser before a public release. SHA-256 is calculated over these exact bytes. The CLI requires `--config-sha256` from an auditor-held copy to prevent silent substitution of the local file.

Required fields: `format`, `candidateBinding`, `electionId`, `protocol`, `chainId`, `maciAddress`, `pollAddress`, `pollId`, `deploymentBlock`, `coordinatorKeyX`, `coordinatorKeyY`, `startTimestamp`, `endTimestamp`, `voteOptions`, `candidates` as ordered `{id, optionIndex, name}` rows, `artifactHashes`, `codeHashes`, and `anchor`. `codeHashes` gives Keccak-256 of MACI, Poll, MessageProcessor and Tally runtime bytecode at the snapshot. `artifactHashes` must match the MACI manifest. Stable candidate IDs must be chosen and checked by the election publisher before opening the poll; names are descriptive.

For an `onchain-pre-election-hash-v1` election, calculate SHA-256 of canonical configuration **without** the `anchor` property. Before `startTimestamp`, the recognized publisher sends a successful zero-value transaction to its own EOA, with `data = 0x` followed by that 32-byte hash. After inclusion, add `anchor: {transactionHash, sender}` and publish the final canonical configuration and its SHA-256 pin. The CLI checks transaction sender/recipient, data, value, receipt, block hash and pre-election timestamp through the chosen RPC. This transaction does not alter MACI contracts or voting data. Publisher authority, honest candidate nomination, chain honesty and timely public pin distribution remain explicit assumptions. The local synthetic MVP 4 run anchored its configuration in block 19 before poll start; see the report for its transaction and pin.

The existing MVP 3 election uses `candidateBinding: "legacy-unbound"`. `npm run prepare:evidence-config -- --deployment <deployment.json> --manifest <manifest.json> --election-id <uuid> --out <config.json>` generates a descriptor with `legacy-option-N` IDs and prints its hash. This is descriptive only. The verifier returns `UNSUPPORTED` even if the file is hashed now; a past immutable candidate-order commitment cannot be created retrospectively.

## CLI

```powershell
npm.cmd run verify:election -- --evidence .\public-evidence --rpc http://127.0.0.1:8545 --config .\election-config.json --config-sha256 <64-lowercase-hex> --confirmations 1
```

Output is one JSON object with verifier version, timestamp, verdict, chain/poll/snapshot, manifest hash, individual check codes, reason codes and aggregate mapping only on `PASS`. Exit codes: 0 `PASS`, 2 `INVALID`, 3 `INCOMPLETE`, 4 `UNSUPPORTED`, 5 `ERROR`. A 180-second verifier deadline bounds RPC/proof checks on the local research machine. `INVALID` means contradictory evidence; `INCOMPLETE` means an unavailable required chain record or insufficient depth; `UNSUPPORTED` means no supported version or binding; `ERROR` includes RPC or verifier runtime failure. Every non-PASS is nonzero.

The CLI replays public event logs and receipts, scans proof transactions, checks MACI poll configuration, successful proof calldata, on-chain verifying keys through MACI SDK v3, complete batch counters, tally commitments and aggregate. It does not read the application database or `VERIFIED` assertions. Exact artifact byte provenance, independently sourced verification-key pins, multiple independent RPC agreement, and cross-language canonicalization remain release gates. Its observed local `PASS` still depends on a trustworthy RPC and the pinned MACI circuits/ceremony. A restarted ephemeral Hardhat chain cannot validate old addresses, blocks or receipts; regenerate a complete run before repeating the command.

The accepted local run's public downloads are preserved under `research/mvp3/maci/probe-output/mvp4_1792310083/downloaded/`. Its prior configuration pin is `aeac9fd353c483a527ff7328f6194f9166fda81d84f5eba9e3697d563fc8ff42`. The command below returned `PASS`, exit 0, while the matching Hardhat process was live:

```powershell
npm.cmd run verify:election -- --evidence research/mvp3/maci/probe-output/mvp4_1792310083/downloaded --rpc http://127.0.0.1:8545 --config research/mvp3/maci/probe-output/mvp4_1792310083/downloaded/election-config.json --config-sha256 aeac9fd353c483a527ff7328f6194f9166fda81d84f5eba9e3697d563fc8ff42 --confirmations 1
```

The complete JSON result is `research/mvp3/maci/probe-output/mvp4_1792310083/full-download-verdict.json`. If this ephemeral chain stops, treat the command as a historical reproduction recipe, not a claim that its old addresses remain live. Keep the public configuration hash in an independently retained source before relying on candidate labels supplied by a publisher or API.

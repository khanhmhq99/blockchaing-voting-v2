# MACI benchmark ledger

## Observed persistent local deployment, 2026-10-15

`scripts/deploy-maci-local.mjs` exited 0 against a disposable Hardhat RPC on chain 31337. Its ignored `research/mvp3/maci/probe-output/deployments/synthetic_1792079296/deployment.json` records 18 deployer transactions totaling **31,109,499 gas**, from registration/join policies through MACI, verifying keys and a three-option `FULL` poll. This is one synthetic local sample. The chain was stopped afterward. Network fees, BSC compatibility, application throughput and browser latency are **not measured** by this deployment.

## Observed one-sponsor M2 proof regression, 2026-10-15

The focused Hardhat chain-31337 probe `MACI_M2_FULL_PROOF=true`, `MACI_M2_RUN_ID=one-sponsor-full-proof` exited 0. Three distinct synthetic MACI keys used **one** sponsor for signup, joining and encrypted publishing. All three join proofs passed; the resulting processing and tally proofs were submitted to Solidity contracts and the final SDK verification returned `[1,2,0]`. Direct signup, forged signature, altered key, expiry, ticket replay and duplicate key were rejected. The ignored raw stage ledger is `research/mvp3/maci/probe-output/local-m2/one-sponsor-full-proof/events.ndjson`.

| Measure | Observed local value |
| --- | ---: |
| Three sponsored signup transactions | 759,450 gas |
| Three sponsored poll joins | 1,743,233 gas |
| Three encrypted commands to proof-generation completion | 51,260 ms |
| Whole isolated script to verified tally | 95,275 ms |

Encrypted-command gas, coordinator proof submission gas, browser runtime latency, database latency and BSC transaction cost were **not measured** in this probe. These results are synthetic local observations, not a product throughput or testnet estimate.

## Observed local M1 results, 2026-10-15

Environment: Windows, repository-local Node 24.21.0/npm 11.19.0, MACI v3.0.0 packages in ignored research storage, nested Hardhat 2.29.1, in-process chain 31337. Three synthetic MACI credentials used three separate Hardhat sponsor signers for signup/join under the free-for-all policy; encrypted messages were sponsored by one admin signer. FULL mode, one voice credit, three vote options, source selections `[0,1,1]`, final verified tally `[1,2,0]`. Official published ZKeys and rebuilt R1CS/WASM were used. The two successful runs are isolated ephemeral chains. These values are **observed local results**, not BSC estimates or product performance claims.

| Measure | First successful run | Altered-proof probe run | Scope |
| --- | ---: | ---: | --- |
| Three signup transactions | 679,146 gas | 679,170 gas | Free-for-all policy, separate sponsors |
| Three poll-join transactions | 1,846,076 gas | 1,846,148 gas | Includes three real joining proofs |
| Three encrypted publish transactions | 1,076,115 gas | 1,076,139 gas | One admin sponsor |
| Proof/result submission blocks | 2,440,003 gas | 2,439,991 gas | Processing, tally and result submissions combined; per-proof gas not isolated |
| Coordinator processing and tally proof generation | 93,749 ms | 102,049 ms | From merged-signups checkpoint to both proofs generated; includes SDK off-chain verification |
| Processing/tally on-chain submission | 2,172 ms | 1,517 ms | From proofs-generated checkpoint to on-chain checkpoint |
| SDK final tally verification | 94,289 ms | 47,881 ms | From on-chain checkpoint to completion; second run also made a direct invalid-proof call before this interval |
| Complete script elapsed | 201,085 ms | 161,888 ms | In-process deployment through result check |

Deployment gas, merge-signup gas, browser credential generation, sponsor service latency, independent network RPC latency and peak proof-generator memory were **not measured**. The four measured gas categories do not equal total election gas. Machine-readable stage data are in ignored `research/mvp3/maci/probe-output/local-m1/{events.ndjson,invalid-proof-probe/events.ndjson}`. The first successful run created transaction hashes `0x50da98e23edaf5186d83173b405169619ea86fb18fc9173859b988d6f9d6a801` (processing) and `0x9dbac9efc2ba6ee7bb52b0a32a24f77526849075127b62c4af41b7e65661e417` (tally); these are ephemeral local receipts only.

Historical 2026-10-14 status: no MACI runtime or gas measurement yet. Git base revision `4566b4f07a2d3653e16bca4a24c18aba675af03c`; Windows, project target Node 24.21.0/npm 11.19.0. At that date no MACI packages or artifacts were installed.

### Historical empty ledger

| Measure | Observed value | Condition |
| --- | --- | --- |
| Credential generation, encrypted command, browser memory | NOT MEASURED | Await browser-capable selected SDK |
| Registration and poll deployment gas | NOT MEASURED | Await local contracts |
| Message submission gas and sponsor latency | NOT MEASURED | Await local relay |
| Processing proof time / verification gas | NOT MEASURED | Await verified circuit artifacts |
| Tally proof time / verification gas | NOT MEASURED | Await verified circuit artifacts |
| Total lifecycle gas/cost and artifact sizes | NOT MEASURED | Await complete synthetic poll |

The previous DAVINCI local accepted-ballot baseline was approximately 1,053,345/1,053,309 gas in the recorded two-ballot probe. It is **not** a MACI estimate; MACI registration, messages, processing and tally have different cost components. See [historical evidence](../FEASIBILITY_EVIDENCE.md).
## 2026-10-16 application integration measurements

Observed on persistent local Hardhat chain 31337 with the actual browser/API/Supabase/coordinator flow, ignored run `app_e2e_1792123086`, Git base `4566b4f07a2d3653e16bca4a24c18aba675af03c` plus uncommitted changes. Two synthetic voter choices produced verified tally `[1,1,0]`. The deployment began at block 1; coordinator snapshot block 31 recorded two signup, two join and three publish events (including MACI's initial message). The deployment script recorded 31,109,475 total local EVM gas. The accepted processing proof transaction used 555,466 gas and the tally proof transaction used 434,639 gas. The first coordinator submission failed on a nonce collision after processing; saved proofs were reused for the tally submission. End-to-end latency and peak memory were **not measured**. These measurements are local Hardhat observations and are not BSC Testnet estimates.


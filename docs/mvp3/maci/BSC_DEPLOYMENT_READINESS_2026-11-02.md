# BSC Testnet MACI deployment readiness, 2026-11-02

## Decision: NO-GO

This is a synthetic academic prototype on chain 97, not an election security
approval. No BSC transaction was sent and `MACI_BSC_TESTNET_ENABLED=false`.
The pinned artifacts can generate proofs accepted by the local Solidity
verifier, but a browser distribution license decision and an interrupted
deployment recovery mechanism remain material blockers. The public phase-two
ceremony record is also not independently bound to the exact four ZKeys.
Do not convert the local proof result or read-only gas estimates into a claim
of BSC proof compatibility.

| Blocker | Root cause and action taken | Evidence | State |
| --- | --- | --- | --- |
| A. Dependency security | Direct `@nestjs/platform-express` and both `zod` declarations were upgraded to patched exact versions; `follow-redirects` was overridden to 1.16.2. Remaining findings were traced to the packaged Hardhat 2 toolchain and the `snarkjs` CLI. | Fresh production audit: 65 findings/27 high before, 59/22 high after; `typecheck`, `lint`, API/BSC web builds and 23 focused tests exit 0. Full snapshot: [dependency audit JSON](DEPENDENCY_AUDIT_2026-11-02.json). | PARTIAL: 22 inherited/high findings remain, with constrained reachability below. |
| B. Artifact provenance | Rehashed all four selected ZKey/VKey/R1CS/WASM sets and compared with the recorded inventory. Reused the completed local election proof rather than regenerating a large witness. Fresh off-chain and local Solidity verification accepted processing and tally proofs and rejected each altered first public input. | 16 hashes matched [artifact provenance](ARTIFACT_PROVENANCE.md); `research/mvp3/maci/verify-stored-proofs-local.cjs` exit 0 on chain 31337. | PARTIALLY VERIFIED: integrity and proof compatibility; independent phase-one/phase-two ceremony binding remains open. |
| C. License/version/runtime | Rechecked pinned upstream tag `v3.0.0` at `4d0e3a35f9f0c0122101050903bfcb383f7aaaa4`, five archived npm tarballs and lockfile integrity. Found `snarkjs@0.7.6` is GPL-3.0 and is directly imported by the browser join client; the project has no distribution license/source offer. | [license review](LICENSE_AND_VERSION_REVIEW.md), local `snarkjs/COPYING`, [upstream license](https://github.com/iden3/snarkjs). Node 24 tests/builds passed, but upstream requests Node 20. | BLOCKED for distributed browser demonstration until license obligations and source availability are decided. |
| D. BSC gas/bytecode/proof | Added read-only `scripts/preflight-maci-bsc.mjs` and emitted runtime bytecode from the custom Solidity compiler. Scanned the 17 required contract artifacts. Ten creation calls passed live `eth_estimateGas`; seven linked or constructor-dependent stages still need a deployed dependency graph. | BSC chain 97 at block 140359917, gas limit 99,802,695, price 0.1 gwei; local 18-tx deployment used 31,109,475 gas; process/tally Solidity proof checks passed only on chain 31337. | PARTIAL: full chain-97 deployment/proof gas and interrupted-deployment recovery remain unverified. |

## A. Security audit and residual risk

Command: repository-local Node 24.21.0/npm 11.19.0 `npm audit --omit=dev
--json`, exit 1. The committed [machine-readable snapshot](DEPENDENCY_AUDIT_2026-11-02.json)
contains all 59 findings, advisory IDs, vulnerable ranges, dependency paths
and `fixAvailable` values. It does not contain environment values. The high
count is *package-level* and includes inherited aggregation; it is not a
count of 22 independently exploitable issues.

| Dependency path | Relevant high advisories | Reachability and treatment |
| --- | --- | --- |
| API `@nestjs/platform-express -> multer` | `GHSA-q7qp-rjg7-q26m` (`multer >=2.0.0 <2.5.0`) | Removed by `@nestjs/platform-express@12.3.2`, which declares `multer@2.5.0`. The application has no multipart/file upload endpoint, but the direct exposed adapter was patched anyway. |
| API/browser `zod` | `GHSA-mrhx-c7xc-m3w5` (`<4.6.6`) | Removed by pinning `zod@4.6.7` in root and web. External inputs still require size limits; a patched validator alone does not make unbounded bodies safe. |
| Hardhat 2 `solc -> follow-redirects` | `GHSA-mrwp-f3q8-3g9p` (`1.16.0–1.16.1`) | Removed by exact override `1.16.2`. This is deploy/build tooling, not an HTTP request handler. |
| `snarkjs@0.7.6 -> bfj@7.1.0 -> jsonpath -> underscore` | `GHSA-qpx9-hpmf-5gmw` (`underscore <=1.13.7`); inherited high `bfj`, `jsonpath` | `bfj` is imported by `snarkjs/cli.js` for local JSON file output, not by `snarkjs/main.js`, the browser export or the SDK API proof calls inspected. The CLI must consume only local, trusted synthetic files. A `bfj` major-version override was avoided because it would change proof tooling without a compatible upstream contract. |
| `@maci-protocol/contracts -> hardhat@2.29.1` and its plugins | Inherited high on Hardhat, toolbox, ethers, ignition, verify, network helpers, TypeChain, coverage, docgen and gas reporter | The isolated deployer imports Hardhat explicitly. Admin-controlled deployment jobs can trigger this privileged subprocess. Keep it on a separate trusted operator host, use a trusted BSC RPC and pinned local artifacts, and do not ingest external archives/config files. This narrows exposure but does not prove all Hardhat advisories harmless. |
| Hardhat transitive `adm-zip`, `undici`, `@fastify/busboy`, `lodash`, `serialize-javascript` | IDs, ranges and exact nodes in the audit JSON; notably `GHSA-2m5v-pch6-74hx` (undici TLS options), `GHSA-x8mw-p69m-v3mx` / `GHSA-gxm5-99cw-xjw9` (busboy) | No application HTTP route invokes these packages directly; they are in the deploy/test toolchain. A compromised RPC, artifact source or operator host remains a plausible adversary. Do not expose the deployment worker to untrusted configurations. |

No assertion of safety follows from the absence of critical findings. The
audit assesses installed packages; it does not prove whether every vulnerable
function is reached. The prior Next.js 16.4.0 advisory was separately patched
to 16.4.1 before this checkpoint. No automatic `npm audit fix --force` or MACI
version change was used.

## B. Artifact integrity and proof evidence

All selected file sizes and hashes are recorded in [artifact provenance](ARTIFACT_PROVENANCE.md).
Fresh streaming SHA-256 of the four `.zkey`, four exported `.vkey.json`, four
reconstructed `.r1cs`, and four `.wasm` files matched all 16 previously
recorded hashes. The five locally stored official npm tarballs also matched
the recorded SHA-256 values. Their contracts, SDK and coordinator SHA-512
matched their installed lockfile integrity entries; circuits and relayer are
not installed in the root/isolated runtime lockfiles respectively.

The stored synthetic processing and tally proofs in ignored
`probe-output/local-m1/invalid-proof-probe/proofs/` were verified with
`snarkjs.groth16.verify` (exit 0), and each proof failed when public input 0
was incremented. The new local Hardhat 2 probe deployed the exact packaged
`Verifier` and returned `valid=true`, `mutatedAccepted=false` for both proofs
(exit 0). Earlier full local-election receipts and VKey registry comparisons
are retained in [PROGRESS.md](PROGRESS.md); these are ephemeral chain-31337
results. This checkpoint did not generate new witnesses or send BSC proof
transactions.

The [PSE phase-one repository](https://github.com/privacy-ethereum/perpetualpowersoftau)
links the selected power-13/19/20 files but does not publish SHA-256 for those
particular downloads in its main table. The [MACI v3 trusted-setup page](https://maci.pse.dev/docs/security/trusted-setup)
declares its small ceremony complete and permits some low-value teams to
accept coordinator risk, but it does not bind this archive's exact ZKey hashes
to a public phase-two transcript and contributor attestations. Classification
for each selected artifact: **PARTIALLY VERIFIED** for integrity and technical
compatibility, **UNVERIFIED** for independent ceremony trust. This means a
malicious ceremony participant who retained toxic waste could potentially
forge a proof; the local verifier test cannot detect that adversary.

## C. License and runtime compatibility

The MACI root tag is MIT and its inspected contract sources carry MIT SPDX
headers. Five official npm tarballs contain MIT `LICENSE` files and match the
recorded SHA-256 inventory. Contracts and SDK tarballs match the root lockfile
SHA-512 integrity; coordinator matches the isolated runtime lockfile. The
artifact archive has no separate license statement. Transitive licenses and
the right to redistribute the ZKeys still need a documented decision.

The [license inventory](LICENSE_INVENTORY_2026-11-02.json) lists 963 non-dev
lock entries with path, version, declared license and optional-package flag.
It found 17 undeclared licenses and 28 GPL/LGPL-tagged entries, including
browser proof dependencies. Lockfile classification includes deploy/build
packages and optional binaries, so this count is not the size of the browser
bundle.

The directly imported browser `snarkjs@0.7.6` declares **GPL-3.0** and ships
`COPYING`. Serving a compiled browser bundle may count as conveying GPL object
code. The project has no top-level license or corresponding-source publication
procedure. The owner should select an appropriate distribution model and
obtain legal review before hosting the browser demonstration for others; a
mere third-party notice would not settle the combined-work question. See the
[GPLv3 corresponding-source terms](https://www.gnu.org/licenses/gpl.en.html).

The pinned upstream Solidity artifacts use solc 0.8.28, `evmVersion=paris`,
optimizer 200. The custom policies compile with solc 0.8.37,
`evmVersion=cancun`, optimizer 200. [BSC's chain-97 configuration](https://github.com/bnb-chain/bsc/blob/master/params/config.go)
shows Cancun active before the sampled block, so the selected opcode targets
are compatible by fork ordering; actual BSC constructor and verifier execution
are still untested. The isolated Hardhat 2 runtime and root Hardhat 3 coexist;
the deployment script imports the isolated copy. Node 24/npm 11 builds and
focused tests passed, which is empirical compatibility, not upstream support
for that runtime.

## D. BSC deployment and gas preflight

Run the read-only command with the ignored BSC environment:

```powershell
& .\.tools\node-v24.21.0-win-x64\node.exe scripts/maci-testnet-env.mjs scripts/preflight-maci-bsc.mjs
```

The SDK graph deploys two custom policies, four Poseidon libraries, three
linked factories, `Verifier`, `VerifyingKeysRegistry`, `MACI`, the constant
voice-credit factory/proxy, then calls `MACI.deployPoll` to create `Poll`,
`MessageProcessor` and `Tally`. It also sends VKey registration and policy
target-setting transactions. The completed local run recorded 18 deployer
transactions (13 contract creations), 31,109,475 total gas and a 4,261,625
gas maximum transaction. That is **observed local gas**, not BSC gas.

The read-only chain-97 run exited 0 at block 140359917: gas limit 99,802,695,
gas price 100,000,000 wei, deployer balance 0.1996378663 tBNB. All 17
selected creation bytecodes were below 49,152 bytes and runtime bytecodes
below 24,576 bytes; maxima were 19,487 and 15,576 bytes respectively.
Ten `eth_estimateGas` calls succeeded, totaling 17,414,856 gas for the
**subset**: registration 1,083,446; join policy 334,309; Poseidon T3/T4/T5/T6
2,175,413/2,768,229/3,599,387/4,296,615; Verifier 782,546; VKey registry
1,770,965; constant voice-credit factory 384,006; proxy 219,940. The three
linked factories, MACI constructor, and three poll-created contracts cannot
be independently estimated without addresses/state from prior transactions.
No balance was spent by this preflight.

A provisional **2× local total gas** budget is 62,218,950 gas. At 5 gwei it
would cost 0.31109475 tBNB before further retries or margin, exceeding the
sampled deployer balance. Gas price is dynamic; the current 0.1 gwei sample
is not a fee cap or funding assurance. Recheck funding and impose an explicit
fee budget immediately before any authorized transaction.

The deployment CLI records a checkpoint only after multi-transaction SDK
stages. If a stage is interrupted after a broadcast and before its checkpoint,
the script refuses its existing run ID but does not persist each hash before
the SDK waits. The API correctly flags such a job as
`RECONCILIATION_REQUIRED`, yet automatic reconciliation requires a complete
`deployment.json` and cannot recover an incomplete graph. **This is a material
idempotency blocker for chain 97.** Before a BSC deployment, journal every
transaction hash/nonce before waiting, reconcile its receipt and contract
code on chain 97, and resume only the known next stage. Never rerun the current
script against an uncertain run ID.

## Remaining actions before any BSC transaction

1. Decide how the browser's GPL-3.0 `snarkjs` bundle and corresponding source
   will be distributed; document license obligations for the MACI ZKeys and
   remaining transitive packages.
2. Implement and test per-transaction BSC deployment journaling/reconciliation
   with injected interruption after broadcast. Preserve the existing local
   deployment artifacts and chain-instance rules.
3. Verify phase-one checksums and the exact phase-two ceremony record if
   available. If unavailable, explicitly classify and accept the toxic-waste
   risk only for the synthetic academic test; do not claim ceremony trust.
4. Estimate the linked/constructor-dependent stages after safely obtaining
   their addresses, recheck live fees/funding, and verify the full synthetic
   process/tally flow on chain 97 after a separately authorized deployment.
5. Re-run the full audit and regression checks at the final Git revision.

An owner risk acceptance may support a later **CONDITIONAL GO** for the
ceremony limitation alone. It cannot replace the license decision or the
transaction-recovery implementation. A GO decision would require the above
material blockers to be resolved. The explicit deployment gate remains off.

## 2026-11-03 continuation: recovery and browser source

Base Git revision: `fb81c059010203814c3ecb03b9482b96101415a3` with
preserved uncommitted work; this checkpoint itself is not a clean commit.

The chain-97 decision remains **NO-GO for broadcasting**. No new BSC
transaction was sent; the explicit owner authorization required by the mission
has not yet been requested. The read-only RPC preflight at block 140568195
reported chain 97, a 99,609,573 gas block limit, 0.1 gwei gas price, deployer
balance 0.1996378663 tBNB and pending nonce 4. The ten independently
estimable constructor calls still total 17,414,856 gas. The remaining linked
and factory-created stages still need sequential on-chain estimates. The
2x-local-gas planning amount is 62,218,950 gas; at 5 gwei it is 0.31109475
tBNB and exceeds the observed balance. This is a scenario, not a fee quote.

The new `scripts/maci-deployment-journal.mjs` writes signed transaction bytes,
hash, nonce, stage and run/chain/genesis/configuration identity to an ignored
per-run journal before broadcasting. It checks pending nonce, known receipts,
confirmation depth, transaction identity and creation code hashes on resume,
and holds an exclusive signer lock. The deploy and candidate-anchor scripts
use it; the API reconciler now resumes missing deployment and anchor artifacts
only from the matching intent and journal, and only while the chain-97 gate is
enabled. It stops on mismatched or unknown outcomes. The anchor script also
checks the chain-97 transaction gate when invoked directly. These are
implementation and local evidence, not a claim of BSC recovery testing.

On a fresh ephemeral Hardhat Local 31337 instance, a normal synthetic SDK
deployment exited 0 with 18 confirmed journal entries, 13 contract creations,
all creation code hashes present, and 31,109,475 gas used. A second run was
stopped immediately after transaction 3 broadcast (process exit 86), then
resumed from its same intent and journal. It exited 0 with 18 confirmed unique
nonces 18 through 35, no duplicate transaction and 31,109,499 gas. The normal
run's candidate anchor succeeded. The second anchor was stopped immediately
after broadcast (exit 86), then resumed to a single confirmed anchor at nonce
37; the stored configuration hash matched the on-chain transaction input.
The ignored run intents were `journal_local_1793705585283.json` and
`journal_fault_1793705747388.json` under `probe-output/deployment-intents/`.
These are reproducible local observations; the ephemeral node has since been
stopped. The prior verified processing and tally proofs were reused rather
than regenerated, as permitted by the mission.

Five journal fault/identity/lock tests passed. Six API chain-isolation tests
passed. Root TypeScript no-emit, API `tsc` build, full ESLint, BSC web build
and `git diff --check` exited 0. The latter reported only existing CRLF
normalization warnings. The browser `snarkjs` import is reachable through
`maci-join-client.ts`; `apps/voter-web/LICENSE` now contains the GPLv3 text,
and `apps/voter-web/SOURCE_AND_LICENSE.md` specifies the corresponding-source
release. **Distribution is still pending** confirmation of contributor rights,
artifact redistribution rights, an exact source release and a source link on
the hosted site. A license file by itself does not clear that gate.

The stored processing and tally proofs were also rechecked with the local
Solidity `Verifier` on an ephemeral chain 31337 (exit 0): both valid proofs
returned true and both altered first public inputs returned false. A fresh
`npm audit --omit=dev --json` exited 1 with 59 package-level findings,
including 22 high and 0 critical, unchanged from the prior reachability
review. This check does not establish safety of every transitive call path.

Remaining before requesting a BSC transaction authorization: finish the
browser source-release/rights check, recheck the final dependency audit and
document the residual exposure, verify the current key/funding readiness
without printing secrets, and prepare a transaction fee cap. The incomplete
independent ceremony binding remains a separate synthetic-only risk for the
owner to accept explicitly. No contract address, BSC proof transaction, tally
or BSC E2E result exists at this checkpoint.

## 2026-11-03 source publication and signer follow-up

The owner confirmed they hold the rights to license `apps/voter-web` under
GPLv3 and agree to publish its corresponding source. The frontend, its GPLv3
text, package manifests/lockfile and build launcher were committed as
`91dcfb11c0528afb67a409a720fb3f4eba30bb21` and pushed to the existing
public repository. An unauthenticated request to the exact [source commit](https://github.com/khanmhq99/blockchaing-voting-v2/tree/91dcfb11c0528afb67a409a720fb3f4eba30bb21)
and its GitHub source ZIP returned HTTP 200 after initial propagation delay.
The URL was placed only in the ignored BSC environment. A fresh chain-97
static web build exited 0; all 25 generated HTML pages contain that exact
source link. `git diff --exit-code HEAD -- apps/voter-web package.json
package-lock.json scripts/web.mjs` exited 0, showing that the built frontend
files match the public source commit. An enabled BSC web build without a
source URL now fails before compilation (observed exit 1). The source
publication gate for this **web revision** is met, subject to review of any
later source changes and third-party circuit-artifact redistribution rights.

The MACI coordinator public/private pair across the two ignored env files
matched (exit 0). A read-only chain-97 signer preflight found six distinct
valid EVM wallets with nonzero tBNB and reported balances in role order:
deployer 0.1996378663; issuer 0.499979; registration 0.499979; join
0.499979; message 0.5; prover 0.5. Pending nonces were 4, 1, 1, 1, 0, 0.
No addresses or keys were printed. Funding is sufficient at the sampled
0.1 gwei price for the observed local deployment gas, but the 5 gwei,
2x-local-gas planning scenario still exceeds the deployer balance. Recheck
price immediately before an authorized transaction and stop if the estimate
exceeds the available test-BNB budget. The explicit gate remains false; there
is still no MACI BSC deployment or BSC E2E result.

The chain-97 journal now requires `MACI_DEPLOYMENT_MAX_GAS_PRICE_WEI` and
`MACI_DEPLOYMENT_MAX_COST_WEI`. The ignored testnet environment sets 1 gwei
and 0.1 tBNB respectively; candidate anchoring has a separate fixed 0.001
tBNB ceiling. Before signing each new transaction, the journal rejects a
missing gas estimate, an offered gas price over the cap or a cumulative
worst-case gas-limit times price plus value over the budget. These limits are
part of journal identity, so recovery cannot silently raise them. The
additional fee-limit test passed (6/6 journal tests, exit 0); lint and
`git diff --check` passed. Actual BSC gas and cost remain unmeasured until
the separately authorized transactions occur.

The dedicated BSC runtime database was checked again without writes: Prisma
reported all 9 migrations applied, `db:check` passed, and a direct count
reported zero elections and zero deployment jobs for both chain 97 and
31337 in this BSC project. This confirms the intended project is empty at
this checkpoint; the separate Hardhat project was not changed.

### Authorization decision prepared

**CONDITIONAL GO for a private, synthetic chain-97 experiment only after
explicit owner authorization.** The condition is acceptance of the documented
independent ceremony-provenance limit, not a claim that setup trust was
verified. The separate assumptions are a trusted coordinator/operator,
synthetic voter identities, pinned artifacts, and read-only checks on the
selected BSC RPC and dedicated database. Residual package advisories remain
in the isolated toolchain; the deployer must stay on the trusted operator
host. The public web source and license are available at the exact commit
above. Third-party artifact redistribution rights have no archive-specific
license statement and remain a documented legal uncertainty for this
academic demonstration; do not represent them as independently cleared or
publicly host the generated artifact bundle before resolving that question.

The first authorized phase is expected to submit 18 deployer transactions
for the two policies, Poseidon libraries, factories, MACI, VKey registry and
poll, followed by one candidate-binding anchor. The journal stops before
signing if the RPC offers more than 1 gwei or if cumulative worst-case
deployment exposure exceeds 0.1 tBNB; the anchor is limited to another
0.001 tBNB. Expected local gas for those 18 transactions is 31,109,475;
the 2x planning case costs 0.006221895 tBNB at the sampled 0.1 gwei and
0.06221895 tBNB at the 1 gwei limit. These are scenarios, not BSC
measurements. A future phase would perform synthetic registration, approval,
signup, poll joining, encrypted-message submission, processing/tally proofs,
result verification and public audit; its actual transaction count and cost
cannot be asserted until on-chain evidence exists. Stop on changed chain
identity, journal mismatch, insufficient funds, RPC uncertainty or failed
proof verification. No mainnet operation is included.

As of this checkpoint, `MACI_BSC_TESTNET_ENABLED=false`, no MACI BSC
deployment exists, and the owner has **not yet authorized the first BSC
transaction**. Do not mark deployment or end-to-end verification complete.

## 2026-11-03 authorized chain-97 deployment and E2E continuation

This section supersedes the pre-authorization state above. The owner explicitly
accepted the incomplete independent trusted-setup ceremony provenance and
authorized synthetic BSC Testnet transactions within the 1 gwei / 0.1 tBNB
deployment and 0.001 tBNB anchor caps. Both ignored BSC environments now have
`MACI_BSC_TESTNET_ENABLED=true`. No mainnet or public web hosting was authorized.
The published GPLv3 frontend source remains exact commit
`91dcfb11c0528afb67a409a720fb3f4eba30bb21`; the 25-page chain-97 build
exited 0 with its matching source link. Ceremony provenance remains a research
limitation, not an independently verified trust claim.

The dedicated BSC Supabase project has nine applied Prisma migrations. A
read-only query after deployment showed two chain-97 elections and jobs, zero
chain-31337 elections/jobs, and one synthetic Admin. The separate Hardhat
database was not changed. The original poll
`6c5f7ca9-919f-4904-a86c-de1209735a7e` completed 18 journaled contract
transactions and a candidate anchor, and reached Admin job `READY/COMPLETE`.
Registration was missed before its on-chain start while resolving public RPC
`eth_getLogs` failures. It is preserved as deployment evidence and is **not**
an E2E success. The original poll's anchor transaction was
`0xd52dbf9fecc6b4c929f606762406fdb916a56732178456190f4c76353fb072df`.

A fresh synthetic E2E poll
`c3a7fd99-233e-4c06-a4c1-e3ae3c2dd576` was created through Admin with
its own persisted idempotency intent. Chain 97 genesis was checked against
`0x6d3c66c5357ec91d5c43af47e234a939b22557cbb552dc45bebbceeed90fbe34`.
The new journal records 18/18 confirmed deployment transactions, ending in
poll transaction `0xd86703b1002226284e9317e60c6acae380a638003c0090b5beec4074638cc85b`
(receipt status 1, block 140606318, 422 confirmations at one read). The
candidate anchor is
`0xa80fb7b9ac5d399e122ae7933da814a26478021669b0156de1cf88c6a82d3453`.
The Admin deployment job reached `READY/COMPLETE` without a diagnostic code.
Public addresses: MACI `0x0465ceB22DEe0F325a677510d424845b5D0F3275`,
registration policy `0x853E518e650bCaBda7E531B8dfe832a64F2b970E`,
join policy `0x60BC1d494A69F29fd4DB41006259286A9414F5C9`,
poll `0x97442fEAA98e95AB96736c5600Df641605f299A9`,
processor `0x75A28ccFF8fbA4e134C69cC761811dC2f55E9c26`,
and tally `0x70D547d976DB08c0dA0b594Bda87Bf54EF814028`.
The poll opens at Unix `1793725251` and closes at `1793727051`; the
deployment's `pollId` is 0. The same synthetic coordinator key was reused
after the original no-vote poll; this is an explicit key-separation limitation
of this research run.

A read-only receipt sweep validated all 18 journal hashes and block hashes:
actual deployment gas used was 31,109,475 and paid fee was
3,110,947,500,000,000 wei (0.0031109475 tBNB at the observed 0.1 gwei).
The candidate anchor used 22,280 gas and paid 2,228,000,000,000 wei
(0.000002228 tBNB). These are measured BSC receipts, separate from the
earlier planning scenarios and within their configured caps. The command
`node scripts/maci-testnet-env.mjs scripts/report-maci-bsc-cost.mjs
c3a7fd99-233e-4c06-a4c1-e3ae3c2dd576` exited 0 and returned each
transaction's public hash, block, gas and fee.

Two separate synthetic users requested participation, were approved, and
their sponsored MACI signups were confirmed: transaction
`0x54c9518670f43e4e63efb0cc3cf0b3581c9f2d6b97535d5e880bdb5789aaad24`
at block 140606503 and
`0x35e40d735985638b6038c86b01c5471439d7e27cf3a8dc6f01fc704827c90db4`
at block 140606554. Voter credentials remain in ignored local storage.
Join proofs, encrypted commands, processing/tally proofs, public audit and
independent PASS remain pending until the voting window opens and closes.
Both voter-specific joining proofs were generated from the pinned
`PollJoining_14` WASM/ZKey and saved only in ignored local observation
files. A read-only `verifyJoiningPollProof` call on the deployed BSC poll
returned true for each proof before the voting window. Subsequent joining
transactions are recorded in the voting-window checkpoint below.

### Voting-window checkpoint (2026-11-04 Asia/Saigon)

After the BSC block timestamp opened the poll, both previously verified
joining proofs were sponsored and confirmed. Join transactions:
`0x27bd1569618a304355dc8ac5b9130a51da6d7c9f3a7665a83cff56aeb8b83fef`
(poll state index 1) and
`0xb0c98e7d573dbda7ad0f95274cf573b0875b98a7eeea9d9b7d8db0568ba401c7`
(index 2). The corresponding synthetic encrypted commands were confirmed as
`0xd0d42fe0bc6e398b4ffd96a83e9c620fd76032d595b48e29101722c051cf57d3`
and
`0xb58624ac13a12c764decb6584e0df262bfed09fce23ad44436993d3df00b40e8`.
The API Admin monitor at `2026-11-03T17:01:42.994Z` reported chain
`AVAILABLE`, status `OPEN`, two eligible, two registered, two joined, two
encrypted commands `INCLUDED`, zero pending, and no processing or tally
batches yet. The worker is scoped to this election UUID and is waiting for
the poll's on-chain end timestamp. An included ciphertext is not yet a
counted vote; processing, tally, audit publication and independent PASS are
pending.
An Admin monitor read of the earlier no-vote poll at
`2026-11-03T17:19:59.255Z` still showed zero registrations, joins,
commands and proof job, confirming the scoped worker did not process that
historical poll while waiting for the E2E poll to close.
The read-only receipt report independently fetched all six operation receipts
with status 1 and chain-97 genesis match. Measured totals at 0.1 gwei:
registrations 505,751 gas / 50,575,100,000,000 wei; joins 1,106,615 gas /
110,661,500,000,000 wei; encrypted commands 717,450 gas /
71,745,000,000,000 wei. These are transaction fees only and do not imply
proof or tally success.

The chain-97 static export was served on loopback only with clean-route
rewrites. A Chromium smoke run loaded MACI, Admin MACI and public verify
pages, found the exact GPLv3 source link in the rendered DOM, logged in as
the synthetic Admin, and displayed the live `e2e-2` election on the Admin
elections page. A separate synthetic voter browser session also logged in
and displayed the same live election on the voter elections page. The final
Chromium run had zero browser page errors (exit 0). The first smoke
attempt used a non-unique text selector and exited 1 after the live election
appeared twice in the UI; the selector was made precise and the same test
passed. This checks browser/API integration locally; the site was not
publicly hosted and a real voter browser session was not claimed.

### Poll closure and coordinator checkpoint

The BSC on-chain end timestamp passed. At
`2026-11-03T17:31:17.715Z`, the API monitor reported election `CLOSED`,
chain `AVAILABLE`, two joins and two encrypted commands included. The
scoped worker created proof job `8d80b212-9503-44db-8c94-16bf463acfb7`
with closing block 140613858 and hash
`0x6cfe62120405134b5133620875befd4659fbbba35752b9dc2b1d68a65b89a6f9`;
the job entered `RUNNING/COORDINATOR`. The coordinator checkpoint
`signups-merged` records transaction
`0x03afcec6fa31c44d66cb8db969e3ef4609f8197b983e3be2baac5ef0adb4b333`
with 238,054 gas used. Proof generation, proof transaction inclusion,
tally verification, audit publication and independent PASS are still pending.
An independent `eth_getTransactionReceipt` call returned status `0x1`
for that merge transaction.

### Verified synthetic E2E result

Observed on 2026-11-04 Asia/Saigon.

The coordinator generated one genuine `MessageProcessorFull` processing
proof and one `VoteTallyNonQv` tally proof. Both were submitted on BSC with
successful receipts: process
`0xf81323ee8793c43a8d82eb34547289c85875aee88dd9ecadc930ce303a977da1`
(block 140614064, 555,442 gas) and tally
`0x110abbaa79c4c57257625649b93ae14186ce26d3af373b2d531ee340058f431b`
(block 140614099, 434,615 gas). The worker also merged signups
`0x03afcec6fa31c44d66cb8db969e3ef4609f8197b983e3be2baac5ef0adb4b333`,
updated the tally commitment
`0x046acb8476ca99ec16f1e67735c4a2b118a235f25ed75ec623829fd96483e25e`,
and submitted result leaves
`0xe3d682272273a87b1b34d77a9fd3d82a6b14b04445926b5a246a1eebbed6fd49`.
All five prover receipts had status 1. The API read one processed batch and
one tallied batch from the contracts. The coordinator's final checkpoint
was `complete` with `verified=true`; its public manifest contains
aggregate tally `["1","1","0"]` for Option Alpha, Beta and Gamma.
`PublishMessage` had three on-chain events because MACI includes a protocol
initialization message; the two separately confirmed encrypted commands are
the synthetic voter submissions.

The proof job advanced through `AWAITING_CONFIRMATIONS` and
`READY/AUDIT_VERIFIED`. The first Admin publication attempt returned HTTP
503 and left the election `CLOSED`/job `READY`; this was verified before
retry. The second approval completed its independently checked audit
transaction: election `VERIFIED`, job `PUBLISHED`, snapshot block
140614405/hash
`0xfd31caec478ea53d1ff5b92f717461e2d0e94edf406caa3f93f67cf2cfe3ad1f`.
Automatic candidate-configuration publication then failed because the
strict API schema omitted the `genesisHash` field present in the previously
anchored BSC configuration. The schema now accepts that field and requires
it to match the live chain-97 genesis. After a clean API restart, manual
publication of the **same anchored canonical bytes** exited 0, with SHA-256
`9cd56381808251ec26401ba30445c710b5244650eef1624d3c8d23bc747930c8`
and `onchain-pre-election-hash-v1` binding. No anchor was changed or
replayed. Public API downloads yielded manifest SHA-256
`78e3f9adc5760418b095f460bdacb6dab465317b1066228a340becf50413c0a2`
and matching event, proof, tally and configuration hashes.

The standalone `scripts/verify-election.mjs` independently read those
publicly downloaded files and chain-97 RPC, without API, DB or coordinator
imports. Its first run passed artifact hashes, pinned configuration,
canonical snapshot, pre-election anchor, on-chain configuration and complete
event/receipt checks, then hit its 180-second timeout while scanning every
transaction in more than 8,000 unrelated BSC blocks. The verifier now
checks complete proof-batch counts at the pinned snapshot and checks each
referenced proof transaction's target, calldata, receipt and Groth16 proof;
this preserves proof completeness while avoiding the unrelated block scan.
The rerun **exited 0 with verdict `PASS`** at
`2026-11-03T17:47:27.859Z`, including
`CANONICAL_EVENTS_AND_RECEIPTS=PASS` and
`MACI_PROOFS_AND_TALLY=PASS`. Its machine-readable aggregate result was
`option-0=1, option-1=1, option-2=0`, with no reason codes. The exact
configuration hash above was supplied as the prior pin; the verifier also
checked its on-chain pre-election anchor and BSC genesis. A verifier PASS
does not establish honest identity issuance, coercion resistance or
independent trusted-setup ceremony provenance.
An ignored copy with a duplicated processing-proof transaction reference
was rejected with `verdict=INCOMPLETE` and `PROOF_BATCH_INCOMPLETE` after
the artifact, configuration, snapshot, anchor, contract and event checks
passed. The first negative attempt was rejected as `MANIFEST_JSON_INVALID`
because PowerShell wrote a UTF-8 BOM; the corrected no-BOM fixture reached
the intended batch-count check. Published evidence was never edited.

Final Admin monitor at `2026-11-03T17:49:09.654Z` reported
`VERIFIED`, chain `AVAILABLE`, 1,882 snapshot confirmations,
2 eligible/registered/joined voters, 2 encrypted commands included,
0 pending, 1 on-chain processing batch, 1 on-chain tally batch, and proof job
`PUBLISHED`. The public frontend in a loopback-only Chromium session loaded
`/verify?election=<synthetic-id>`, rendered all three candidate rows and the
`onchain-pre-election-hash-v1` binding from the public API, and had zero
page errors. Separate synthetic Admin and voter logins displayed the same
election. The web was not publicly hosted.

For this **second** election only, receipt-validated gas totals were:
18 deployment transactions 31,109,475 gas, candidate anchor 22,280,
2 registrations 505,751, 2 joins 1,106,615, 2 encrypted commands 717,450,
signup merge 238,054, processing proof 555,442, tally commitment update
59,176, tally proof 434,615, and result publication 1,390,734.
That is 30 transactions and **36,139,592 gas** in total, paying
3,613,959,200,000,000 wei = **0.0036139592 tBNB** at the observed
0.1 gwei. These are chain-97 measurements, excluding the earlier
deployment-only poll and off-chain proving compute/time. The deployment
and anchor components remained below their configured 0.1 and 0.001 tBNB
limits. The local-only synthetic coordinator key was reused after the
original no-vote poll; fresh per-election key separation remains a research
limitation. No mainnet or real electorate was used.
The PublicNode endpoint returned one HTTP 502 during an optional long
historical fee scan, and the already completed worker logged one
`BlockNotFoundError` while stopping. A subsequent read-only query returned
the pinned snapshot hash unchanged, and the independent verifier had
already passed; these are RPC availability observations, not reorg evidence.
The API, scoped worker and loopback web smoke server were stopped after
verification; ports 3000 and 3001 were confirmed closed.

The original BNB public RPC returned `-32005` for a single-block
`eth_getLogs` query. The selected PublicNode BSC testnet HTTPS endpoint
returned the same chain/genesis and the expected factory log; all three
ignored BSC RPC variables now use that endpoint. The environment wrapper was
fixed to set `DOTENV_CONFIG_PATH` to the selected BSC file and remove inherited
`RELAYER_PRIVATE_KEY`, preventing local `.env` signer contamination. Deployment
recovery now consumes the confirmed VKey transaction from its journal and
compares all four VKeys on-chain before proceeding. No uncertain transaction
was replayed. Current checks: `npm.cmd run typecheck` exit 0, `npm.cmd run
lint` exit 0 after three new-script lint fixes, `git diff --check` exit 0,
and the BSC DB preflight exit 0. The detailed private journal and voter
observations remain ignored under `research/mvp3/maci/probe-output/`.
Final reruns of `npm.cmd run lint`, `npm.cmd run typecheck`,
`npm.cmd run build:api` and `git diff --check` all exited 0.
Further focused regressions passed: seven deployment-journal/environment
tests and eighteen mock-based proof-job, chain-isolation and workflow tests.
The latter are not Supabase or BSC proof results. A standalone TypeScript
bundler-resolution check of the synthetic join/vote runner and repository
lint passed. The built frontend still has 25/25 HTML pages linking the exact
public source commit, and `git diff --exit-code HEAD -- apps/voter-web
package.json package-lock.json scripts/web.mjs` exited 0.
A 2026-11-03 repeat of `npm.cmd audit --omit=dev --json` exited 1 with
unchanged package-level counts: 0 critical, 22 high, 24 moderate, 13 low
(59 total). The reachability classification above remains the current
academic PoC limitation; this count is not 22 distinct exploitable flaws.

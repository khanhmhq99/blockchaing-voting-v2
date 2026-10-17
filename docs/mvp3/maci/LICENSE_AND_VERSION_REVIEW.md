# MACI license and version review

## Local runtime probe, 2026-10-15

Exact direct versions `@maci-protocol/{crypto,domainobjs,core,contracts,sdk}@3.0.0`, `@maci-protocol/coordinator@1.0.0`, `ethers@6.15.0` and `hardhat@2.25.0` were installed with `--save-exact --ignore-scripts` only in ignored `research/mvp3/maci/runtime-env/` (npm exit 0). The resolver also installed a nested Hardhat 2.29.1 under MACI contracts for peer compatibility. A Node 24 smoke import for SDK deployment/proof APIs and contract helpers exited 0; an in-process Hardhat network yielded 20 synthetic signers on chain 31337 after loading that nested plugin. These checks do not establish full Node 24 support or BSC bytecode compatibility. Authorized `npm audit --omit=dev --json` exited 1 with 87 advisories (19 low, 36 moderate, 32 high, 0 critical); machine-readable output is in ignored `probe-output/runtime-audit.json`. The compiler-only environment has another three high advisories via `bfj -> jsonpath -> underscore`. No audited dependency decision or product installation has occurred.

Review date: 2026-10-14. Candidate: [official MACI v3.0.0 release](https://github.com/privacy-ethereum/maci/releases/tag/v3.0.0), annotated tag object `eea8732973921d1ee69a5048fdd5feed4b1d2c22`, source commit `4d0e3a35f9f0c0122101050903bfcb383f7aaaa4`. Source is checked out in ignored `research/mvp3/maci/upstream`. The [official repository](https://github.com/privacy-ethereum/maci) reports MIT and was archived on 2026-08-19. The [v3 documentation](https://maci.pse.dev/docs/introduction/) still describes a core team as maintaining it; the archive status is the stronger current source-state signal. No maintained successor has yet been confirmed.

| Component | Observed source evidence | Result |
| --- | --- | --- |
| Root repository | Tag root `LICENSE` is MIT, copyright 2025 Ethereum Foundation; root package has `license: MIT` and `engines.node: 20` | Source MIT observed; retain attribution/notice |
| Circuit source and package | Tag `packages/circuits` v3.0.0 lists `LICENSE` in publish files but has no package `license` field; no nested LICENSE exists in checkout and Circom sources lack SPDX headers. npm metadata has no license field but has a SHA-512 tarball integrity value. | Source likely covered by root MIT, but published tarball contents/license not verified |
| Contract source and package | Tag `packages/contracts` v3.0.0 has no package `license` field; inspected contracts carry `SPDX-License-Identifier: MIT`; transitive `@excubiae/contracts@0.13.0` npm metadata says MIT. | Own source MIT observed; other dependencies and tarball unverified |
| SDK, CLI, coordinator, relayer | SDK v3.0.0 and coordinator/relayer v1.0.0 npm metadata return versions and integrity values but no license field; source packages also omit it. Coordinator/relayer are separate v1.0.0 service versions. | UNVERIFIED for published distribution and transitive terms |
| Groth16 artifacts and generated verifier | Official v3 small-ceremony archive downloaded; archive has seven ZKeys only, no artifact license/manifest, R1CS, WASM, vkey or verifier source | Artifact distribution terms and generated-verifier license UNVERIFIED |
| Cryptographic dependencies | No exact lockfile, advisories or reciprocal terms inspected for the selected tag | UNVERIFIED |

The [v2 audit](https://maci.pse.dev/assets/files/20240731_PSE_Audit_audit_report-a0a0f08a5c621ccd0389d5e345c119be.pdf) covers specified earlier commits, including non-quadratic circuits; it does **not** establish that every v3 change or artifact was audited. The upstream root package requests Node 20 and pnpm 9/10, whereas this project pins Node 24.21.0/npm 11.19.0. Compatibility is untested. BSC Testnet EVM, Solidity compiler settings, gas and browser SDK compatibility are also untested. No package is approved for final integration or installed in the project lockfile.

The tag source is now available through an authorized read-only network call. Its `download-zkeys:ceremony` **prod URL returns HTTP 404**. Main commit `919c433d09aa776a05ca2d89a0074324d6199e91` changes it to `maci_artifacts_v3.0.0_prod.tar.gz`; HTTP HEAD returned 200 with 1,328,939,179 bytes and S3 version ID `AxZejgyPmZhJTYWEBISs7gXKQ4Ccooti`. The archive was downloaded and hashed; see [artifact provenance](ARTIFACT_PROVENANCE.md). An S3 ETag is not a cryptographic checksum. The upstream v3 trusted-setup page says the small ceremony completed; its artifact/transcript claim still needs independent verification.

Initial restricted-network `git ls-remote` exited 1; the authorized repeat and shallow tag clone exited 0. The authorized repository-local Node 24 npm metadata queries for circuits, contracts, SDK, coordinator, relayer and `@excubiae/contracts` exited 0. Five official npm tarballs were downloaded to an ignored research directory; each contains `package/LICENSE` with MIT text and 2025 Ethereum Foundation copyright. The npm `license` metadata fields remain absent. The earlier restricted query was interrupted; the system `npm.cmd` call exited 1 with sandbox `EPERM` on the home directory. Transitive-license and advisory review remain pending.

| npm tarball | Bytes | Locally observed SHA-256 |
| --- | ---: | --- |
| `@maci-protocol/circuits@3.0.0` | 101,234 | `b5822402528f8f26d73fd538a4ed8abff919b8348ec7a009cc699c2c36988163` |
| `@maci-protocol/contracts@3.0.0` | 3,118,978 | `f88c67eb51c9b0474ba509fb5c1cae7180b24bcadfc48383788d8714cc7e0bbd` |
| `@maci-protocol/sdk@3.0.0` | 162,671 | `b0caed4d1d773170f0bad8e78909226a4f05b936246f911ab31d2c9e763ec4dc` |
| `@maci-protocol/coordinator@1.0.0` | 314,325 | `6ad93142e9760d62eb11ff22986124f4bb4e496fc84e2110d224ccf9112a11fd` |
| `@maci-protocol/relayer@1.0.0` | 180,097 | `db09baa8e120ccb4064f5bb0f41a4f874e87f5ec68ea70df37285fcd43cb48c6` |

Required next review: obtain exact npm tarballs through official channels; compare licenses/NOTICE/SPDX for every package and verifier; inspect exact dependency lockfile and advisories; verify supported runtime and EVM fork with a local proof. Record integrity hashes and reciprocal obligations before selecting the version. The upstream contracts use Solidity `^0.8.28` and Hardhat 2, while this repository pins Solidity 0.8.37 and Hardhat 3; integration needs a separate compatibility smoke test.

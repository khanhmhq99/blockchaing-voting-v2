# Exact-version license review

Status: **CONDITIONAL / redistribution BLOCKED pending legal and binary review.** This is technical license inventory, not legal advice. Tags and commits are fixed in [progress](PROGRESS.md). The copied upstream trees are ignored; use each linked LICENSE at the selected tag, rather than inferring package terms from a root README.

| Component and use | Exact source/license | Finding |
| --- | --- | --- |
| Semaphore identity, group, proof and core `4.14.4` | [Per-package MIT LICENSE files](https://github.com/semaphore-protocol/semaphore/tree/v4.14.4/packages) at `507866f9...` | VERIFIED direct terms; preserve copyright/license text when redistributing |
| Semaphore Solidity contracts `4.14.4` and circuits | [Contracts LICENSE](https://github.com/semaphore-protocol/semaphore/blob/v4.14.4/packages/contracts/contracts/LICENSE), [circuits LICENSE](https://github.com/semaphore-protocol/semaphore/blob/v4.14.4/packages/circuits/LICENSE) | VERIFIED MIT source terms; generated verifier marks snarkjs-generated portions MIT in its SPDX header, but proving artifact ceremony/provenance is separate |
| ElectionGuard Python `1.4.0` encryption, ceremony, tally and source verifier | [LICENSE at tag](https://github.com/Election-Tech-Initiative/electionguard-python/blob/1.4.0/LICENSE), `d2f3d5fb...` | VERIFIED MIT source terms; package wheel omits `electionguard_verify`, so PoC imports verifier from pinned source |
| ElectionGuard Core 2 `v1.91.18.2` | [LICENSE at tag](https://github.com/Election-Tech-Initiative/electionguard-core2/blob/v1.91.18.2/LICENSE) | VERIFIED MIT root source; NOT SELECTED, native HACL fetch and binary license chain not audited |
| ElectionGuard C `v0.0.6` | [LICENSE at tag](https://github.com/Election-Tech-Initiative/electionguard-c/blob/v0.0.6/LICENSE) | VERIFIED MIT root source; NOT SELECTED; GMP native linkage obligations need audit if revisited |
| `snarkjs@0.7.5`, actual Semaphore proving path | Installed package `COPYING`, `package.json` declares GPL-3.0 | VERIFIED GPL-3.0 runtime dependency. Distribution/bundling implications BLOCKED for legal review. This is not covered by Semaphore's MIT license. |
| `gmpy2@2.3.2`, actual ElectionGuard arithmetic path | Installed wheel metadata: `LGPL-3.0-or-later` | VERIFIED declared LGPL terms; bundled GMP/MPFR/MPC native binaries and replacement/source obligations NOT VERIFIED. |
| `circom_tester@0.0.19` and nested `snarkjs@0.5.0` | Installed npm metadata GPL-3.0 | CONDITIONAL: transitive path via `@zk-kit/artifacts -> circomkit`; not invoked by the PoC's `generateProof`, yet installed in the runtime graph. Exclusion/bundling review required. |
| `esprima@1.2.5` | Installed `LICENSE.BSD` and legacy `package.json.licenses` | VERIFIED BSD-family source terms; modern `license` field is absent, hence the inventory's missing-field count. |

The [installed dependency inventory](dependency-inventory.json) records 176 npm packages and 43 Python distributions, including declared license metadata and exact versions. It is an SBOM-like inventory, **not** a complete license clearance. Npm metadata shows 19 GPL-3.0 package instances, including nested duplicates; Python metadata shows `gmpy2` LGPL and `hypothesis` MPL-2.0 (the latter is research helper tooling). Native binary license files, all transitive license obligations, package publication artifacts and distributed proof assets need a final review. Unknown critical native terms must block redistribution rather than be treated as MIT by association.

No thesis prototype binary/browser bundle is approved for public redistribution from this audit. The source-only isolated research scripts themselves do not redistribute upstream code or credentials.

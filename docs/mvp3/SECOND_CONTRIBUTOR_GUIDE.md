# MVP 3 phase-two contribution: contributor 2 handoff

Date: 2026-10-14. Audience: the person independently controlling the second contributor workstation. This is a research-only Groth16 phase-two ceremony. The input `ballot_0001.zkey` already contains one automated contribution made on the owner's workstation. **Your contribution is the independent one.** You must control your own machine, random input and software installation; do not give the owner your entropy or remote control of your machine. The output zkey and public hashes may be returned to the owner. No election private key, voter data or proof witness is needed.

Source-rights update: the owner has received `ballot_0002.zkey`, but the pinned DAVINCI repository has no explicit license found. This guide and the local handoff files are **not a license grant**. Do not send the upstream source, patch, circuit artifacts or proving key to additional people or publish them until the rightsholder clarifies permission. The contributor may still send only their own file hash, public contribution hash and entropy-control attestation to complete the provenance record. See [source-rights review](SOURCE_AND_CIRCUIT_REVIEW.md).

## Files and identity of the circuit

The directory `handoff-0001` contains `ballot_0001.zkey`, `ballot_proof.r1cs`, `ptau_final.ptau`, `ballot_proof.wasm`, `ballot-public-signals.patch` and `manifest-0001.json`. These are public ceremony artifacts, not secret entropy. Obtain **this guide and its expected SHA-256 values through a separate authenticated channel** before trusting the large-file transfer. Do not trust a manifest bundled with the files as the only authenticity check.

| File | SHA-256 |
| --- | --- |
| `manifest-0001.json` | `376aa42affe97aa1154fb94d81084cb24c2ec810cb65a2b0198c5c4f5c34e2e2` |
| `ballot_0001.zkey` | `6c82e0875a255359c8823bdc2cf299bfe95385706be915f384124d9dbf3419cd` |
| `ballot_proof.r1cs` | `42081cdba74a1e0cce3b688fcc23fc4b7399b278be7995b7b0be8af7d4bcdd10` |
| `ptau_final.ptau` | `9693220206afab749e3d88d4ab5fdf5d36120ea102e7e587ccea0e7a5208e711` |
| `ballot_proof.wasm` | `f472e9583cc88f1cb0ffed435bd9c43479690d16f0001c01768a946a417e6e4c` |
| `ballot-public-signals.patch` | `8b948152b2abdb4d9447f8d4d0b5e8701c4518de637b09b7a12ae17ac2e243d9` |

Frozen upstream DAVINCI commit: `a39a9f9867bb70726ad2137ed536d75670e042b9`. Circuit hash reported by snarkjs: `fc26682b66eb5f71597a56683abb58c618340528923761b1fd8ffe407b343ae50c29e355010a6e1748d4d321f9a306e4a17195718481b65b3678ed12c8380069`. The R1CS has 72 public inputs and uses the two-file patch in the handoff directory. Owner contribution hash: `34e053f7619fda67a337b3a3edaec34e169ad75ec4eb80e46585a73de7dba84c98186548cf0ff011b160ab76ea70455f44830f129a96d2427d097b114d5bd606`.

## On your own Windows machine

1. Copy the handoff directory locally. Check every file's SHA-256 against the values sent separately by the owner. In PowerShell, from the handoff directory:

   ```powershell
   if ((Get-FileHash .\manifest-0001.json -Algorithm SHA256).Hash.ToLowerInvariant() -ne '376aa42affe97aa1154fb94d81084cb24c2ec810cb65a2b0198c5c4f5c34e2e2') { throw 'Manifest hash mismatch' }
   $expected = Get-Content .\manifest-0001.json -Raw | ConvertFrom-Json
   foreach ($entry in $expected.files.PSObject.Properties) {
     $actual = (Get-FileHash -LiteralPath $entry.Name -Algorithm SHA256).Hash.ToLowerInvariant()
     if ($actual -ne $entry.Value.sha256) { throw "Hash mismatch: $($entry.Name)" }
   }
   ```

   The owner-supplied manifest itself must also match the separately communicated fingerprint. A hash check detects transfer corruption; it does not by itself establish circuit correctness or licensing.

2. Independently install Node.js 24.21.0 and `snarkjs@0.7.6` in a **new local directory**, using one package lockfile. Do not execute binaries or scripts sent by the owner. From inside `handoff-0001`, create a sibling tools directory:

   ```powershell
   New-Item -ItemType Directory -Path ..\phase2-tools
   Push-Location ..\phase2-tools
   npm.cmd init -y
   npm.cmd install --save-exact snarkjs@0.7.6
   Pop-Location
   $snarkjs = Join-Path (Resolve-Path ..\phase2-tools) 'node_modules\snarkjs\build\cli.cjs'
   (Get-Content ..\phase2-tools\node_modules\snarkjs\package.json -Raw | ConvertFrom-Json).version
   ```

   Confirm that the reported version is `0.7.6`. Review the dependency audit before relying on the installation. Independently checking circuit semantics is separate from contributing entropy. To reproduce the R1CS, obtain the upstream DAVINCI source at the pinned commit, review both patched circuit files, then run from a fresh clone (adjust the handoff path to your location):

   ```powershell
   Push-Location ..
   git clone https://github.com/vocdoni/davinci-circom.git
   Push-Location .\davinci-circom
   git checkout a39a9f9867bb70726ad2137ed536d75670e042b9
   git apply ..\handoff-0001\ballot-public-signals.patch
   npm.cmd install --ignore-scripts --save-exact circom2@0.2.23 circomlib@2.0.5
   node node_modules\circom2\cli.js circuits\ballot_proof.circom --r1cs --sym -o . -l circuits -l node_modules
   (Get-FileHash .\circuits\ballot_proof.r1cs -Algorithm SHA256).Hash.ToLowerInvariant()
   Pop-Location
   Pop-Location
   ```

   Require the R1CS hash in the table above. The prior local Windows compiler probe needed a normal Windows execution environment; if compilation fails, record the exact failure and keep circuit review marked incomplete. A matching R1CS hash does not replace a security review of its constraints.

   The owner-side attempt to run `powersoftau verify` on the 302 MB ptau was interrupted before completion; the phase-one transcript has **not** been independently verified in this handoff. If you also take the phase-one reviewer role, run `node $snarkjs powersoftau verify .\ptau_final.ptau` to completion and record its result separately. A matching ptau SHA-256 alone is not a ceremony verification.

3. Verify the input key against the supplied R1CS and ptau **before** contributing:

   ```powershell
   node $snarkjs zkey verify .\ballot_proof.r1cs .\ptau_final.ptau .\ballot_0001.zkey
   if ($LASTEXITCODE -ne 0) { throw 'Input verification failed' }
   ```

   Require exit code 0 and `ZKey Ok!`. Confirm the printed circuit hash above and the owner contribution record. Stop if any check fails.

4. On your own machine, run the interactive contribution. Use a new output filename outside the transferred directory if possible. **Do not use `-e` or put entropy on the command line.** SnarkJS prompts for random text; enter private, fresh randomness yourself. Do not share or record that text.

   ```powershell
   node $snarkjs zkey contribute .\ballot_0001.zkey .\ballot_0002.zkey --name="Independent contributor 2" -v
   if ($LASTEXITCODE -ne 0) { throw 'Contribution failed' }
   ```

5. Verify the output and record only public evidence:

   ```powershell
   node $snarkjs zkey verify .\ballot_proof.r1cs .\ptau_final.ptau .\ballot_0002.zkey
   if ($LASTEXITCODE -ne 0) { throw 'Output verification failed' }
   (Get-FileHash .\ballot_0002.zkey -Algorithm SHA256).Hash.ToLowerInvariant()
   ```

   Confirm that `ZKey Ok!` appears and the transcript lists both the owner's contribution and your new contribution. Preserve the public contribution hash printed by `zkey contribute` or `zkey verify` and the output file SHA-256. Send the owner `ballot_0002.zkey`, its SHA-256 and the public contribution hash via the agreed channel; confirm the SHA-256 separately. **Never send entropy, secrets, private keys, seed phrases, ballot choices or proof witnesses.**

6. The owner verifies your returned key and contribution transcript, then applies a **future, predeclared public unpredictable beacon**. Neither party should choose a beacon value after inspecting a desired output. The owner must run `zkey verify` again after the beacon, export the final verification key/Solidity verifier, and rerun ballot, browser and chain probes. Your contribution alone does not finish the ceremony or approve deployment.

The command order follows the [official snarkjs Groth16 ceremony guide](https://github.com/iden3/snarkjs#16-contribute-to-the-phase-2-ceremony). Keep a public log of tool versions, UTC time, input/output file hashes and contribution hash. The security claim assumes at least one contributor's entropy remains unknown to every other participant and to the deployer.

## Follow-up after the returned file

The owner received `ballot_0002.zkey` but no separately communicated hashes or entropy-control attestation. On **your own retained copy**, run the step-5 SHA-256 and `zkey verify` commands again. Send the owner only (1) the output file SHA-256, (2) the public hash printed for contribution #2, and (3) a short statement that you ran the contribution on a device you controlled, entered fresh private entropy yourself, and did not disclose that entropy. If this is not true, say so; the owner must then treat the contribution as untrusted. Never send the entropy itself. The owner will compare your independently reported hashes with the received file and the public transcript.

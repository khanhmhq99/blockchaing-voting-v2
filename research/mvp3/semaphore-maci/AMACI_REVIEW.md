# aMACI compatibility review (research only)

Reviewed 2026-10-17 against [Dora Factory's MACI repository](https://github.com/DoraFactory/maci), its [AMACI protocol overview](https://maci-docs.dorafactory.org/en/docs/protocol/overview), and the [AMACI contract manifest](https://raw.githubusercontent.com/DoraFactory/maci/main/contracts/amaci/Cargo.toml). No aMACI package was installed or integrated.

| Question | Finding and evidence limit |
| --- | --- |
| Supported version | Dora's repository describes its own MACI/AMACI implementation for Dora Vota and Cosmos, with `cw-amaci` crate version `0.1.0`. Compatibility with the application's `@maci-protocol/*@3.0.0` EVM contracts and circuits is **not verified**. |
| Cryptography and anonymity | The documented `deactivate` / `add-new-key` flow uses a ZK proof to introduce a new MACI key without revealing which deactivated entry it came from. The operator can still decrypt commands by state index, and initial issuer and metadata assumptions remain. The exact circuits, setup and threat model need independent review. |
| Contract compatibility | Dora's main repository identifies CosmWasm contracts and Dora Vota/Cosmos deployment, whereas this application uses Solidity EVM MACI v3 on Hardhat/BSC Testnet. Direct contract or verifier reuse is **not supported by evidence**. A port would be a new protocol integration, outside MVP 3A. |
| Maintenance | The official organization lists recent 2026 activity; this does not establish security maintenance, tagged compatibility or response to advisories. |
| Dependencies and license | The `cw-amaci` manifest includes CosmWasm and git-sourced Rust dependencies. No complete transitive license/advisory audit was run. A redistributable grant for the exact selected package/artifacts has not been established here. |
| Migration effect | Adoption would replace or deeply alter the current MACI v3 EVM contract, circuits, coordinator, SDK, proof format, verifier and deployment assumptions. It would not be a drop-in registration adapter. |

Research classification: **NO-GO for direct MVP 3A migration** on the available compatibility evidence; **NOT VERIFIED** as a separately ported protocol. This is an engineering inference from the official platform and contract descriptions, not a claim that aMACI is insecure.

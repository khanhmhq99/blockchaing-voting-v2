# BSC Testnet read-only feasibility

Official [BNB Chain JSON-RPC documentation](https://docs.bnbchain.org/bnb-smart-chain/developers/json_rpc/json-rpc-endpoint/) identifies Testnet chain ID 97 and the endpoint used below. The [Mendel upgrade notice](https://docs.bnbchain.org/announce/mendel-bsc/) documents a per-transaction 16,777,216 gas cap. The research script made only JSON-RPC reads and `eth_estimateGas`; no signed or unsigned transaction was broadcast.

`bsc_readonly.mjs` exited 0 on 2026-10-17 Asia/Saigon after a restricted-sandbox connection attempt failed with `EACCES`. The final successful read-only call observed chain ID 97, latest block 137166832, block gas limit 99,901,583 and gas price 100,000,000 wei at that instant. Estimates used the **exact locally compiled creation bytecode**, with an arbitrary non-signing sender and placeholder constructor addresses where needed:

| Contract creation | `eth_estimateGas` on chain 97 | Local deployed gas |
| --- | ---: | ---: |
| Poseidon T3 | 3,644,434 | 3,614,580 |
| Semaphore verifier | 3,746,670 | 3,716,011 |
| Semaphore group | 1,819,921 | 1,804,661 |
| Research registry | 590,081 | 584,505 |

The four creation estimates are each below the documented per-transaction cap. The largest measured deployed code, the 15,856-byte Semaphore verifier, is below the usual 24,576-byte EVM runtime-code limit, but no on-chain BSC deployment/code readback was performed. The local registry ballot gas of 333,524 / 316,436 / 316,448 is **not a BSC estimate**. RPC `eth_estimateGas` for ballot submission cannot verify the complete path until real group/verifier contracts exist on chain 97; deployment is expressly outside this investigation. No ElectionGuard Solidity verifier exists, so its deployment/submission costs are **not measured**.

Three ElectionGuard public ballot JSON files of 35,333-35,335 bytes were produced locally, while on-chain submission carried 452 bytes per ballot. A public content-addressed archive and availability policy are required for reconstruction; storing only chain digests is insufficient. Quoted gas price is a transient observation, not a future fee budget. End-to-end chain-97 opcode/precompile behavior, finality and throughput remain unverified by this read-only check.

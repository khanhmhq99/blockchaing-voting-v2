# Phase-two final beacon precommitment

Written 2026-10-14 before the selected future drand round is due. Status: **precommitted; do not substitute a different round or source after seeing its output**.

| Parameter | Frozen value |
| --- | --- |
| Input zkey | `research/mvp3/ceremony/ballot_0002.zkey` |
| Input zkey SHA-256 | `42b372c67604b84119c29dfa67db6f2891cced3c4c98fc3a1b5dc7fe09d582cb` |
| Network | drand League of Entropy mainnet `default`, chained BLS |
| Chain hash | `8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce` |
| Round | `6551994` |
| Scheduled round time | `2026-10-14T15:14:00Z` (`2026-10-14 22:14:00` Asia/Saigon) |
| Beacon value for `snarkjs zkey beacon` | 32-byte hex `randomness` from the signed result for that exact drand round; **unknown at precommitment** |
| `numIterationsExp` | `20` |
| Contribution label | `drand-default-round-6551994` |
| Output | ignored `research/mvp3/ceremony/ballot_final.zkey` |

The chain hash, period 30 seconds and genesis Unix time `1595431050` were fetched from the public drand chain-info endpoint before the selected round. The round was calculated from the [drand time-to-round formula](https://docs.drand.love/docs/specification/). Fetch the exact round from two independent [drand relays](https://docs.drand.love/developer/http-api/), check matching `round`, signature and randomness, verify the beacon signature against the pinned chain public key, and check `SHA-256(signature) == randomness` before using it. If those checks cannot be completed, keep finalization pending; do not switch silently to another round or an operator-chosen value. Record the result and source responses as public evidence.

The beacon is one final public contribution, not a substitute for independent private entropy. Independent control of contribution #2 still requires the contributor's separate hash/attestation. The phase-one transcript, circuit/source review and other MVP 3 gates remain separate.

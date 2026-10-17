# MACI security assumptions

| Adversary / failure | Assumption and verification obligation | Residual limit |
| --- | --- | --- |
| Dishonest eligibility issuer | Enforce eligibility and one registration per account/election in an on-chain policy bound to MACI public key/poll, rather than `msg.sender` alone; probe duplicate, replay and unauthorized attempts | Issuer can admit fake or ineligible people; cryptography cannot prove real-world identity |
| Coordinator reads ballots | Client encrypts to pinned coordinator key; test malformed/altered commands and proofs | Coordinator can decrypt individual commands and correlate when it has registration or network metadata |
| Coordinator withholds work | Reconstruct all canonical messages and compare processing commitments; monitor missing proof deadlines | Result may remain unavailable; valid on-chain inclusion alone does not mean counted |
| Relayer modifies or censors | Client signs MACI command before encryption, contract records exact encrypted message; probe mutation and retry | Relay can delay, omit and correlate IP/timing; sponsor budget can deny service |
| Compromised browser or lost key | Review client dependency/CSPRNG, keep secret client-side, verify encrypted backup and recovery | Compromised endpoint can reveal or change a choice; lost unrecoverable credential can disenfranchise |
| Dishonest RPC or reorg | Rebuild from canonical chain with block-hash/finality checks; test orphaned receipts | A single compromised RPC can mislead the UI; chain consensus is assumed |
| Forged or substituted proving artifact | Match source/config, hashes, ceremony evidence, vkey and deployed verifier; real/invalid proof probes | Undocumented setup or supply-chain compromise invalidates the security claim |
| Small electorate / timing observer | Separate identity and ballot ingress/credentials/logs, measure timing and result granularity | No global-observer anonymity or coercion-resistance claim |

MACI's published [v3 overview](https://maci.pse.dev/docs/introduction/) states strong privacy and correctness properties under its model. This project must narrow every claim to its actual issuer, coordinator, transport, artifact and chain assumptions. Neither registration nor ZK tally proves honest eligibility issuance. Existing MVP 2.5 account-linked ballots remain public and cannot be made private retroactively.

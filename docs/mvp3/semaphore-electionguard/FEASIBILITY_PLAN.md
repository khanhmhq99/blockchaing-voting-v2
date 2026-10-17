# Pre-migration feasibility plan

This is an isolated investigation. The current MACI v3 application, Supabase data/schema, contracts, routes and deployment evidence remain untouched. No mainnet or BSC transaction is authorized.

## Scope and order

1. **F0:** Pin tags/commits, exact package licenses, transitive graph, advisories, native binary obligations and ElectionGuard specification version. Record unresolved legal issues as blockers.
2. **F1:** Run a synthetic three-voter, three-candidate ElectionGuard election with genuine three-guardian ceremony, 2-of-3 tally decryption, publication and independent verification. Probe bad ballots, shares, aggregation and final totals. Keep guardians in separate processes before claiming trustee separation.
3. **F2:** Generate three Semaphore proofs, bind each signal to the precise ElectionGuard public ballot bytes and election parameters, and probe tampering, non-membership, scope and duplicate nullifiers.
4. **F3:** Deploy official Semaphore verifier/group contracts on local Hardhat, enforce binding/uniqueness in a separate registry, measure deployment/submission gas and inspect code/calldata. Research ElectionGuard proof equations against EVM precompiles without claiming unsupported gas.
5. **F4:** Use BSC Testnet read-only RPC and `eth_estimateGas`; compare to transaction/code limits and assess Next.js, NestJS, relayer and Supabase impact. Publish a decision matrix.

Affected tracked files are confined to this documentation and `research/mvp3/semaphore-electionguard/`. Runtime packages, Python tools, official clones, public sample records and compiler output are isolated and ignored. The [current progress](PROGRESS.md) records completed experiments and failures. Existing MACI benchmark measurements remain the comparison baseline; no new product suite or managed migration is planned.

## Security and measurement criteria

Every gate needs exact source revision, command, exit status, observed output, adversary, enforcement location and limitation. One-person-one-vote requires issuer-side uniqueness **and** atomic on-chain nullifier uniqueness. Anonymous membership alone does not imply ballot validity. A hash on-chain provides audit binding only if exact public bytes are retrievable. A single-machine 2-of-3 simulation does not prove independent trustees.

For local measurements record compiler and EVM hardfork, transaction gas, bytecode and calldata sizes. BSC read-only `eth_estimateGas` values are estimates, not observations. Do not extrapolate nonexistent ElectionGuard Solidity verification costs. The migration gate requires a complete verifier for the chosen ElectionGuard specification and a defensible rule for invalid ciphertexts consuming a nullifier.

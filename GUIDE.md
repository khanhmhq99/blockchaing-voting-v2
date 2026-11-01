$env:Path = "$(Resolve-Path .\.tools\node-v24.21.0-win-x64);$env:Path"
node --version
npm.cmd --version
# Run the following three commands in separate terminals. Keep all three running.
# .env now selects Hardhat Local 31337. The wrapper also supplies the existing
# synthetic local signers and coordinator key required by the MACI deployment.
# A restarted in-memory chain needs a new election deployment; old addresses stay historical.

# Terminal 1: local chain
npm.cmd run chain

# Terminal 2: API
node scripts/maci-local-env.mjs -- npm.cmd run dev:api

# Terminal 3: web
node scripts/maci-local-env.mjs -- npm.cmd run dev:web

# Terminal 4: isolated proof worker (requires the new proof-job migration)
node scripts/maci-local-env.mjs -- npm.cmd run proof:worker

# Optional in the local synthetic environment only: set
# MACI_PROOF_LOCAL_AUTOMINE=true in Terminal 4 so idle Hardhat advances blocks
# after the scheduled end. Keep it false if another process mines blocks.
# The worker waits for CHAIN_CONFIRMATIONS after both closure and the proof
# snapshot. It stages the four public evidence files, runs the existing audit
# verifier, and waits for an authenticated Admin to approve publication.

maci_synthetic_admin

Get-Content .\research\mvp3\maci\probe-output\local-integration\admin-password.txt

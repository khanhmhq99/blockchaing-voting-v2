// Hardhat advances the next block when a transaction is mined, but its latest
// block can retain an older timestamp while no transactions are submitted.
export function effectiveLocalElectionTime(latestBlockTimestamp: bigint, wallTimestamp: bigint): bigint {
  return latestBlockTimestamp > wallTimestamp ? latestBlockTimestamp : wallTimestamp;
}

export function timedElectionStatus(now: bigint, startTimestamp: string, endTimestamp: string): 'REGISTRATION' | 'OPEN' | 'CLOSED' {
  return now > BigInt(endTimestamp) ? 'CLOSED' : now >= BigInt(startTimestamp) ? 'OPEN' : 'REGISTRATION';
}

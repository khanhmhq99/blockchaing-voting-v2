export function transactionExplorerUrl(chainId: string, hash: string): string | null {
  return chainId === '97' && /^0x[0-9a-fA-F]{64}$/.test(hash)
    ? `https://testnet.bscscan.com/tx/${hash}` : null;
}

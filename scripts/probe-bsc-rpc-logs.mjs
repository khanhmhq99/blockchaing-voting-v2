// Read-only comparison of BSC Testnet RPC log support for one known block.
const urls = [
  'https://bsc-testnet-dataseed.bnbchain.org',
  'https://bsc-testnet.bnbchain.org',
  'https://bsc-prebsc-dataseed.bnbchain.org',
  'https://bsc-testnet-rpc.publicnode.com',
];
const block = '0x86106ad'; // Confirmed factory-clone deployment block.
const factory = '0xcd875768bDDa345B8596179e5317798372f69022';
async function rpc(url, method, params) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: globalThis.AbortSignal.timeout(12_000) });
  const body = await response.json();
  return { status: response.status, result: body.result, errorCode: body.error?.code ?? null };
}
for (const url of urls) {
  try {
    const chain = await rpc(url, 'eth_chainId', []);
    const genesis = await rpc(url, 'eth_getBlockByNumber', ['0x0', false]);
    const logs = await rpc(url, 'eth_getLogs', [{ fromBlock: block, toBlock: block, address: factory }]);
    process.stdout.write(`${JSON.stringify({ host: new URL(url).hostname, chainId: chain.result,
      genesisHash: genesis.result?.hash ?? null, httpStatus: logs.status,
      errorCode: logs.errorCode, logCount: logs.result?.length ?? null })}\n`);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ host: new URL(url).hostname, error: error instanceof Error ? error.name : 'unknown' })}\n`);
  }
}

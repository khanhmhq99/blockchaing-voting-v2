import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { createPublicClient, createWalletClient, http, type Address, type Hex } from 'viem';
import { votingAbi } from '../../packages/contracts/src/abi.js';

export async function localChain(port = 18545) {
  const url = `http://127.0.0.1:${port}`;
  // Suppress Hardhat's public development key listing; never pipe it to logs.
  const child = spawn(process.execPath, ['node_modules/hardhat/dist/src/cli.js', 'node', '--hostname', '127.0.0.1', '--port', String(port)], { stdio: 'ignore', windowsHide: true });
  const client = createPublicClient({ transport: http(url, { retryCount: 0 }), pollingInterval: 20 });
  try {
    for (let attempt = 0; ; attempt++) {
      try { if (await client.getChainId() === 31337) break; } catch { /* Wait for local RPC. */ }
      if (attempt > 100 || child.exitCode !== null) throw new Error('Local chain startup failed');
      await delay(100);
    }
    const wallet = createWalletClient({ transport: http(url), pollingInterval: 20 });
    const accounts = await wallet.getAddresses();
    const admin = accounts[0]!;
    const artifact = JSON.parse(readFileSync('packages/contracts/generated/BasicVoting.json', 'utf8')) as { bytecode: Hex };
    const hash = await wallet.deployContract({ account: admin, chain: null, abi: votingAbi, bytecode: artifact.bytecode });
    const receipt = await client.waitForTransactionReceipt({ hash });
    const address = receipt.contractAddress!;
    const rpc = async (method: string, params: unknown[] = []) => {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
      const result = await response.json() as { result?: unknown; error?: unknown };
      if (result.error) throw new Error('Local RPC operation failed');
      return result.result;
    };
    async function write(functionName: string, args: readonly unknown[], account: Address = admin) {
      const hash = await wallet.writeContract({ account, chain: null, address, abi: votingAbi, functionName, args } as Parameters<typeof wallet.writeContract>[0]);
      return client.waitForTransactionReceipt({ hash });
    }
    async function time(timestamp: bigint) { await rpc('evm_setNextBlockTimestamp', [Number(timestamp)]); await rpc('evm_mine'); }
    return { url, client, wallet, accounts, admin, address, deploymentBlock: receipt.blockNumber, rpc, write, time, stop: () => { child.kill(); } };
  } catch (error) { child.kill(); throw error; }
}
export type LocalChain = Awaited<ReturnType<typeof localChain>>;

import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { gaslessAbi } from '../../packages/contracts/src/gasless-abi.js';
import { payloadHash } from '../../packages/shared-types/src/index.js';

test('zero-balance wallets sign only; pending survives reload; sponsor pays for two accepted votes', async ({ page }) => {
  const fixture = JSON.parse(readFileSync('.tools/e2e-context.json', 'utf8')) as { accounts: Address[]; address: Address; rpc: string; relayer: Address };
  const client = createPublicClient({ transport: http(fixture.rpc), pollingInterval: 20 });
  const wallet = createWalletClient({ transport: http(fixture.rpc) });
  const rpc = async (method: string, params: unknown[] = []) => {
    const response = await fetch(fixture.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const result = await response.json() as { result: unknown; error?: unknown }; if (result.error) throw new Error('Test RPC failed'); return result.result;
  };
  const write = async (functionName: string, args: readonly unknown[]) => {
    const hash = await wallet.writeContract({ account: fixture.accounts[0]!, chain: null, address: fixture.address, abi: gaslessAbi, functionName, args } as Parameters<typeof wallet.writeContract>[0]);
    return client.waitForTransactionReceipt({ hash });
  };
  const manifest = { title: 'Browser election', description: 'Synthetic browser workflow', candidates: [{ name: 'Candidate A', biography: '' }, { name: 'Candidate B', biography: '' }] };
  const snapshot = await rpc('evm_snapshot');
  // First fixture election is created by the administrator at server start.
  await write('registerCandidates', [1n, manifest.candidates.map(payloadHash)]);
  await write('setEligibility', [1n, [fixture.accounts[5], fixture.accounts[6]], true]);
  await write('freeze', [1n]);
  const election = await client.readContract({ address: fixture.address, abi: gaslessAbi, functionName: 'getElection', args: [1n] });
  await rpc('evm_setNextBlockTimestamp', [Number(election.startTime)]); await rpc('evm_mine');
  for (const address of fixture.accounts.slice(5, 7)) await rpc('hardhat_setBalance', [address, '0x0']);
  const sponsorBefore = await client.getBalance({ address: fixture.relayer });
  let transactionRequests = 0; let signatureRequests = 0;
  await page.exposeFunction('gaslessRpc', async (method: string, params: unknown[]) => {
    if (method === 'eth_sendTransaction') { transactionRequests++; throw new Error('Voter must not send a transaction'); }
    if (method === 'eth_signTypedData_v4') signatureRequests++;
    return rpc(method, params);
  });
  await page.addInitScript(({ accounts }) => {
    const state = window as unknown as { ethereum: unknown; rejectSignature: boolean; gaslessRpc(method: string, params: unknown[]): Promise<unknown>; setGaslessAccount(i: number): void };
    let account = accounts[5]!;
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    state.ethereum = {
      request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account];
        if (method === 'eth_signTypedData_v4' && state.rejectSignature) { state.rejectSignature = false; throw Object.assign(new Error('User rejected signature'), { code: 4001 }); }
        return state.gaslessRpc(method, params);
      },
      on: (event: string, fn: (...args: unknown[]) => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(fn); },
      removeListener: (event: string, fn: (...args: unknown[]) => void) => listeners.get(event)?.delete(fn),
    };
    state.setGaslessAccount = i => { account = accounts[i]!; listeners.get('accountsChanged')?.forEach(fn => fn([account])); };
  }, { accounts: fixture.accounts });
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.goto('/');
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await page.getByRole('button', { name: /Browser election/ }).click();
  const panel = page.getByRole('region', { name: 'Gasless Voting' });
  await page.evaluate(() => { (window as unknown as { rejectSignature: boolean }).rejectSignature = true; });
  await panel.getByRole('button', { name: 'Xác nhận bỏ phiếu', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText(/reject/i);
  expect(await client.readContract({ address: fixture.address, abi: gaslessAbi, functionName: 'hasVoted', args: [1n, fixture.accounts[5]!] })).toBe(false);
  // Explicit simulated API outage checks UI failure recovery; accepted flows below use real NestJS.
  await page.route('**/v1/gasless/votes', route => route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: { code: 'RELAYER_BALANCE_LOW' } }) }), { times: 1 });
  await panel.getByRole('button', { name: 'Xác nhận bỏ phiếu', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('RELAYER_BALANCE_LOW');
  await expect(panel.getByRole('button', { name: 'Xác nhận bỏ phiếu', exact: true })).toBeEnabled();
  await rpc('evm_setAutomine', [false]);
  await panel.getByRole('button', { name: 'Xác nhận bỏ phiếu', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Đang chờ blockchain');
  await expect(panel.getByRole('button', { name: 'Xác nhận bỏ phiếu', exact: true })).toBeDisabled();
  await page.reload();
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await page.getByRole('button', { name: /Browser election/ }).click();
  await expect(panel.getByRole('status')).toContainText('Đang chờ blockchain');
  await rpc('evm_mine'); await rpc('evm_setAutomine', [true]);
  await expect(panel.getByRole('status')).toContainText('Bỏ phiếu thành công');
  await page.evaluate(() => (window as unknown as { setGaslessAccount(i: number): void }).setGaslessAccount(6));
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await page.getByRole('button', { name: /Browser election/ }).click();
  await page.getByRole('radio').nth(1).check();
  await panel.getByRole('button', { name: 'Xác nhận bỏ phiếu', exact: true }).click();
  await expect(panel.getByRole('status')).toContainText('Bỏ phiếu thành công');
  await expect(page.getByText('Tham gia: 2/2 cử tri được cấp quyền', { exact: true })).toBeVisible();
  expect(transactionRequests).toBe(0); expect(signatureRequests).toBe(3);
  const events = await client.getContractEvents({ address: fixture.address, abi: gaslessAbi, eventName: 'VoteCast', args: { electionId: 1n }, fromBlock: 0n });
  expect(events).toHaveLength(2);
  let fees = 0n;
  for (const event of events) { const receipt = await client.getTransactionReceipt({ hash: event.transactionHash }); expect(receipt.from.toLowerCase()).toBe(fixture.relayer.toLowerCase()); fees += receipt.gasUsed * receipt.effectiveGasPrice; }
  expect(sponsorBefore - await client.getBalance({ address: fixture.relayer })).toBe(fees);
  for (const address of fixture.accounts.slice(5, 7)) expect(await client.getBalance({ address })).toBe(0n);
  await page.screenshot({ path: 'test-results/gasless-receipt.png', fullPage: true });
  await rpc('evm_revert', [snapshot]);
});

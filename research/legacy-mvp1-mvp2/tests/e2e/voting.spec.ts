import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { createPublicClient, createWalletClient, http, type Address } from 'viem';
import { votingAbi } from '../../packages/contracts/src/abi.js';

test('wrong network and wallet rejection are visible without submitting a vote', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as unknown as { ethereum: unknown; rejectWallet: boolean };
    state.rejectWallet = false;
    state.ethereum = {
      on: () => undefined, removeListener: () => undefined,
      request: async ({ method }: { method: string }) => {
        if (state.rejectWallet) throw Object.assign(new Error('User rejected the request'), { code: 4001 });
        if (method === 'eth_chainId') return '0x1';
        throw new Error('No transaction is allowed in this negative fixture');
      },
    };
  });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Sẵn sàng');
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await expect(page.getByRole('status')).toContainText('Chọn mạng có chain ID 31337');
  await page.evaluate(() => { (window as unknown as { rejectWallet: boolean }).rejectWallet = true; });
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await expect(page.getByRole('status')).toContainText(/reject/i);
});

test('admin creates and authorizes; two wallets vote; duplicate is disabled; results close', async ({ page }) => {
  const fixture = JSON.parse(readFileSync('.tools/e2e-context.json', 'utf8')) as { accounts: Address[]; address: Address; rpc: string };
  // Browser provider transport double, backed by actual Hardhat transactions.
  // This does not assert that the MetaMask extension itself was tested.
  await page.exposeFunction('testRpc', async (method: string, params: unknown[]) => {
    if (method === 'eth_getTransactionReceipt') await new Promise(resolve => setTimeout(resolve, 300));
    const response = await fetch(fixture.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    const result = await response.json() as { result: unknown; error?: { message: string } };
    if (result.error) throw new Error(result.error.message);
    return result.result;
  });
  await page.addInitScript(({ accounts }) => {
    const state = window as unknown as { ethereum: unknown; rejectNextTransaction: boolean; testRpc(method: string, params: unknown[]): Promise<unknown>; setTestAccount(index: number): void };
    let account = accounts[0]!;
    const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
    state.ethereum = {
      request: async ({ method, params = [] }: { method: string; params?: unknown[] }) => {
        if (method === 'eth_sendTransaction' && state.rejectNextTransaction) { state.rejectNextTransaction = false; throw Object.assign(new Error('User rejected the transaction'), { code: 4001 }); }
        if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [account];
        if (method === 'personal_sign') return state.testRpc('eth_sign', [params[1], params[0]]);
        return state.testRpc(method, params);
      },
      on: (event: string, handler: (...args: unknown[]) => void) => { if (!listeners.has(event)) listeners.set(event, new Set()); listeners.get(event)!.add(handler); },
      removeListener: (event: string, handler: (...args: unknown[]) => void) => { listeners.get(event)?.delete(handler); },
    };
    state.setTestAccount = (index: number) => { account = accounts[index]!; listeners.get('accountsChanged')?.forEach(handler => handler([account])); };
  }, { accounts: fixture.accounts });
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('Sẵn sàng', { timeout: 60000 });
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await page.getByRole('button', { name: 'Quản trị bầu cử', exact: true }).click();
  await page.getByLabel('Tiêu đề', { exact: true }).fill('Browser election');
  await page.getByLabel('Mô tả', { exact: true }).fill('Synthetic browser workflow');
  await page.getByLabel('Ứng viên (mỗi dòng một tên)').fill('Candidate A\nCandidate B');
  const startDate = new Date(Date.now() + 3600000);
  const endDate = new Date(Date.now() + 7200000);
  const localInput = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  await page.getByLabel('Bắt đầu', { exact: true }).fill(localInput(startDate));
  await page.getByLabel('Kết thúc', { exact: true }).fill(localInput(endDate));
  await page.getByRole('button', { name: 'Tạo cuộc bầu cử' }).click();
  await expect(page.getByRole('status')).toContainText('Đã lưu metadata', { timeout: 60000 });
  await page.getByLabel('Ví cử tri giả lập (mỗi dòng một địa chỉ)').fill(fixture.accounts.slice(1, 3).join('\n'));
  await page.getByRole('button', { name: 'Cấp quyền', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Khóa cấu hình' })).toBeEnabled();
  await page.getByRole('button', { name: 'Khóa cấu hình' }).click();
  await expect(page.getByRole('button', { name: 'Khóa cấu hình' })).toBeEnabled();
  const client = createPublicClient({ transport: http(fixture.rpc) });
  const election = await client.readContract({ address: fixture.address, abi: votingAbi, functionName: 'getElection', args: [2n] });
  async function mine(timestamp: bigint) {
    for (const [method, params] of [['evm_setNextBlockTimestamp', [Number(timestamp)]], ['evm_mine', []]] as const) {
      await fetch(fixture.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
    }
  }
  await mine(election.startTime);
  await page.getByRole('button', { name: 'Bỏ phiếu & kết quả' }).click();
  for (const index of [1, 2]) {
    await page.evaluate(i => (window as unknown as { setTestAccount(i: number): void }).setTestAccount(i), index);
    await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
    await page.getByRole('button', { name: /Browser election/ }).click();
    await page.getByLabel('Chế độ bỏ phiếu').selectOption('direct');
    await page.getByRole('radio').nth(index - 1).check();
    if (index === 1) {
      await page.evaluate(() => { (window as unknown as { rejectNextTransaction: boolean }).rejectNextTransaction = true; });
      await page.getByRole('button', { name: 'Xác nhận & gửi phiếu' }).click();
      await expect(page.getByRole('status')).toContainText(/reject/i);
      expect(await client.readContract({ address: fixture.address, abi: votingAbi, functionName: 'hasVoted', args: [2n, fixture.accounts[1]!] })).toBe(false);
    }
    await page.getByRole('button', { name: 'Xác nhận & gửi phiếu' }).click();
    await expect(page.getByRole('status')).toContainText('Đã gửi');
    await expect(page.getByText('Đã bỏ phiếu', { exact: false })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Xác nhận & gửi phiếu' })).toBeDisabled();
  }
  expect(await client.readContract({ address: fixture.address, abi: votingAbi, functionName: 'candidateVotes', args: [2n, 0] })).toBe(1n);
  expect(await client.readContract({ address: fixture.address, abi: votingAbi, functionName: 'candidateVotes', args: [2n, 1] })).toBe(1n);
  const duplicateWallet = createWalletClient({ transport: http(fixture.rpc) });
  await expect(duplicateWallet.writeContract({ account: fixture.accounts[1]!, chain: null, address: fixture.address, abi: votingAbi, functionName: 'vote', args: [2n, 0] })).rejects.toThrow();
  await mine(election.endTime);
  await page.evaluate(() => (window as unknown as { setTestAccount(i: number): void }).setTestAccount(0));
  await page.getByRole('button', { name: 'Kết nối MetaMask' }).click();
  await page.getByRole('button', { name: 'Quản trị bầu cử', exact: true }).click();
  await page.getByRole('button', { name: 'Chốt kết quả sau khi đóng' }).click();
  await expect(page.getByRole('button', { name: 'Chốt kết quả sau khi đóng' })).toBeEnabled();
  expect((await client.readContract({ address: fixture.address, abi: votingAbi, functionName: 'getElection', args: [2n] })).finalized).toBe(true);
  await page.getByRole('button', { name: 'Đồng bộ sự kiện blockchain' }).click();
  await expect(page.getByRole('status')).toContainText('Đã đồng bộ');
  const indexed = await (await fetch('http://127.0.0.1:3101/v1/transactions')).json() as { operation: string }[];
  expect(indexed.filter(row => row.operation === 'VoteCast')).toHaveLength(2);
  await page.screenshot({ path: 'test-results/admin-workflow.png', fullPage: true });
});

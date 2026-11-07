// Loopback-only browser smoke check of the already-built chain-97 static web.
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const origin = 'http://localhost:3000';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.name));
  const rows = [];
  for (const route of ['/maci.html', '/admin/maci.html', '/verify.html']) {
    const response = await page.goto(origin + route, { waitUntil: 'load', timeout: 30_000 });
    if (!response || response.status() !== 200) throw new Error(`Built web route failed: ${route}`);
    await page.waitForTimeout(1000);
    const sourceLinks = await page.locator('a[href*="91dcfb11c0528afb67a409a720fb3f4eba30bb21"]').count();
    rows.push({ route, status: response.status(), sourceLinks,
      anchorCount: await page.locator('a').count(), bodyPreview: (await page.locator('body').innerText()).slice(0, 160) });
  }
  await page.goto(origin + '/verify?election=c3a7fd99-233e-4c06-a4c1-e3ae3c2dd576', { waitUntil: 'load' });
  await page.getByText('onchain-pre-election-hash-v1').waitFor({ timeout: 20_000 });
  const publicRows = await page.locator('table tbody tr').allInnerTexts();
  if (publicRows.length !== 3 || !publicRows[0].includes('Option Alpha') ||
      !publicRows[1].includes('Option Beta') || !publicRows[2].includes('Option Gamma') ||
      !publicRows[0].includes('1') || !publicRows[1].includes('1') || !publicRows[2].includes('0')) {
    throw new Error('Published browser tally does not match the three synthetic options');
  }
  rows.push({ route: '/verify?election=<synthetic-id>', publicAggregateRows: publicRows.length,
    candidateBinding: 'onchain-pre-election-hash-v1' });
  await page.goto(origin + '/login.html', { waitUntil: 'load' });
  const password = fs.readFileSync(path.resolve('research/mvp3/maci/probe-output/bsc-integration/admin-password.txt'), 'utf8');
  await page.getByLabel('Tên đăng nhập').fill('maci_bsc_synthetic_admin');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.waitForURL(url => url.pathname.startsWith('/admin'), { timeout: 20_000 });
  await page.goto(origin + '/admin/elections', { waitUntil: 'load' });
  await page.getByText('Synthetic MACI BSC Testnet research election e2e-2').first().waitFor({ timeout: 20_000 });
  rows.push({ route: '/admin/elections', authenticated: true, syntheticElectionVisible: true });
  const voter = JSON.parse(fs.readFileSync(path.resolve(
    'research/mvp3/maci/probe-output/bsc-integration/c3a7fd99-233e-4c06-a4c1-e3ae3c2dd576/synthetic-voters.json'), 'utf8'))[0];
  const voterPage = await browser.newPage();
  voterPage.on('pageerror', error => errors.push(error.name));
  await voterPage.goto(origin + '/login.html', { waitUntil: 'load' });
  await voterPage.getByLabel('Tên đăng nhập').fill(voter.username);
  await voterPage.getByLabel('Mật khẩu', { exact: true }).fill(voter.password);
  await voterPage.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await voterPage.waitForURL(url => url.pathname.startsWith('/user'), { timeout: 20_000 });
  await voterPage.goto(origin + '/user/elections', { waitUntil: 'load' });
  await voterPage.getByText('Synthetic MACI BSC Testnet research election e2e-2').first().waitFor({ timeout: 20_000 });
  rows.push({ route: '/user/elections', authenticated: true, syntheticElectionVisible: true });
  if (errors.length) throw new Error(`Browser page errors: ${errors.join(',')}`);
  process.stdout.write(JSON.stringify({ browser: 'chromium', origin, rows, pageErrors: errors.length }) + '\n');
} finally {
  await browser.close();
}

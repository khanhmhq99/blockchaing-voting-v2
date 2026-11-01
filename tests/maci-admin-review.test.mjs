import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';

const output = join(process.cwd(), 'apps/voter-web/out');
const electionId = '11111111-1111-4111-8111-111111111111';
const requestId = '22222222-2222-4222-8222-222222222222';
let server;
let browser;
let page;
let origin;

before(async () => {
  server = createServer(async (request, response) => {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    const file = pathname === '/admin/elections/participants' ? 'admin/elections/participants.html' : pathname.slice(1);
    if (file.includes('..')) { response.writeHead(400).end(); return; }
    try {
      const data = await readFile(join(output, file));
      response.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream');
      response.end(data);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
});

after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

test('successful approval remains successful when the follow-up request list refresh fails', async () => {
  let approved = false;
  let postCount = 0;
  await page.route('http://localhost:3001/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    let body;
    let status = 200;
    if (path === '/v1/auth/me') body = { id: 'admin', username: 'admin', fullName: 'Admin', role: 'ADMIN' };
    else if (path === '/v1/maci/elections') body = [{ id: electionId, title: 'Synthetic poll', candidates: ['A', 'B'], chainId: '31337', maciAddress: '0x1111111111111111111111111111111111111111', pollAddress: '0x2222222222222222222222222222222222222222', pollId: '0', deploymentBlock: '1', status: 'REGISTRATION', chainHealth: 'AVAILABLE', startTimestamp: String(Math.floor(Date.now() / 1000) + 600), endTimestamp: String(Math.floor(Date.now() / 1000) + 1200) }];
    else if (path === '/v1/maci/admin/deployments') body = [];
    else if (path.endsWith(`/requests/${requestId}/approve`) && request.method() === 'POST') { approved = true; postCount += 1; body = { id: requestId, status: 'APPROVED', reviewedAt: new Date().toISOString() }; }
    else if (path.endsWith('/requests')) {
      if (approved) { status = 503; body = { error: { code: 'DEPENDENCY_UNAVAILABLE', message: 'Temporary read failure' } }; }
      else body = [{ id: requestId, status: 'PENDING', requestedAt: new Date().toISOString(), reviewedAt: null, user: { username: 'synthetic_voter' } }];
    } else { status = 404; body = { error: { code: 'NOT_FOUND', message: 'Not found' } }; }
    await route.fulfill({ status, headers, body: JSON.stringify(body) });
  });
  await page.goto(`${origin}/admin/elections/participants?id=${electionId}`);
  const approve = page.getByRole('button', { name: 'Phê duyệt', exact: true });
  await approve.waitFor();
  assert.equal(await approve.isEnabled(), true);
  await approve.click();
  await page.getByRole('dialog', { name: 'Xác nhận phê duyệt' }).waitFor({ state: 'visible' });
  assert.equal(postCount, 0);
  await page.getByRole('button', { name: 'Hủy' }).click();
  assert.equal(await page.getByRole('dialog').count(), 0);
  assert.equal(postCount, 0);
  await approve.click();
  await page.getByRole('dialog', { name: 'Xác nhận phê duyệt' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: 'Xác nhận phê duyệt' }).click();
  await page.getByText('Đã phê duyệt yêu cầu tham gia.', { exact: false }).first().waitFor();
  assert.equal(postCount, 1);
  assert.equal(await page.getByText('Đã phê duyệt', { exact: true }).count() > 0, true);
});

test('clicking approval explains a mismatched chain instead of doing nothing', async () => {
  await page.unrouteAll();
  let postCount = 0;
  await page.route('http://localhost:3001/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    let body;
    if (path === '/v1/auth/me') body = { id: 'admin', username: 'admin', fullName: 'Admin', role: 'ADMIN' };
    else if (path === '/v1/config') body = { chainId: 97 };
    else if (path === '/v1/maci/elections') body = [{ id: electionId, title: 'Synthetic poll', candidates: ['A', 'B'], chainId: '31337', maciAddress: '0x1111111111111111111111111111111111111111', pollAddress: '0x2222222222222222222222222222222222222222', pollId: '0', deploymentBlock: '1', status: 'REGISTRATION', chainHealth: 'INVALID_OR_UNAVAILABLE', startTimestamp: String(Math.floor(Date.now() / 1000) + 600), endTimestamp: String(Math.floor(Date.now() / 1000) + 1200) }];
    else if (path === '/v1/maci/admin/deployments') body = [];
    else if (path.endsWith('/requests') && request.method() === 'GET') body = [{ id: requestId, status: 'PENDING', requestedAt: new Date().toISOString(), reviewedAt: null, user: { username: 'synthetic_voter' } }];
    else if (request.method() === 'POST') { postCount += 1; body = {}; }
    else body = {};
    await route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });
  await page.goto(`${origin}/admin/elections/participants?id=${electionId}`);
  const approve = page.getByRole('button', { name: 'Phê duyệt', exact: true });
  await approve.waitFor();
  assert.equal(await approve.isEnabled(), true);
  await approve.click();
  await page.getByText(/API đang kết nối chain 97, nhưng cuộc bỏ phiếu thuộc chain 31337/).first().waitFor();
  assert.equal(postCount, 0);
  assert.equal(await page.getByRole('dialog').count(), 0);
});

test('chain 97 election records cannot open the approval dialog', async () => {
  await page.unrouteAll();
  let postCount = 0;
  await page.route('http://localhost:3001/v1/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const headers = { 'access-control-allow-origin': origin, 'access-control-allow-credentials': 'true', 'access-control-allow-headers': 'content-type', 'content-type': 'application/json' };
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers }); return; }
    if (request.method() === 'POST') postCount += 1;
    const body = path === '/v1/auth/me' ? { id: 'admin', username: 'admin', fullName: 'Admin', role: 'ADMIN' }
      : path === '/v1/maci/elections' ? [{ id: electionId, title: 'Historical poll', candidates: ['A', 'B'], chainId: '97', maciAddress: '0x1111111111111111111111111111111111111111', pollAddress: '0x2222222222222222222222222222222222222222', pollId: '0', deploymentBlock: '1', status: 'REGISTRATION', chainHealth: 'AVAILABLE', startTimestamp: String(Math.floor(Date.now() / 1000) + 600), endTimestamp: String(Math.floor(Date.now() / 1000) + 1200) }]
        : path.endsWith('/requests') ? [{ id: requestId, status: 'PENDING', requestedAt: new Date().toISOString(), reviewedAt: null, user: { username: 'synthetic_voter' } }] : [];
    await route.fulfill({ status: 200, headers, body: JSON.stringify(body) });
  });
  await page.goto(`${origin}/admin/elections/participants?id=${electionId}`);
  const approve = page.getByRole('button', { name: 'Phê duyệt', exact: true });
  await approve.waitFor();
  await approve.click();
  await page.getByText(/chỉ Hardhat Local 31337 được phép thao tác/).first().waitFor();
  assert.equal(postCount, 0);
  assert.equal(await page.getByRole('dialog').count(), 0);
});

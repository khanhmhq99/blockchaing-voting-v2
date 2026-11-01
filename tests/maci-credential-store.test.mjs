import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium } from '@playwright/test';
import ts from 'typescript';

let server;
let browser;
let page;

before(async () => {
  server = createServer((_request, response) => { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Credential store test</title>'); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ headless: true });
  page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const source = await readFile(new URL('../apps/voter-web/app/maci-credential-store.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  await page.addScriptTag({ type: 'module', content: `${js}\nwindow.credentialStoreTest = { addLocalCredential, readLocalCredential };` });
  await page.waitForFunction(() => !!window.credentialStoreTest);
});

after(async () => { await browser?.close(); await new Promise(resolve => server?.close(resolve)); });

test('IndexedDB rejects concurrent overwrite and isolates account, election and deployment', async () => {
  const result = await page.evaluate(async () => {
    const store = window.credentialStoreTest;
    const context = { userId: 'user-a', electionId: 'election-a', chainId: '31337', maciAddress: '0x1111111111111111111111111111111111111111' };
    const make = (digit) => ({ version: 1, context, secret: `macisk.${digit.repeat(64)}`, publicKeyX: digit, publicKeyY: digit });
    const writes = await Promise.allSettled([store.addLocalCredential(make('1')), store.addLocalCredential(make('2'))]);
    const saved = await store.readLocalCredential(context);
    const otherUser = await store.readLocalCredential({ ...context, userId: 'user-b' });
    const otherElection = await store.readLocalCredential({ ...context, electionId: 'election-b' });
    const otherDeployment = await store.readLocalCredential({ ...context, maciAddress: '0x2222222222222222222222222222222222222222' });
    return { statuses: writes.map(write => write.status), secret: saved?.secret, otherUser, otherElection, otherDeployment };
  });
  assert.deepEqual(result.statuses.sort(), ['fulfilled', 'rejected']);
  assert.match(result.secret, /^macisk\.[12]{64}$/);
  assert.equal(result.otherUser, null);
  assert.equal(result.otherElection, null);
  assert.equal(result.otherDeployment, null);
});

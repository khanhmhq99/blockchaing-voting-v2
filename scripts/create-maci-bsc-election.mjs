// Create or resume one synthetic election through the authenticated BSC API.
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

if (process.env.CHAIN_ID !== '97' || process.env.MACI_BSC_TESTNET_ENABLED !== 'true') throw new Error('BSC election creation requires the authorized chain-97 gate');
const directory = path.resolve('research/mvp3/maci/probe-output/bsc-integration');
const password = fs.readFileSync(path.join(directory, 'admin-password.txt'), 'utf8');
const experiment = process.argv[2] ?? 'initial';
if (!/^[a-z0-9-]{1,32}$/.test(experiment)) throw new Error('Invalid synthetic experiment label');
const intentFile = path.join(directory, `election-intent-${experiment}.json`);
const legacyIntentFile = path.join(directory, 'election-intent.json');
const selectedIntentFile = experiment === 'initial' && fs.existsSync(legacyIntentFile) ? legacyIntentFile : intentFile;
let intent;
if (fs.existsSync(selectedIntentFile)) intent = JSON.parse(fs.readFileSync(selectedIntentFile, 'utf8'));
else {
  const now = Math.floor(Date.now() / 1000);
  intent = { idempotencyKey: randomUUID(), body: {
    title: `Synthetic MACI BSC Testnet research election ${experiment}`,
    candidates: ['Option Alpha', 'Option Beta', 'Option Gamma'],
    startTimestamp: now + 1800, endTimestamp: now + 3600,
  } };
  fs.writeFileSync(selectedIntentFile, `${JSON.stringify(intent, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
const origin = `http://127.0.0.1:${Number(process.env.API_PORT ?? 3001)}`;
const login = await fetch(`${origin}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'maci_bsc_synthetic_admin', password }) });
if (!login.ok) throw new Error(`Synthetic BSC admin login failed with HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie?.startsWith('hcmut_voting_session=')) throw new Error('Admin session cookie missing');
const response = await fetch(`${origin}/v1/maci/admin/elections`, { method: 'POST', headers: {
  cookie, 'content-type': 'application/json', 'idempotency-key': intent.idempotencyKey,
}, body: JSON.stringify(intent.body) });
const body = await response.json();
if (!response.ok || !/^[0-9a-f-]{36}$/i.test(body.id ?? '')) throw new Error(`Election create failed with HTTP ${response.status}: ${body.code ?? 'unknown'}`);
fs.writeFileSync(path.join(directory, `election-job-${experiment}.json`), `${JSON.stringify({ id: body.id, status: body.status,
  startTimestamp: intent.body.startTimestamp, endTimestamp: intent.body.endTimestamp }, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ id: body.id, status: body.status, stage: body.stage, diagnosticCode: body.diagnosticCode ?? null,
  startTimestamp: intent.body.startTimestamp, endTimestamp: intent.body.endTimestamp })}\n`);

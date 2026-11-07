// Approve an already verified proof job and fetch the public audit dataset via API.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const id = process.argv[2];
if (process.env.CHAIN_ID !== '97' || process.env.MACI_BSC_TESTNET_ENABLED !== 'true' ||
    !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Authorized BSC election UUID required');
const origin = `http://127.0.0.1:${Number(process.env.API_PORT ?? 3001)}`;
const directory = path.resolve('research/mvp3/maci/probe-output/bsc-integration', id, 'public-audit');
const password = fs.readFileSync(path.resolve('research/mvp3/maci/probe-output/bsc-integration/admin-password.txt'), 'utf8');
const login = await fetch(`${origin}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'maci_bsc_synthetic_admin', password }) });
if (!login.ok) throw new Error(`Admin login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Admin session missing');
const state = await fetch(`${origin}/v1/maci/admin/elections/${id}/proof-job`, { headers: { cookie } });
if (!state.ok) throw new Error(`Proof job status HTTP ${state.status}`);
const { job } = await state.json();
if (job?.status === 'READY') {
  const approval = await fetch(`${origin}/v1/maci/admin/elections/${id}/proof-job/approve`, { method: 'POST', headers: { cookie } });
  if (!approval.ok) {
    const failure = await approval.json().catch(() => ({}));
    throw new Error(`Proof publication HTTP ${approval.status} ${failure.error?.code ?? failure.code ?? 'unknown'}`);
  }
  const result = await approval.json();
  if (result.status !== 'VERIFIED') throw new Error('Audit publication did not verify the election');
} else if (job?.status !== 'PUBLISHED') throw new Error(`Proof job is ${job?.status ?? 'missing'}`);
fs.mkdirSync(directory, { recursive: true });
const hashes = {};
for (const name of ['manifest.json', 'events.ndjson', 'proofs.json', 'tally.json', 'configuration.json']) {
  const route = name === 'configuration.json' ? `configuration.json` : `evidence/${name}`;
  const response = await fetch(`${origin}/v1/maci/elections/${id}/${route}`);
  if (!response.ok) throw new Error(`Public ${name} HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  hashes[name] = createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(path.join(directory, name), bytes, { mode: 0o600 });
}
const config = JSON.parse(fs.readFileSync(path.join(directory, 'configuration.json'), 'utf8'));
const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'manifest.json'), 'utf8'));
if (config.electionId !== id || manifest.chainId !== 97 || config.chainId !== '97') throw new Error('Published audit scope mismatch');
process.stdout.write(JSON.stringify({ electionId: id, status: 'VERIFIED', directory,
  configurationSha256: hashes['configuration.json'], manifestSha256: hashes['manifest.json'],
  tally: manifest.tally, proofTransactions: manifest.proofTransactions, hashes }) + '\n');

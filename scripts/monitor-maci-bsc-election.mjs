// Read-only, authenticated Admin monitor for one chain-97 research election.
import fs from 'node:fs';
import path from 'node:path';

const id = process.argv[2];
if (process.env.CHAIN_ID !== '97' || !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Expected chain 97 and an election UUID');
const origin = `http://127.0.0.1:${Number(process.env.API_PORT ?? 3001)}`;
const password = fs.readFileSync(path.resolve('research/mvp3/maci/probe-output/bsc-integration/admin-password.txt'), 'utf8');
const login = await fetch(`${origin}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'maci_bsc_synthetic_admin', password }) });
if (!login.ok) throw new Error(`Admin login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Admin session missing');
const monitor = await fetch(`${origin}/v1/maci/admin/elections/${id}/monitor`, { headers: { cookie } });
if (!monitor.ok) throw new Error(`Admin monitor HTTP ${monitor.status}`);
const data = await monitor.json();
if (data.election?.chainId !== '97' || data.election?.id !== id) throw new Error('Monitor election mismatch');
const proof = await fetch(`${origin}/v1/maci/admin/elections/${id}/proof-job`, { headers: { cookie } });
const proofJob = proof.status === 200 ? await proof.json() : null;
process.stdout.write(JSON.stringify({ election: data.election, observedAt: data.observedAt,
  counts: data.counts, deployment: data.deployment, processing: data.processing,
  chain: data.chain, currentVerification: data.currentVerification, proofJob }) + '\n');

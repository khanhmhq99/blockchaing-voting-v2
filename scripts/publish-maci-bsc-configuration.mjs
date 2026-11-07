// Publish the pre-election anchored canonical candidate configuration after audit verification.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const id = process.argv[2];
if (process.env.CHAIN_ID !== '97' || !/^[0-9a-f-]{36}$/i.test(id ?? '')) throw new Error('Expected BSC election UUID');
const origin = `http://127.0.0.1:${Number(process.env.API_PORT ?? 3001)}`;
const directory = path.resolve('research/mvp3/maci/probe-output');
const password = fs.readFileSync(path.join(directory, 'bsc-integration/admin-password.txt'), 'utf8');
const configurationJson = fs.readFileSync(path.join(directory, 'deployments', id, 'election-config.json'), 'utf8');
const configurationSha256 = createHash('sha256').update(configurationJson).digest('hex');
const login = await fetch(`${origin}/v1/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: 'maci_bsc_synthetic_admin', password }) });
if (!login.ok) throw new Error(`Admin login HTTP ${login.status}`);
const cookie = login.headers.get('set-cookie')?.split(';')[0];
if (!cookie) throw new Error('Admin session missing');
const response = await fetch(`${origin}/v1/maci/admin/elections/${id}/configuration`, { method: 'POST',
  headers: { cookie, 'content-type': 'application/json' },
  body: JSON.stringify({ configurationJson, configurationSha256 }) });
const result = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`Candidate configuration HTTP ${response.status} ${result.error?.code ?? result.code ?? 'unknown'}`);
process.stdout.write(JSON.stringify({ electionId: id, configurationSha256,
  candidateBinding: result.candidateBinding }) + '\n');

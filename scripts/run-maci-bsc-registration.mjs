// Synthetic voter request, approval, authorization and sponsored registration via API.
import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { Keypair, PrivateKey } from '@maci-protocol/domainobjs';

const electionId = process.argv[2];
if (process.env.CHAIN_ID !== '97' || process.env.MACI_BSC_TESTNET_ENABLED !== 'true' || !/^[0-9a-f-]{36}$/i.test(electionId ?? '')) throw new Error('Authorized BSC election ID required');
const directory = path.resolve('research/mvp3/maci/probe-output/bsc-integration', electionId);
fs.mkdirSync(directory, { recursive: true });
const credentialsFile = path.join(directory, 'synthetic-voters.json');
let voters;
if (fs.existsSync(credentialsFile)) voters = JSON.parse(fs.readFileSync(credentialsFile, 'utf8'));
else {
  voters = [0, 1].map(index => ({ index, username: `maci_bsc_${electionId.slice(0, 8)}_${index}`,
    password: randomBytes(24).toString('base64url'), secret: new Keypair().privateKey.serialize() }));
  fs.writeFileSync(credentialsFile, `${JSON.stringify(voters, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
}
const origin = `http://127.0.0.1:${Number(process.env.API_PORT ?? 3001)}`;
async function request(route, { method = 'GET', cookie, body } = {}) {
  const response = await fetch(`${origin}/v1/${route}`, { method, headers: {
    ...(cookie ? { cookie } : {}), ...(body ? { 'content-type': 'application/json' } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function login(username, password) {
  const result = await request('auth/login', { method: 'POST', body: { username, password } });
  if (result.status !== 201 && result.status !== 200) throw new Error(`Login failed: ${result.status} ${result.data.code ?? 'unknown'}`);
  if (!result.cookie?.startsWith('hcmut_voting_session=')) throw new Error('Session cookie missing');
  return result.cookie;
}
const adminPassword = fs.readFileSync(path.resolve('research/mvp3/maci/probe-output/bsc-integration/admin-password.txt'), 'utf8');
const adminCookie = await login('maci_bsc_synthetic_admin', adminPassword);
const observations = [];
for (const voter of voters) {
  const created = await request('auth/register', { method: 'POST', body: {
    username: voter.username, password: voter.password, fullName: `Synthetic BSC voter ${voter.index + 1}`,
  } });
  if (![200, 201, 409].includes(created.status)) throw new Error(`Voter create failed: ${created.status} ${created.data.code ?? 'unknown'}`);
  const voterCookie = await login(voter.username, voter.password);
  const participation = await request(`maci/elections/${electionId}/participation`, { method: 'POST', cookie: voterCookie });
  if (![200, 201].includes(participation.status)) throw new Error(`Participation failed: ${participation.status} ${participation.data.code ?? 'unknown'}`);
  if (participation.data.status === 'PENDING') {
    const approval = await request(`maci/admin/elections/${electionId}/requests/${participation.data.id}/approve`, { method: 'POST', cookie: adminCookie });
    if (![200, 201].includes(approval.status) || approval.data.status !== 'APPROVED') throw new Error(`Approval failed: ${approval.status} ${approval.data.code ?? 'unknown'}`);
  } else if (participation.data.status !== 'APPROVED') throw new Error(`Unexpected participation state: ${participation.data.status}`);
  const pair = new Keypair(PrivateKey.deserialize(voter.secret));
  const authorization = await request(`maci/elections/${electionId}/authorization`, { method: 'POST', cookie: voterCookie,
    body: { x: pair.publicKey.raw[0].toString(), y: pair.publicKey.raw[1].toString() } });
  if (![200, 201].includes(authorization.status)) throw new Error(`Authorization failed: ${authorization.status} ${authorization.data.code ?? 'unknown'}`);
  const registered = await request(`maci/elections/${electionId}/registration`, { method: 'POST', cookie: voterCookie });
  if (![200, 201].includes(registered.status)) throw new Error(`Registration relay failed: ${registered.status} ${registered.data.code ?? 'unknown'}`);
  let state = registered.data;
  for (let attempt = 0; attempt < 30 && state.status !== 'CONFIRMED'; attempt += 1) {
    await new Promise(resolve => setTimeout(resolve, 2000));
    const polled = await request(`maci/elections/${electionId}/registration`, { cookie: voterCookie });
    if (polled.status !== 200) throw new Error(`Registration status failed: ${polled.status}`);
    state = polled.data;
    if (state.status === 'FAILED') throw new Error('Sponsored registration failed on chain');
  }
  if (state.status !== 'CONFIRMED') throw new Error('Registration did not reach confirmations');
  observations.push({ voter: voter.index, registrationTransactionHash: state.transactionHash, registrationBlock: state.blockNumber });
  process.stdout.write(`${JSON.stringify(observations.at(-1))}\n`);
}
fs.writeFileSync(path.join(directory, 'registration-observation.json'), `${JSON.stringify({ electionId, observations }, null, 2)}\n`);

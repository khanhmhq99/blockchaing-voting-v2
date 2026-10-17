'use client';

import { useEffect, useRef, useState } from 'react';
import { api, apiOrigin } from './auth-client';
import { PortalShell, Notice, EmptyState } from './portal-shell';
import { createMaciCredential, encryptMaciVote, exportCredentialBackup, importCredentialBackup, publicKeyFromSecret } from './maci-client';
import { findMaciJoin, generateMaciJoin } from './maci-join-client';

type Election = {
  id: string; title: string; candidates: string[]; chainId: string; maciAddress: `0x${string}`;
  pollAddress: `0x${string}`; pollId: string; deploymentBlock: string; status: string;
  eligible: boolean; coordinatorKeyX: string; coordinatorKeyY: string; voteOptions: number;
};
type Eligibility = { registration: { status: string; publicKeyX: string; publicKeyY: string } | null };
type Submission = { id: string; status: string; transactionHash: string | null; pollStateIndex?: string | null; errorCode?: string | null };
type Audit = { tally: { results: { tally: string[] } }; manifest: { snapshotBlock: number; snapshotBlockHash: string } };
const safeOperationErrors = new Set([
  'Prepare a credential first.', 'MACI backup is too large.', 'Invalid MACI backup.',
  'Unsupported MACI backup.', 'Invalid MACI backup encoding.',
  'MACI backup could not be opened. Check the file and passphrase.',
  'Use a backup passphrase of at least 12 characters.',
  'This backup belongs to another MACI credential.',
  'Restore and verify an encrypted backup first.', 'Restore the MACI credential first.',
  'Restore the MACI backup first.', 'Public MACI RPC is not configured.',
  'A confirmed poll join is required.',
]);

async function anonymousPost<T>(path: string, body: unknown, key: string): Promise<T> {
  const response = await fetch(`${apiOrigin}/v1${path}`, {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? 'Encrypted MACI submission failed.');
  return payload as T;
}
async function anonymousGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiOrigin}/v1${path}`, { credentials: 'omit', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message ?? 'MACI status is unavailable.');
  return payload as T;
}

export function MaciPanel() {
  const [elections, setElections] = useState<Election[]>([]);
  const [activeId, setActiveId] = useState('');
  const [eligibility, setEligibility] = useState<Eligibility>();
  const secretRef = useRef('');
  const passphraseInput = useRef<HTMLInputElement>(null);
  const [credentialReady, setCredentialReady] = useState(false);
  const [backupVerified, setBackupVerified] = useState(false);
  const [candidate, setCandidate] = useState(0);
  const [joinIndex, setJoinIndex] = useState<string | null>(null);
  const [join, setJoin] = useState<Submission>();
  const [message, setMessage] = useState<Submission>();
  const [audit, setAudit] = useState<{ electionId: string; evidence: Audit }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const active = elections.find(election => election.id === activeId);

  useEffect(() => {
    void api<Election[]>('/maci/elections').then(rows => { setElections(rows); setActiveId(rows[0]?.id ?? ''); }).catch(cause => setError(String(cause)));
  }, []);
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    void api<Eligibility>(`/maci/elections/${activeId}/eligibility`)
      .then(result => { if (!cancelled) setEligibility(result); })
      .catch(cause => { if (!cancelled) setError(String(cause)); });
    return () => { cancelled = true; };
  }, [activeId]);
  useEffect(() => {
    const current = elections.find(election => election.id === activeId);
    if (current?.status !== 'VERIFIED') return;
    let cancelled = false;
    let requestNumber = 0;
    const refresh = () => {
      const request = ++requestNumber;
      void anonymousGet<Audit>(`/maci/elections/${activeId}/audit`)
        .then(evidence => { if (!cancelled && request === requestNumber) setAudit({ electionId: activeId, evidence }); })
        .catch(cause => { if (!cancelled && request === requestNumber) { setAudit(undefined); setError(String(cause)); } });
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, [activeId, elections]);

  function switchElection(id: string) {
    secretRef.current = ''; if (passphraseInput.current) passphraseInput.current.value = '';
    setActiveId(id); setEligibility(undefined); setCredentialReady(false); setBackupVerified(false); setJoinIndex(null); setJoin(undefined); setMessage(undefined); setAudit(undefined); setCandidate(0); setError(''); setNotice('');
  }
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) {
      const message = cause instanceof Error ? cause.message : '';
      setError(safeOperationErrors.has(message) ? message : 'MACI operation failed. Check the election state and try again.');
    } finally { setBusy(false); }
  }
  async function downloadBackup() {
    const secret = secretRef.current;
    if (!secret) throw new Error('Prepare a credential first.');
    const content = await exportCredentialBackup(secret, passphraseInput.current?.value ?? '');
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `maci-credential-${activeId}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice('Encrypted backup downloaded. Import it to confirm recovery before registration.');
  }
  async function restoreBackup(file: File) {
    if (file.size > 4096) throw new Error('MACI backup is too large.');
    const recovered = await importCredentialBackup(await file.text(), passphraseInput.current?.value ?? '');
    const key = publicKeyFromSecret(recovered);
    if (eligibility?.registration && (eligibility.registration.publicKeyX !== key.publicKeyX || eligibility.registration.publicKeyY !== key.publicKeyY)) throw new Error('This backup belongs to another MACI credential.');
    secretRef.current = recovered; if (passphraseInput.current) passphraseInput.current.value = '';
    setCredentialReady(true); setBackupVerified(true); setNotice('Encrypted credential backup restored and checked.');
  }
  async function register() {
    const secret = secretRef.current;
    if (!active || !secret || !backupVerified) throw new Error('Restore and verify an encrypted backup first.');
    const key = publicKeyFromSecret(secret);
    await api(`/maci/elections/${active.id}/authorization`, { method: 'POST', body: JSON.stringify({ x: key.publicKeyX, y: key.publicKeyY }) });
    const result = await api<Submission>(`/maci/elections/${active.id}/registration`, { method: 'POST' });
    setNotice(`Registration ${result.status}. ${result.transactionHash ?? ''}`);
    setEligibility(await api<Eligibility>(`/maci/elections/${active.id}/eligibility`));
  }
  async function refreshRegistration() {
    if (!active) return;
    const result = await api<Submission>(`/maci/elections/${active.id}/registration`, { method: 'GET' });
    setNotice(`Registration ${result.status}. ${result.transactionHash ?? ''}`);
    setEligibility(await api<Eligibility>(`/maci/elections/${active.id}/eligibility`));
  }
  async function discoverJoin() {
    const secret = secretRef.current;
    if (!active || !secret) throw new Error('Restore the MACI credential first.');
    const rpcUrl = process.env.NEXT_PUBLIC_MACI_RPC_URL;
    if (!rpcUrl) throw new Error('Public MACI RPC is not configured.');
    const index = await findMaciJoin({ secret, rpcUrl, chainId: active.chainId, maciAddress: active.maciAddress, pollId: active.pollId, deploymentBlock: active.deploymentBlock });
    setJoinIndex(index);
    setNotice(index ? `Poll joined at state index ${index}.` : 'No confirmed poll join found.');
  }
  async function joinPoll() {
    const secret = secretRef.current;
    if (!active || !secret || !backupVerified) throw new Error('Restore the MACI backup first.');
    const rpcUrl = process.env.NEXT_PUBLIC_MACI_RPC_URL;
    if (!rpcUrl) throw new Error('Public MACI RPC is not configured.');
    const generated = await generateMaciJoin({ secret, rpcUrl, chainId: active.chainId, maciAddress: active.maciAddress, pollAddress: active.pollAddress, pollId: active.pollId, deploymentBlock: active.deploymentBlock });
    const result = await anonymousPost<Submission>(`/maci/elections/${active.id}/joins`, generated.body, generated.idempotencyKey);
    setJoin(result); setJoinIndex(result.pollStateIndex ?? null);
    setNotice(`Poll join ${result.status}. ${result.transactionHash ?? ''}`);
  }
  async function refreshJoin() {
    if (!join) return;
    const result = await anonymousGet<Submission>(`/maci/joins/${join.id}`);
    setJoin(result); setJoinIndex(result.pollStateIndex ?? null);
    setNotice(`Poll join ${result.status}.`);
  }
  async function submitVote() {
    const secret = secretRef.current;
    if (!active || !secret || !joinIndex) throw new Error('A confirmed poll join is required.');
    const encrypted = encryptMaciVote({ secret, pollId: active.pollId, pollStateIndex: joinIndex, candidateIndex: candidate, nonce: 1, coordinatorKeyX: active.coordinatorKeyX, coordinatorKeyY: active.coordinatorKeyY, voteOptions: active.voteOptions, chainId: active.chainId, pollAddress: active.pollAddress });
    const result = await anonymousPost<Submission>(`/maci/elections/${active.id}/messages`, { data: encrypted.message.data, encryptionPublicKey: encrypted.encryptionPublicKey }, encrypted.idempotencyKey);
    setMessage(result); setNotice(`Encrypted command ${result.status}. A transaction confirmation does not prove that this choice was counted.`);
  }
  async function refreshMessage() {
    if (!message) return;
    const result = await anonymousGet<Submission>(`/maci/messages/${message.id}`);
    setMessage(result); setNotice(`Encrypted command ${result.status}. Tally proof verification is required for final results.`);
  }

  return <PortalShell role="USER" title="MACI private election" description="Walletless synthetic election with client-held MACI credentials.">
    {error && <Notice kind="error">{error}</Notice>}{notice && <Notice>{notice}</Notice>}
    {!elections.length ? <EmptyState title="No MACI elections configured" /> : <>
      <label>Election <select value={activeId} onChange={event => switchElection(event.target.value)}>{elections.map(election => <option key={election.id} value={election.id}>{election.title}</option>)}</select></label>
      {active && <div className="card">
        <p>Protocol {active.chainId} / MACI v3.0.0 / poll {active.pollId}. Status: <strong>{active.status}</strong>. Eligibility: <strong>{active.eligible ? 'Eligible' : 'Not assigned'}</strong>.</p>
        {!active.eligible ? <Notice kind="error">An admin must assign eligibility before credential registration.</Notice> : <>
          <h2>1. Prepare and back up credential</h2>
          <p>Keep the encrypted backup and passphrase yourself. The service cannot restore a lost MACI key after on-chain registration. A password reset does not recover this credential. Import the backup again on another browser.</p>
          <p>The browser keeps the decrypted credential in memory for this page session and drops its reference when you change elections. A browser is not a hardware enclave.</p>
          <button type="button" disabled={busy || !!eligibility?.registration} onClick={() => { const created = createMaciCredential(); secretRef.current = created.secret; setCredentialReady(true); setBackupVerified(false); setNotice('Credential created in this browser session.'); }}>Create MACI credential</button>
          <label>Backup passphrase <input ref={passphraseInput} type="password" autoComplete="new-password" /></label>
          <button type="button" disabled={busy || !credentialReady} onClick={() => void run(downloadBackup)}>Download encrypted backup</button>
          <label>Restore encrypted backup <input type="file" accept="application/json" disabled={busy} onChange={event => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void run(() => restoreBackup(file)); }} /></label>
          <p>Backup check: {backupVerified ? 'verified' : 'required'}.</p>
          <h2>2. Register and join</h2>
          <button type="button" disabled={busy || !backupVerified || active.status !== 'REGISTRATION'} onClick={() => void run(register)}>Request authorization and register</button>
          <button type="button" disabled={busy} onClick={() => void run(refreshRegistration)}>Refresh registration</button>
          <p>Registration: {eligibility?.registration?.status ?? 'not started'}.</p>
          <button type="button" disabled={busy || !backupVerified || active.status !== 'OPEN'} onClick={() => void run(joinPoll)}>Generate joining proof and join poll</button>
          <button type="button" disabled={busy || !credentialReady} onClick={() => void run(discoverJoin)}>Find confirmed join</button>
          {join && <button type="button" disabled={busy} onClick={() => void run(refreshJoin)}>Refresh join transaction</button>}
          <p>Poll state index: {joinIndex ?? 'not confirmed'}.</p>
          <h2>3. Encrypt and submit choice</h2>
          <p>Your choice is signed and encrypted in this browser before submission. The public chain records an encrypted MACI command, not the plaintext choice. The MACI coordinator can decrypt individual commands, and application operators may correlate registration and join metadata.</p>
          <label>Candidate <select value={candidate} onChange={event => setCandidate(Number(event.target.value))}>{active.candidates.map((name, index) => <option key={index} value={index}>{name}</option>)}</select></label>
          <p>MACI processes encrypted commands in reverse order. For this single-choice poll, a later valid nonce-1 command can replace an earlier choice while voting remains open. Inclusion alone does not show which choice will count.</p>
          <button type="button" disabled={busy || !joinIndex || active.status !== 'OPEN'} onClick={() => void run(submitVote)}>Encrypt in browser and submit</button>
          {message && <button type="button" disabled={busy} onClick={() => void run(refreshMessage)}>Refresh encrypted transaction</button>}
          <p>Command: {message?.status ?? 'not submitted'}. Included commands require coordinator processing and verified tally proofs before results are final.</p>
          {active.status === 'CLOSED' && <Notice>Poll closed. Coordinator processing and proof verification are pending.</Notice>}
          {active.status === 'VERIFIED' && audit?.electionId !== active.id && <Notice>Result verification is recorded; public audit evidence is loading or unavailable. No result is displayed until the evidence is available.</Notice>}
          {active.status === 'VERIFIED' && audit?.electionId === active.id && <div><h2>Verified results</h2><p>Snapshot block {audit.evidence.manifest.snapshotBlock}.</p><ul>{active.candidates.map((name, index) => <li key={index}>{name}: {audit.evidence.tally.results.tally[index] ?? '0'}</li>)}</ul></div>}
        </>}
      </div>}
    </>}
  </PortalShell>;
}

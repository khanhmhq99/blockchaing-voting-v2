'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../auth-client';
import { EmptyState, Notice, PortalShell } from '../../portal-shell';

type Election = { id: string; title: string };
type Monitor = {
  election: { id: string; title: string; status: string; chainId: string; pollId: string };
  observedAt: string;
  counts: { eligible: number; registered: number; joined: number; encryptedCommandsIncluded: number; encryptedCommandsPending: number };
  processing: { submittedBatches: number; tallyBatches: number; latestRun: { status: string; errorCode: string | null; startedAt: string } | null };
  chain: { status: string; head: string | null; confirmations: string | null; reasonCode: string | null };
  historicalAudit: { snapshotBlock: string; snapshotHash: string; verifiedAt: string } | null;
  currentVerification: string;
};

export default function MonitorPage() {
  const [elections, setElections] = useState<Election[]>([]);
  const [selected, setSelected] = useState('');
  const [monitor, setMonitor] = useState<Monitor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const serial = useRef(0);
  useEffect(() => { void api<Election[]>('/maci/elections').then(rows => { setElections(rows); setSelected(rows[0]?.id ?? ''); }).catch(() => setError('Election list is unavailable.')); }, []);
  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    const load = async () => {
      const request = ++serial.current;
      setLoading(true); setMonitor(null); setError('');
      try {
        const row = await api<Monitor>(`/maci/admin/elections/${selected}/monitor`);
        if (!cancelled && request === serial.current && row.election.id === selected) setMonitor(row);
      } catch {
        if (!cancelled && request === serial.current) setError('Monitoring data is unavailable. Retry after checking the API and chain.');
      } finally { if (!cancelled && request === serial.current) setLoading(false); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => { cancelled = true; serial.current++; window.clearInterval(interval); };
  }, [selected]);
  return <PortalShell role="ADMIN" title="Election monitoring" description="Current MACI stages and public chain health. Counts describe distinct stages, not turnout.">
    <div className="app-card"><label>Election <select value={selected} onChange={event => { setSelected(event.target.value); setMonitor(null); }}>{elections.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
      {!elections.length && !error && <EmptyState title="No MACI election available" />}
    </div>
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <Notice>Refreshing live election status…</Notice>}
    {monitor && <>
      <div className="app-card"><h2>Election overview</h2><p>Lifecycle: <span className="status-pill">{monitor.election.status}</span> · Chain {monitor.election.chainId} · Poll {monitor.election.pollId}</p><p>Observed {new Date(monitor.observedAt).toLocaleString()}</p></div>
      <div className="summary-grid">
        {[
          ['Eligible accounts', monitor.counts.eligible], ['Registered credentials', monitor.counts.registered],
          ['Joined participants', monitor.counts.joined], ['Included encrypted commands', monitor.counts.encryptedCommandsIncluded],
        ].map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
      </div>
      <div className="two-column">
        <section className="app-card"><h2>Blockchain activity</h2><p>Chain: <span className={`status-pill ${monitor.chain.status === 'AVAILABLE' ? 'success' : 'warning'}`}>{monitor.chain.status}</span></p><p>Head block: {monitor.chain.head ?? 'Unavailable'} · Pending commands: {monitor.counts.encryptedCommandsPending}</p><p>{monitor.chain.reasonCode ?? 'No chain warning reported.'}</p><p>Inclusion does not establish that a command became a counted vote.</p></section>
        <section className="app-card"><h2>MACI processing</h2><p>Processing batches submitted: {monitor.processing.submittedBatches}</p><p>Tally batches submitted: {monitor.processing.tallyBatches}</p><p>Latest coordinator run: {monitor.processing.latestRun?.status ?? 'None'} {monitor.processing.latestRun?.errorCode ?? ''}</p></section>
        <section className="app-card"><h2>Proof verification</h2><p>Current application check: <span className={`status-pill ${monitor.currentVerification === 'APPLICATION_VERIFIED' ? 'success' : 'warning'}`}>{monitor.currentVerification}</span></p><p>Independent CLI verification must be run separately. An application result is not an independent PASS.</p></section>
        <section className="app-card"><h2>Audit history and results</h2>{monitor.historicalAudit ? <><p>Historical application verification: {new Date(monitor.historicalAudit.verifiedAt).toLocaleString()}</p><p>Snapshot block {monitor.historicalAudit.snapshotBlock}; current depth {monitor.chain.confirmations ?? 'unknown'}.</p><p>Snapshot hash <code>{monitor.historicalAudit.snapshotHash}</code></p>{monitor.currentVerification === 'APPLICATION_VERIFIED' && <a href={`/verify?election=${selected}`}>View current public evidence</a>}</> : <p>No published audit observation.</p>}</section>
      </div>
    </>}
  </PortalShell>;
}

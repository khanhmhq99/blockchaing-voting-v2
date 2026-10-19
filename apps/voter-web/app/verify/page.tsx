'use client';

import { useEffect, useRef, useState } from 'react';
import { apiOrigin } from '../auth-client';
import { Notice } from '../portal-shell';

type Evidence = { manifest: { snapshotBlock: number; snapshotBlockHash: string }; tally: { results: { tally: string[] } } };
type Configuration = { configuration: { candidates: { id: string; optionIndex: number; name: string }[]; candidateBinding: string }; canonicalSha256: string; warning: string };

export default function VerifyPage() {
  const [id, setId] = useState('');
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  const [config, setConfig] = useState<Configuration | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const serial = useRef(0);
  useEffect(() => { const value = new URLSearchParams(window.location.search).get('election'); if (value) setId(value); }, []);
  async function refresh() {
    const request = ++serial.current;
    setEvidence(null); setConfig(null); setError(''); setLoading(true);
    const requested = id.trim();
    try {
      if (!/^[0-9a-f-]{36}$/i.test(requested)) throw new Error('Enter an election ID.');
      const [auditResponse, configResponse] = await Promise.all([
        fetch(`${apiOrigin}/v1/maci/elections/${requested}/audit`, { credentials: 'omit', cache: 'no-store' }),
        fetch(`${apiOrigin}/v1/maci/elections/${requested}/configuration`, { credentials: 'omit', cache: 'no-store' }),
      ]);
      if (!auditResponse.ok || !configResponse.ok) throw new Error('Public evidence is unavailable or no longer confirmed.');
      const [audit, configuration] = await Promise.all([auditResponse.json() as Promise<Evidence>, configResponse.json() as Promise<Configuration>]);
      if (request === serial.current) { setEvidence(audit); setConfig(configuration); }
    } catch (cause) { if (request === serial.current) setError(cause instanceof Error ? cause.message : 'Verification status unavailable.'); }
    finally { if (request === serial.current) setLoading(false); }
  }
  useEffect(() => {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return;
    const interval = window.setInterval(() => void refresh(), 15_000);
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', visible); serial.current++; };
  }, [id]);
  return <main className="public-audit"><p><a href="/">HCMUT Voting</a></p><h1>Public election evidence</h1><p>This page requires no account. The application checks its own evidence before publishing it; run the standalone CLI with your own RPC to verify independently.</p>
    <div className="app-card"><label>Election ID <input value={id} onChange={event => { serial.current++; setId(event.target.value); setEvidence(null); setConfig(null); setError(''); setLoading(false); }} /></label><button type="button" disabled={loading} onClick={() => void refresh()}>Refresh public evidence</button></div>
    {loading && <Notice>Checking current snapshot and evidence availability…</Notice>}
    {error && <Notice kind="error">{error}</Notice>}
    {evidence && config && <div className="app-card"><h2>Application-checked historical observation</h2><p>Snapshot block {evidence.manifest.snapshotBlock}, hash <code>{evidence.manifest.snapshotBlockHash}</code>.</p><p>{config.warning}</p><p>Candidate binding: <strong>{config.configuration.candidateBinding}</strong>. Canonical configuration SHA-256: <code>{config.canonicalSha256}</code>.</p>
      <table className="app-table"><thead><tr><th>Candidate ID</th><th>Option</th><th>Aggregate tally</th></tr></thead><tbody>{config.configuration.candidates.map(row => <tr key={row.id}><td>{row.id} · {row.name}</td><td>{row.optionIndex}</td><td>{evidence.tally.results.tally[row.optionIndex] ?? 'Unavailable'}</td></tr>)}</tbody></table>
      <p>{['manifest.json', 'events.ndjson', 'proofs.json', 'tally.json'].map(name => <span key={name}><a href={`${apiOrigin}/v1/maci/elections/${id}/evidence/${name}`}>{name}</a> · </span>)}<a href={`${apiOrigin}/v1/maci/elections/${id}/configuration`}>Configuration descriptor</a>{config.configuration.candidateBinding === 'onchain-pre-election-hash-v1' && <> · <a href={`${apiOrigin}/v1/maci/elections/${id}/configuration.json`}>Canonical configuration file</a></>}</p>
      <p>CLI: <code>npm run verify:election -- --evidence &lt;four-file-directory&gt; --rpc &lt;independent-rpc&gt; --config &lt;canonical-config.json&gt; --config-sha256 &lt;prior-pinned-hash&gt;</code></p>
    </div>}
  </main>;
}

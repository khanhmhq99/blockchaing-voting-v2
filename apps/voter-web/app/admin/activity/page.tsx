'use client';

import { useEffect, useState } from 'react';
import { api } from '../../auth-client';
import { EmptyState, Notice, PortalShell } from '../../portal-shell';

type Activity = { id: string; action: string; targetId: string | null; createdAt: string; actor: { username: string } };

export default function AdminActivityPage() {
  const [rows, setRows] = useState<Activity[]>([]);
  const [error, setError] = useState('');
  useEffect(() => { void api<Activity[]>('/auth/admin/activity').then(setRows).catch(cause => setError(cause instanceof Error ? cause.message : 'Activity is unavailable.')); }, []);
  return <PortalShell role="ADMIN" title="Admin activity" description="Account changes in the MACI application.">
    {error && <Notice kind="error">{error}</Notice>}
    {!rows.length ? <EmptyState title="No admin activity yet" /> : <div className="app-card"><table className="app-table"><thead><tr><th>Time</th><th>Admin</th><th>Action</th><th>Target</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString()}</td><td>{row.actor.username}</td><td>{row.action}</td><td>{row.targetId ?? '-'}</td></tr>)}</tbody></table></div>}
  </PortalShell>;
}

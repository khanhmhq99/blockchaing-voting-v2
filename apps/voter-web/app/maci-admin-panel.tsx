'use client';

import { useEffect, useState } from 'react';
import { api } from './auth-client';
import { EmptyState, Notice, PortalShell } from './portal-shell';

type MaciElection = { id: string; title: string; chainId: string; maciAddress: string; pollAddress: string; pollId: string; status: string; candidates: string[]; startTimestamp: string; endTimestamp: string };
const initial = { title: '', candidates: '', chainId: '31337', maciAddress: '', registrationAddress: '', pollAddress: '', pollId: '0', deploymentBlock: '0' };

export function MaciAdminPanel() {
  const [elections, setElections] = useState<MaciElection[]>([]);
  const [form, setForm] = useState(initial);
  const [selectedId, setSelectedId] = useState('');
  const [username, setUsername] = useState('');
  const [evidenceFiles, setEvidenceFiles] = useState<{ manifestJson?: File; eventsNdjson?: File; proofsJson?: File; tallyJson?: File }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const selected = elections.find(election => election.id === selectedId);
  async function refresh() {
    const rows = await api<MaciElection[]>('/maci/elections');
    setElections(rows); setSelectedId(current => current || rows[0]?.id || '');
  }
  useEffect(() => { void refresh().catch(cause => setError(String(cause))); }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(cause instanceof Error ? cause.message : 'MACI admin operation failed.'); } finally { setBusy(false); }
  }
  async function configure() {
    const candidates = form.candidates.split('\n').map(value => value.trim()).filter(Boolean);
    const created = await api<MaciElection>('/maci/admin/elections', { method: 'POST', body: JSON.stringify({ ...form, candidates }) });
    await refresh(); setSelectedId(created.id); setNotice(`MACI election configured: ${created.title}.`);
  }
  async function assign() {
    if (!selected) throw new Error('Select a MACI election.');
    await api(`/maci/admin/elections/${selected.id}/eligibility`, { method: 'POST', body: JSON.stringify({ username }) });
    setNotice('Eligibility assigned. The voter can now prepare and register a MACI credential.');
    setUsername('');
  }
  async function changeStatus(status: 'OPEN' | 'CLOSED') {
    if (!selected) throw new Error('Select a MACI election.');
    await api(`/maci/admin/elections/${selected.id}/status`, { method: 'POST', body: JSON.stringify({ status }) });
    await refresh(); setNotice(`MACI election is ${status.toLowerCase()}.`);
  }
  async function publishAudit() {
    if (!selected || !evidenceFiles.manifestJson || !evidenceFiles.eventsNdjson || !evidenceFiles.proofsJson || !evidenceFiles.tallyJson) throw new Error('Select all four public evidence files.');
    await api(`/maci/admin/elections/${selected.id}/audit`, { method: 'POST', body: JSON.stringify({
      manifestJson: await evidenceFiles.manifestJson.text(), eventsNdjson: await evidenceFiles.eventsNdjson.text(),
      proofsJson: await evidenceFiles.proofsJson.text(), tallyJson: await evidenceFiles.tallyJson.text(),
    }) });
    await refresh(); setNotice('MACI tally and public evidence verified against the chain and published.');
  }
  return <PortalShell role="ADMIN" title="Quản lý bầu cử MACI" description="Cấu hình cuộc bầu cử MACI tổng hợp và cấp quyền đăng ký.">
    {error && <Notice kind="error">{error}</Notice>}{notice && <Notice kind="success">{notice}</Notice>}
    <div className="card">
      <h2>Cấu hình từ MACI deployment</h2>
      <p>Nhập địa chỉ hợp đồng và block triển khai đã kiểm tra. Hệ thống đối chiếu policy, issuer, poll và số ứng viên với chain trước khi lưu.</p>
      <label>Tên cuộc bầu cử <input value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <label>Ứng viên (mỗi dòng một tên) <textarea value={form.candidates} onChange={event => setForm({ ...form, candidates: event.target.value })} /></label>
      {(['chainId', 'maciAddress', 'registrationAddress', 'pollAddress', 'pollId', 'deploymentBlock'] as const).map(field =>
        <label key={field}>{field} <input value={form[field]} onChange={event => setForm({ ...form, [field]: event.target.value })} /></label>)}
      <button type="button" disabled={busy} onClick={() => void run(configure)}>Lưu cấu hình MACI</button>
    </div>
    <div className="card">
      <h2>Đăng ký và trạng thái</h2>
      {!elections.length ? <EmptyState title="Chưa có cuộc bầu cử MACI" /> : <>
        <label>Cuộc bầu cử <select value={selectedId} onChange={event => setSelectedId(event.target.value)}>{elections.map(election => <option key={election.id} value={election.id}>{election.title}</option>)}</select></label>
        {selected && <><p>Trạng thái: <strong>{selected.status}</strong>. Poll #{selected.pollId} trên chain {selected.chainId}.</p>
          <p>Thời gian on-chain: {new Date(Number(selected.startTimestamp) * 1000).toLocaleString('vi-VN')} – {new Date(Number(selected.endTimestamp) * 1000).toLocaleString('vi-VN')}.</p>
          <label>Username đủ điều kiện <input value={username} onChange={event => setUsername(event.target.value)} /></label>
          <button type="button" disabled={busy || !username || selected.status !== 'REGISTRATION'} onClick={() => void run(assign)}>Cấp quyền đăng ký</button>
          <button type="button" disabled={busy || selected.status !== 'REGISTRATION'} onClick={() => void run(() => changeStatus('OPEN'))}>Mở giai đoạn bỏ phiếu</button>
          <button type="button" disabled={busy || selected.status !== 'OPEN'} onClick={() => void run(() => changeStatus('CLOSED'))}>Đóng giai đoạn bỏ phiếu</button>
          {selected.status === 'CLOSED' && <div>
            <h3>Công bố chứng cứ kiểm phiếu</h3>
            <p>Chọn bốn tệp public do coordinator tạo sau khi proof xử lý và kiểm phiếu được gửi lên chain.</p>
            {(['manifestJson', 'eventsNdjson', 'proofsJson', 'tallyJson'] as const).map(name => <label key={name}>{name} <input type="file" onChange={event => setEvidenceFiles({ ...evidenceFiles, [name]: event.target.files?.[0] })} /></label>)}
            <button type="button" disabled={busy} onClick={() => void run(publishAudit)}>Xác minh và công bố kết quả</button>
          </div>}
          {selected.status === 'VERIFIED' && <p><a href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/v1/maci/elections/${selected.id}/audit`}>Bộ chứng cứ MACI công khai</a></p>}
        </>}
      </>}
    </div>
  </PortalShell>;
}

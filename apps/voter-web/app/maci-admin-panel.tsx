'use client';

import { useEffect, useRef, useState } from 'react';
import { api, apiOrigin, ApiError } from './auth-client';
import { EmptyState, Notice, PortalShell } from './portal-shell';
import { ElectionCards } from './election-cards';
import { ElectionOverview } from './election-overview';
import { showToast } from './action-toast';
import { maciStatusLabel } from './maci-status';
import { transactionExplorerUrl } from './maci-network';

type Election = { id: string; title: string; candidates: string[]; chainId: string; maciAddress: string; registrationAddress?: string; pollAddress: string; pollId: string; deploymentBlock: string; status: string; chainHealth?: string; startTimestamp: string; endTimestamp: string };
type Job = { id: string; status: string; stage: string; diagnosticCode: string | null; electionId: string | null; deployment: { registrationAddress?: string; transactions?: { hash: string }[] } | null };
type Request = { id: string; status: string; requestedAt: string; reviewedAt: string | null; user: { username: string } };
type Audit = { tally: { results: { tally: string[] } }; manifest: { snapshotBlock: number } };
type ProofJob = { status: string; stage: string; diagnosticCode: string | null; closingBlock: string; snapshotBlock: string | null };
function parseProofJobResponse(value: unknown): ProofJob | null {
  if (!value || typeof value !== 'object' || !('job' in value)) throw new Error('Invalid proof job response');
  const job = value.job;
  if (job === null) return null;
  if (!job || typeof job !== 'object' || !('status' in job) || typeof job.status !== 'string' || !('stage' in job) || typeof job.stage !== 'string' ||
      !('diagnosticCode' in job) || job.diagnosticCode !== null && typeof job.diagnosticCode !== 'string' ||
      !('closingBlock' in job) || typeof job.closingBlock !== 'string' ||
      !('snapshotBlock' in job) || job.snapshotBlock !== null && typeof job.snapshotBlock !== 'string') throw new Error('Invalid proof job');
  return job as ProofJob;
}
const initialForm = { title: '', candidates: ['', ''], start: '', end: '' };

export function MaciAdminPanel({ view = 'dashboard', electionId }: { view?: 'dashboard' | 'elections' | 'new' | 'details' | 'participants' | 'results'; electionId?: string }) {
  const [elections, setElections] = useState<Election[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [job, setJob] = useState<Job | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [evidenceFiles, setEvidenceFiles] = useState<{ manifestJson?: File; eventsNdjson?: File; proofsJson?: File; tallyJson?: File }>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingElections, setLoadingElections] = useState(true);
  const [requestFilter, setRequestFilter] = useState('ALL');
  const [requestSearch, setRequestSearch] = useState('');
  const [reviewing, setReviewing] = useState<{ request: Request; decision: 'approve' | 'reject' } | null>(null);
  const [audit, setAudit] = useState<Audit | null>(null);
  const [proofJob, setProofJob] = useState<ProofJob | null>(null);
  const [proofJobLoadError, setProofJobLoadError] = useState(false);
  const creationKey = useRef<string | null>(null);
  const selected = elections.find(election => election.id === selectedId);
  const canReview = selected?.status === 'REGISTRATION' && selected.chainId === (process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337') && selected.chainHealth === 'AVAILABLE';
  const canApproveProof = selected?.status === 'CLOSED' && selected.chainHealth === 'AVAILABLE' && proofJob?.status === 'READY' && !proofJobLoadError;
  const proofPublicationHint = proofJobLoadError ? 'Không tải được trạng thái proof job. Kiểm tra kết nối API rồi tải lại trang.'
    : selected?.status === 'REGISTRATION' || selected?.status === 'OPEN' ? 'Cuộc bỏ phiếu chưa đóng. Worker chỉ bắt đầu sau thời điểm kết thúc và khi block đóng đã đủ xác nhận.'
      : selected?.chainHealth !== 'AVAILABLE' ? 'Không xác minh được deployment trên chuỗi hiện tại. Kiểm tra RPC trước khi xử lý kết quả.'
        : !proofJob ? 'Chưa có proof job. Worker riêng phải đang chạy và chain phải có block đóng poll với đủ xác nhận.'
          : proofJob.status === 'READY' ? 'Bốn artifact đã qua kiểm toán. Admin có thể phê duyệt công bố; API sẽ xác minh lại trước khi chuyển sang VERIFIED.'
            : proofJob.status === 'RECONCILIATION_REQUIRED' ? 'Job đã dừng để đối chiếu. Kiểm tra checkpoint và giao dịch trên chuỗi; chỉ dùng phương án thủ công sau khi worker đã dừng.'
              : `Worker đang xử lý: ${proofJob.status} · ${proofJob.stage}. Kết quả chưa được công bố.`;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  async function refresh() {
    const rows = await api<Election[]>('/maci/elections');
    setElections(rows); setSelectedId(current => electionId || current || rows[0]?.id || '');
  }
  useEffect(() => {
    void refresh().catch(() => setError('Không thể tải danh sách cuộc bỏ phiếu.')).finally(() => setLoadingElections(false));
    void api<Job[]>('/maci/admin/deployments').then(rows => setJob(rows[0] ?? null)).catch(() => {});
    const timer = window.setInterval(() => { void refresh().catch(() => {}); }, 15_000);
    return () => window.clearInterval(timer);
  }, [electionId]);
  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    setRequests([]);
    const load = () => { void api<Request[]>(`/maci/admin/elections/${selectedId}/requests`).then(rows => { if (!cancelled) setRequests(rows); }).catch(() => { if (!cancelled) setError('Không thể tải yêu cầu đăng ký. Vui lòng thử lại.'); }); };
    load(); const timer = window.setInterval(load, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [selectedId]);
  useEffect(() => {
    if (view !== 'results' || !selectedId) { setProofJob(null); setProofJobLoadError(false); return; }
    let cancelled = false;
    setProofJob(null); setProofJobLoadError(false);
    const load = () => { void api<unknown>(`/maci/admin/elections/${selectedId}/proof-job`).then(parseProofJobResponse).then(row => { if (!cancelled) { setProofJob(row); setProofJobLoadError(false); } }).catch(() => { if (!cancelled) { setProofJob(null); setProofJobLoadError(true); } }); };
    load(); const timer = window.setInterval(load, 10_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [view, selectedId]);
  useEffect(() => {
    if (view !== 'results' || selected?.status !== 'VERIFIED') { setAudit(null); return; }
    let cancelled = false;
    void fetch(`${apiOrigin}/v1/maci/elections/${selected.id}/audit`, { credentials: 'omit', cache: 'no-store' }).then(async response => {
      if (!response.ok) throw new Error('Audit unavailable');
      return response.json() as Promise<Audit>;
    }).then(result => { if (!cancelled) setAudit(result); }).catch(() => { if (!cancelled) { setAudit(null); setError('Không thể kiểm tra bằng chứng công khai. Kết quả đã được ẩn.'); } });
    return () => { cancelled = true; };
  }, [view, selected?.id, selected?.status]);
  useEffect(() => {
    if (!job || ['READY', 'FAILED'].includes(job.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void api<Job>(`/maci/admin/deployments/${job.id}`).then(next => {
        if (cancelled) return;
        setJob(next);
        if (next.status === 'READY') { void refresh(); if (next.electionId) setSelectedId(next.electionId); }
      }).catch(() => { if (!cancelled) setError('Không thể cập nhật trạng thái triển khai.'); });
    }, 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [job?.id, job?.status]);
  async function run(work: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('');
    const toastId = showToast('loading', 'Đang xử lý yêu cầu…');
    try { await work(); showToast('success', 'Thao tác đã hoàn tất.', toastId); } catch (cause) {
      const code = cause instanceof ApiError ? cause.code : '';
      setError(code === 'MACI_REGISTRATION_CLOSED' ? 'Thời gian đăng ký đã kết thúc; không thể phê duyệt yêu cầu này.'
        : code === 'MACI_REQUEST_NOT_PENDING' || code === 'MACI_REQUEST_CONCURRENT_REVIEW' ? 'Yêu cầu đã được xử lý. Danh sách sẽ cập nhật lại sau ít giây.'
          : code === 'MACI_CHAIN_MISMATCH' || code === 'MACI_DEPLOYMENT_MISMATCH' || code === 'DEPENDENCY_UNAVAILABLE' ? 'Không thể xác minh deployment MACI trên chuỗi hiện tại. Kiểm tra API và RPC trước khi phê duyệt.'
            : 'Không thể hoàn thành thao tác. Vui lòng kiểm tra trạng thái cuộc bỏ phiếu và thử lại.');
      showToast('error', 'Không thể hoàn tất thao tác.', toastId);
    } finally { setBusy(false); }
  }
  async function create() {
    const candidates = form.candidates.map(name => name.trim());
    if (!form.title.trim() || candidates.length < 2 || candidates.length > 125 || candidates.some(name => !name) || new Set(candidates.map(name => name.normalize('NFKC').toLocaleLowerCase('en-US'))).size !== candidates.length) throw new Error('Enter a title and two to 125 unique candidate names.');
    const startTimestamp = Math.floor(new Date(form.start).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(form.end).getTime() / 1000);
    if (!Number.isSafeInteger(startTimestamp) || startTimestamp < Date.now() / 1000 + 600 || !Number.isSafeInteger(endTimestamp) || endTimestamp <= startTimestamp + 120) throw new Error('Start must be at least ten minutes ahead; end must follow start by more than two minutes.');
    creationKey.current ??= crypto.randomUUID();
    const row = await api<Job>('/maci/admin/elections', { method: 'POST', headers: { 'idempotency-key': creationKey.current }, body: JSON.stringify({ title: form.title.trim(), candidates, startTimestamp, endTimestamp }) });
    setJob(row); creationKey.current = null;
  }
  async function review(requestId: string, decision: 'approve' | 'reject') {
    if (!selected) return;
    if (selected.chainId !== (process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337') || !canReview) throw new Error('MACI_CHAIN_MISMATCH');
    const updated = await api<Request>(`/maci/admin/elections/${selected.id}/requests/${requestId}/${decision}`, { method: 'POST' });
    setRequests(rows => rows.map(row => row.id === requestId ? { ...row, status: updated.status, reviewedAt: updated.reviewedAt } : row));
    const success = decision === 'approve' ? 'Đã phê duyệt yêu cầu tham gia.' : 'Đã từ chối yêu cầu tham gia.';
    try { setRequests(await api<Request[]>(`/maci/admin/elections/${selected.id}/requests`)); setNotice(success); }
    catch { setNotice(`${success} Danh sách sẽ tự cập nhật sau ít giây.`); }
  }
  async function beginReview(request: Request, decision: 'approve' | 'reject') {
    if (!selected) return;
    setError('');
    if (selected.chainId !== (process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337')) {
      const reason = `Cuộc bỏ phiếu thuộc chain ${selected.chainId}; bản web này đang dùng chain ${process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337'}.`;
      setError(reason); showToast('warning', reason); return;
    }
    if (canReview) { setReviewing({ request, decision }); return; }
    let reason = selected.status !== 'REGISTRATION'
      ? 'Thời gian đăng ký đã kết thúc; không thể phê duyệt yêu cầu này.'
      : 'Không thể xác minh deployment MACI trên chuỗi hiện tại. Kiểm tra API, RPC và địa chỉ contract của cuộc bỏ phiếu.';
    setError(reason);
    const toastId = showToast('warning', reason);
    if (selected.status === 'REGISTRATION') {
      try {
        const config = await api<{ chainId: number }>('/config');
        if (String(config.chainId) !== selected.chainId) reason = `API đang kết nối chain ${config.chainId}, nhưng cuộc bỏ phiếu thuộc chain ${selected.chainId}. Hãy khởi động API và web với cùng cấu hình mạng.`;
      } catch { /* Keep the safe deployment-health explanation. */ }
    }
    setError(reason);
    showToast('warning', reason, toastId);
    void refresh().catch(() => {});
  }
  async function publishAudit() {
    if (!selected || !evidenceFiles.manifestJson || !evidenceFiles.eventsNdjson || !evidenceFiles.proofsJson || !evidenceFiles.tallyJson) throw new Error('Select all four public evidence files.');
    await api(`/maci/admin/elections/${selected.id}/audit`, { method: 'POST', body: JSON.stringify({
      manifestJson: await evidenceFiles.manifestJson.text(), eventsNdjson: await evidenceFiles.eventsNdjson.text(),
      proofsJson: await evidenceFiles.proofsJson.text(), tallyJson: await evidenceFiles.tallyJson.text(),
    }) });
    await refresh(); setNotice('Public evidence was verified and published.');
  }
  async function approveProofJob() {
    if (!selected || proofJob?.status !== 'READY') throw new Error('Proof job is not ready.');
    await api(`/maci/admin/elections/${selected.id}/proof-job/approve`, { method: 'POST' });
    await refresh();
    setNotice('Bằng chứng đã được xác minh lại và kết quả đã công bố.');
  }
  const visibleRequests = requests.filter(request => (requestFilter === 'ALL' || request.status === requestFilter) && request.user.username.toLocaleLowerCase('vi').includes(requestSearch.trim().toLocaleLowerCase('vi')));
  const pageTitle = ({ dashboard: 'Tổng quan quản trị', elections: 'Cuộc bỏ phiếu', new: 'Tạo cuộc bỏ phiếu', details: 'Chi tiết cuộc bỏ phiếu', participants: 'Duyệt tham gia', results: 'Kết quả và kiểm toán' } as const)[view];
  return <PortalShell role="ADMIN" title={pageTitle} description="Theo dõi cuộc bỏ phiếu, yêu cầu tham gia và kết quả.">
    {error && <Notice kind="error">{error}</Notice>}{notice && <Notice kind="success">{notice}</Notice>}
    {view === 'dashboard' && !loadingElections && <div className="summary-grid" aria-label="Tổng quan quản trị">
      {([['Tổng cuộc bỏ phiếu', elections.length], ['Đang diễn ra', elections.filter(row => row.status === 'OPEN').length], ['Chờ duyệt trong cuộc đã chọn', requests.filter(row => row.status === 'PENDING').length], ['Yêu cầu trong cuộc đã chọn', requests.length]] as const).map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>}
    {view === 'new' && <div className="card"><h2>Tạo cuộc bỏ phiếu</h2>
      <label>Tên cuộc bỏ phiếu<input value={form.title} maxLength={160} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
      <h3>Ứng viên</h3>
      {form.candidates.map((name, index) => <div key={index}><label>Ứng viên {index + 1}<input value={name} maxLength={120} onChange={event => setForm(current => ({ ...current, candidates: current.candidates.map((item, position) => position === index ? event.target.value : item) }))} /></label><button type="button" disabled={busy || form.candidates.length <= 2} onClick={() => setForm(current => ({ ...current, candidates: current.candidates.filter((_, position) => position !== index) }))}>Xóa ứng viên</button></div>)}
      <button type="button" disabled={busy || form.candidates.length >= 125} onClick={() => setForm(current => ({ ...current, candidates: [...current.candidates, ''] }))}>Thêm ứng viên</button>
      <p>Thời gian theo múi giờ trình duyệt: {timezone}.</p>
      <label>Bắt đầu<input type="datetime-local" value={form.start} onChange={event => setForm({ ...form, start: event.target.value })} /></label>
      <label>Kết thúc<input type="datetime-local" value={form.end} onChange={event => setForm({ ...form, end: event.target.value })} /></label>
      <button type="button" disabled={busy || !!job && !['READY', 'FAILED'].includes(job.status)} onClick={() => void run(create)}>Tạo cuộc bỏ phiếu</button>
      {job && <Notice kind={job.status === 'FAILED' || job.status === 'RECONCILIATION_REQUIRED' ? 'error' : 'success'}>Triển khai {maciStatusLabel(job.status)}: {job.stage}. {job.diagnosticCode ?? ''}{job.status === 'RECONCILIATION_REQUIRED' ? ' Cần kiểm tra chuỗi và bằng chứng trước khi thử lại.' : ''}</Notice>}
    </div>}
    {(view === 'dashboard' || view === 'elections') && (loadingElections ? <div className="election-card-grid" role="status" aria-label="Đang tải cuộc bỏ phiếu">{[0, 1, 2].map(index => <div key={index} className="election-card skeleton-card" />)}</div> : !elections.length ? <EmptyState title="Chưa có cuộc bỏ phiếu nào" /> : <>
      <ElectionCards rows={elections} selectedId={selectedId} onSelect={setSelectedId} />
      {selected && <ElectionOverview election={selected}><nav className="detail-links" aria-label="Quản lý cuộc bỏ phiếu"><a href={`/admin/elections/detail?id=${encodeURIComponent(selectedId)}`}>Xem thông tin</a><a href="/admin/elections/new">Tạo cuộc mới</a></nav>{selected.chainHealth !== 'AVAILABLE' && <Notice kind="error">Chưa thể kiểm tra cuộc bỏ phiếu trên chuỗi. Kiểm tra RPC và địa chỉ contract, giữ bản ghi này để đối chiếu.</Notice>}<details><summary>Thông tin kỹ thuật</summary><p>Chain {selected.chainId} · MACI {selected.maciAddress} · Đăng ký {selected.registrationAddress ?? job?.deployment?.registrationAddress ?? 'Xem giao dịch triển khai'} · Poll {selected.pollAddress} · Poll ID {selected.pollId} · Block triển khai {selected.deploymentBlock}</p>{job?.deployment?.transactions?.map(tx => <p key={tx.hash}>{transactionExplorerUrl(selected.chainId, tx.hash) ? <a href={transactionExplorerUrl(selected.chainId, tx.hash)!} target="_blank" rel="noopener noreferrer" aria-label={`Xem giao dịch ${tx.hash} trên BscScan`}><code>{tx.hash}</code></a> : <code>{tx.hash}</code>}</p>)}</details></ElectionOverview>}
      </>)}
    {selected && (view === 'details' || view === 'participants' || view === 'results') && <ElectionOverview election={selected}><nav className="detail-links" aria-label="Quản lý cuộc bỏ phiếu"><a aria-current={view === 'details' ? 'page' : undefined} href={`/admin/elections/detail?id=${encodeURIComponent(selected.id)}`}>Thông tin</a><a aria-current={view === 'participants' ? 'page' : undefined} href={`/admin/elections/participants?id=${encodeURIComponent(selected.id)}`}>Người tham gia</a><a aria-current={view === 'results' ? 'page' : undefined} href={`/admin/elections/results?id=${encodeURIComponent(selected.id)}`}>Kết quả</a><a href="/admin/monitor">Giám sát</a></nav>{view === 'details' && <details><summary>Thông tin kỹ thuật</summary><p>Chain {selected.chainId} · MACI {selected.maciAddress} · Poll {selected.pollAddress} · Poll ID {selected.pollId} · Block {selected.deploymentBlock}</p></details>}</ElectionOverview>}
    {selected && view === 'participants' && <div className="app-card"><h2>Yêu cầu đăng ký</h2><p>{requests.filter(request => request.status === 'PENDING').length} chờ duyệt · {requests.filter(request => request.status === 'APPROVED').length} đã duyệt · {requests.filter(request => request.status === 'REJECTED').length} đã từ chối</p>
      {!canReview && requests.some(request => request.status === 'PENDING') && <Notice kind="error">{selected.status !== 'REGISTRATION' ? 'Thời gian đăng ký đã kết thúc; các yêu cầu đang chờ không thể được phê duyệt cho cuộc bỏ phiếu này.' : 'Không thể xác minh deployment MACI trên chuỗi hiện tại. Kiểm tra API, RPC và địa chỉ contract của cuộc bỏ phiếu.'}</Notice>}
      <div className="election-toolbar"><div className="filter-tabs" role="group" aria-label="Lọc yêu cầu">{([['ALL', 'Tất cả'], ['PENDING', 'Chờ duyệt'], ['APPROVED', 'Đã duyệt'], ['REJECTED', 'Đã từ chối']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={requestFilter === value} className={requestFilter === value ? 'selected' : ''} onClick={() => setRequestFilter(value)}>{label}</button>)}</div><label className="visually-labeled">Tìm người tham gia<input type="search" value={requestSearch} onChange={event => setRequestSearch(event.target.value)} placeholder="Tên đăng nhập" /></label></div>
      {!visibleRequests.length ? <EmptyState title="Không có yêu cầu phù hợp" /> : <div className="table-wrap"><table className="app-table"><thead><tr><th>Người tham gia</th><th>Thời gian đăng ký</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>{visibleRequests.map(request => <tr key={request.id}><td>{request.user.username}</td><td>{new Date(request.requestedAt).toLocaleString('vi-VN')}</td><td><span className={`status-pill ${request.status === 'APPROVED' ? 'success' : request.status === 'REJECTED' ? 'error' : 'warning'}`}>{request.status === 'PENDING' ? 'Chờ phê duyệt' : request.status === 'APPROVED' ? 'Đã phê duyệt' : 'Đã từ chối'}</span></td><td>{request.status === 'PENDING' && <><button type="button" disabled={busy} onClick={() => void beginReview(request, 'approve')}>Phê duyệt</button><button type="button" disabled={busy} onClick={() => void beginReview(request, 'reject')}>Từ chối</button></>}</td></tr>)}</tbody></table></div>}
    </div>}
    {reviewing && selected && <RegistrationReviewDialog request={reviewing.request} decision={reviewing.decision} electionTitle={selected.title} busy={busy} onCancel={() => setReviewing(null)} onConfirm={() => void run(async () => { await review(reviewing.request.id, reviewing.decision); setReviewing(null); })} />}
    {selected && view === 'results' && <details className="card" open><summary>Kiểm toán và kết quả</summary>
      <p>Worker tự tạo và xác minh proof sau khi poll đóng trên chuỗi. Admin chỉ phê duyệt công bố khi job đã sẵn sàng.</p>
      {selected.status !== 'VERIFIED' && <div>
        <h3>Xử lý proof và công bố</h3>
        <Notice kind={proofJobLoadError || proofJob?.status === 'RECONCILIATION_REQUIRED' ? 'error' : 'info'}>{proofPublicationHint}</Notice>
        {proofJob?.diagnosticCode && <p>Mã trạng thái: <code>{proofJob.diagnosticCode}</code></p>}
        {proofJob?.snapshotBlock && <p>Snapshot block {proofJob.snapshotBlock}</p>}
        <button type="button" disabled={busy || !canApproveProof} onClick={() => void run(approveProofJob)}>Phê duyệt công bố kết quả</button>
        {selected.status === 'CLOSED' && !proofJobLoadError && (!proofJob || proofJob.status === 'RECONCILIATION_REQUIRED') && <details>
          <summary>Phương án dự phòng: tải bốn file để xác minh và công bố thủ công</summary>
          {(['manifestJson', 'eventsNdjson', 'proofsJson', 'tallyJson'] as const).map(name => <label key={name}>{name} <input type="file" onChange={event => setEvidenceFiles({ ...evidenceFiles, [name]: event.target.files?.[0] })} /></label>)}
          <button type="button" disabled={busy} onClick={() => void run(publishAudit)}>Xác minh và công bố thủ công</button>
        </details>}
      </div>}
      {selected.status === 'VERIFIED' && audit && <><p>Snapshot block {audit.manifest.snapshotBlock}</p><ul>{selected.candidates.map((name, index) => <li key={index}>{name}: {audit.tally.results.tally[index] ?? '0'}</li>)}</ul><a href={`${apiOrigin}/v1/maci/elections/${selected.id}/audit`}>Bằng chứng MACI công khai</a></>}
      {selected.status === 'VERIFIED' && !audit && <Notice kind="error">Chưa tải được bằng chứng công khai; kết quả đang được ẩn.</Notice>}
    </details>}
  </PortalShell>;
}

function RegistrationReviewDialog({ request, decision, electionTitle, busy, onCancel, onConfirm }: { request: Request; decision: 'approve' | 'reject'; electionTitle: string; busy: boolean; onCancel(): void; onConfirm(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  return <dialog ref={dialogRef} className="review-dialog" aria-labelledby="review-title" onClose={onCancel} onCancel={event => { if (busy) event.preventDefault(); }}>
    <h2 id="review-title">{decision === 'approve' ? 'Xác nhận phê duyệt' : 'Xác nhận từ chối'}</h2><p>Người tham gia: <strong>{request.user.username}</strong></p><p>Cuộc bỏ phiếu: <strong>{electionTitle}</strong></p>
    <div className="form-actions"><button type="button" autoFocus disabled={busy} onClick={onCancel}>Hủy</button><button type="button" className={decision === 'reject' ? 'destructive' : 'primary'} disabled={busy} onClick={onConfirm}>{decision === 'approve' ? 'Xác nhận phê duyệt' : 'Xác nhận từ chối'}</button></div>
  </dialog>;
}

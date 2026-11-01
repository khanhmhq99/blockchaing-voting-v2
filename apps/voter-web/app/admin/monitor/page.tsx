'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../../auth-client';
import { EmptyState, Notice, PortalShell } from '../../portal-shell';
import { ElectionCards } from '../../election-cards';
import { maciStatusLabel } from '../../maci-status';

type Election = { id: string; title: string; status: string; chainHealth?: string; startTimestamp: string; endTimestamp: string };
type Monitor = {
  election: { id: string; title: string; status: string; chainId: string; pollId: string };
  observedAt: string;
  counts: { eligible: number; registered: number; joined: number | null; encryptedCommandsIncluded: number | null; encryptedCommandsPending: number | null; participationTotal: number; participationPending: number; participationApproved: number; participationRejected: number };
  deployment: { status: string; stage: string; diagnosticCode: string | null };
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
  useEffect(() => { void api<Election[]>('/maci/elections').then(rows => { setElections(rows); setSelected(rows[0]?.id ?? ''); }).catch(() => setError('Không thể tải danh sách cuộc bỏ phiếu.')); }, []);
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
        if (!cancelled && request === serial.current) setError('Không thể tải dữ liệu giám sát. Hãy kiểm tra API và chuỗi rồi thử lại.');
      } finally { if (!cancelled && request === serial.current) setLoading(false); }
    };
    void load();
    const interval = window.setInterval(() => void load(), 15_000);
    return () => { cancelled = true; serial.current++; window.clearInterval(interval); };
  }, [selected]);
  return <PortalShell role="ADMIN" title="Giám sát cuộc bỏ phiếu" description="Các giai đoạn MACI và trạng thái chuỗi. Số liệu ở từng bước không phải số phiếu được tính.">
    {elections.length ? <ElectionCards rows={elections} selectedId={selected} onSelect={id => { setSelected(id); setMonitor(null); }} /> : !error && <EmptyState title="Chưa có cuộc bỏ phiếu nào" />}
    {error && <Notice kind="error">{error}</Notice>}
    {loading && <Notice>Đang cập nhật trạng thái cuộc bỏ phiếu…</Notice>}
    {monitor && <>
      <div className="app-card"><h2>Tổng quan</h2><p>Trạng thái: <span className="status-pill">{maciStatusLabel(monitor.election.status)}</span> · Chain {monitor.election.chainId} · Poll {monitor.election.pollId}</p><p>Ghi nhận lúc {new Date(monitor.observedAt).toLocaleString('vi-VN')}</p></div>
      <div className="summary-grid">
        {[
          ['Yêu cầu tham gia', monitor.counts.participationTotal], ['Chờ phê duyệt', monitor.counts.participationPending],
          ['Đã phê duyệt', monitor.counts.participationApproved], ['Đã từ chối', monitor.counts.participationRejected],
          ['Đủ điều kiện (DB)', monitor.counts.eligible], ['Đăng ký ghi nhận (DB)', monitor.counts.registered],
          ['Đã tham gia poll (projection)', monitor.counts.joined], ['Thông điệp mã hóa trên chuỗi (projection)', monitor.counts.encryptedCommandsIncluded],
        ].map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value ?? 'Chưa có dữ liệu'}</strong></div>)}
      </div>
      <div className="two-column">
        <section className="app-card"><h2>Hoạt động chuỗi</h2><p>Chain: <span className={`status-pill ${monitor.chain.status === 'AVAILABLE' ? 'success' : 'warning'}`}>{maciStatusLabel(monitor.chain.status)}</span></p><p>Triển khai: {maciStatusLabel(monitor.deployment.status)} / {monitor.deployment.stage}</p><p>Block hiện tại: {monitor.chain.head ?? 'Chưa có dữ liệu'} · Thông điệp chờ: {monitor.counts.encryptedCommandsPending ?? 'Chưa có dữ liệu'}</p><p>{monitor.chain.reasonCode ?? monitor.deployment.diagnosticCode ?? 'Không có cảnh báo từ chuỗi.'}</p><p>Sự kiện poll có thể gồm thông điệp khởi tạo và các lần thay lựa chọn. Giao dịch được ghi trên chuỗi chưa chứng minh lựa chọn được tính.</p></section>
        <section className="app-card"><h2>Xử lý MACI</h2><p>Lô xử lý đã gửi: {monitor.processing.submittedBatches}</p><p>Lô kiểm phiếu đã gửi: {monitor.processing.tallyBatches}</p><p>Lượt coordinator gần nhất: {monitor.processing.latestRun?.status ?? 'Chưa có'} {monitor.processing.latestRun?.errorCode ?? ''}</p></section>
        <section className="app-card"><h2>Xác minh proof</h2><p>Kiểm tra của ứng dụng: <span className={`status-pill ${monitor.currentVerification === 'APPLICATION_VERIFIED' ? 'success' : 'warning'}`}>{maciStatusLabel(monitor.currentVerification)}</span></p><p>Cần chạy CLI độc lập riêng; kết quả kiểm tra của ứng dụng không phải PASS độc lập.</p></section>
        <section className="app-card"><h2>Lịch sử kiểm toán và kết quả</h2>{monitor.historicalAudit ? <><p>Ứng dụng xác minh lúc: {new Date(monitor.historicalAudit.verifiedAt).toLocaleString('vi-VN')}</p><p>Snapshot block {monitor.historicalAudit.snapshotBlock}; độ sâu xác nhận {monitor.chain.confirmations ?? 'chưa rõ'}.</p><p>Snapshot hash <code>{monitor.historicalAudit.snapshotHash}</code></p>{monitor.currentVerification === 'APPLICATION_VERIFIED' && <a href={`/verify?election=${selected}`}>Xem bằng chứng công khai hiện tại</a>}</> : <p>Chưa có bằng chứng kiểm toán được công bố.</p>}</section>
      </div>
    </>}
  </PortalShell>;
}

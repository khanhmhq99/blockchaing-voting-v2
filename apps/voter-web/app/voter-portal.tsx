'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, type AppUser } from './auth-client';
import { PortalShell, Notice, EmptyState, Pagination } from './portal-shell';
import { type Election, type VoteRecord, stateLabel, voteLabel, electionTitle, dateTime, isPending } from './portal-data';

type View = 'dashboard' | 'elections' | 'my' | 'history' | 'detail';
const pageSize = 8;
export function VoterPortal({ view = 'dashboard' }: { view?: View }) {
  const [user, setUser] = useState<AppUser>();
  const [items, setItems] = useState<Election[]>([]);
  const [history, setHistory] = useState<VoteRecord[]>([]);
  const [detailId, setDetailId] = useState('');
  const [choice, setChoice] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [eligibility, setEligibility] = useState('all');
  const [participation, setParticipation] = useState('all');
  const [sort, setSort] = useState('newest');
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [explorer, setExplorer] = useState<string | null>(null);
  async function refresh() {
    const [me, elections, records, config] = await Promise.all([api<AppUser>('/auth/me'), api<Election[]>('/auth/elections'), api<VoteRecord[]>('/auth/history'), api<{ explorerUrl: string | null }>('/config')]);
    if (me.role !== 'USER') { window.location.replace('/admin'); return; }
    setUser(me); setItems(elections); setHistory(records); setExplorer(config.explorerUrl);
  }
  useEffect(() => {
    if (view === 'detail') setDetailId(new URLSearchParams(window.location.search).get('id') ?? '');
    void refresh().catch(error => setMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu.')).finally(() => setLoading(false));
  }, [view]);
  useEffect(() => {
    if (!history.some(row => isPending(row.status))) return;
    const timer = setInterval(() => { void refresh().catch(() => undefined); }, 5000);
    return () => clearInterval(timer);
  }, [history]);
  const filtered = useMemo(() => items.filter(e =>
    electionTitle(e).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')) &&
    (state === 'all' || e.chain.state === state) &&
    (eligibility === 'all' || (eligibility === 'eligible' ? e.userEligible : !e.userEligible)) &&
    (participation === 'all' || (participation === 'voted' ? e.userHasVoted : !e.userHasVoted)) &&
    (view !== 'my' || e.userEligible || e.userHasVoted)
  ).sort((a, b) => Number(sort === 'oldest' ? BigInt(a.chain.startTime) - BigInt(b.chain.startTime) : BigInt(b.chain.startTime) - BigInt(a.chain.startTime))), [items, search, state, eligibility, participation, sort, view]);
  const selected = items.find(e => e.chain.id === detailId);
  const active = items.filter(e => e.chain.state === 'Active' && e.userEligible && !e.userHasVoted);
  const pending = selected ? history.find(row => row.electionId === selected.chain.id && isPending(row.status)) : undefined;
  async function submit() {
    if (!selected?.metadata || choice === null || !selected.userEligible || selected.userHasVoted || selected.chain.state !== 'Active' || pending || busy) return;
    const candidate = selected.metadata.candidates[choice];
    if (!candidate || !window.confirm(`Xác nhận bỏ phiếu cho “${candidate.name}” trong “${selected.metadata.title}”? Phiếu đã ghi nhận không thể thay đổi.`)) return;
    setBusy(true); setMessage('Đang gửi yêu cầu bỏ phiếu…');
    try {
      const result = await api<{ status: string }>(`/auth/elections/${selected.chain.id}/vote`, { method: 'POST', body: JSON.stringify({ candidateId: choice }) });
      setMessage(`${voteLabel[result.status] ?? result.status}. Hãy chờ xác nhận từ blockchain trước khi xem là thành công.`);
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể gửi phiếu. Kiểm tra lịch sử trước khi thử lại.'); }
    finally { setBusy(false); }
  }
  const title = view === 'history' ? 'Lịch sử bỏ phiếu' : view === 'elections' ? 'Khám phá bầu cử' : view === 'my' ? 'Cuộc bầu cử của tôi' : view === 'detail' ? 'Chi tiết cuộc bầu cử' : `Xin chào, ${user?.fullName ?? ''}`;
  return <PortalShell role="USER" title={title} description={view === 'dashboard' ? 'Những cuộc bầu cử và lượt tham gia dành cho bạn.' : view === 'history' ? 'Theo dõi trạng thái giao dịch và xác nhận trên blockchain.' : undefined} action={<button onClick={() => void refresh().then(() => setMessage('Đã cập nhật dữ liệu.')).catch(() => setMessage('Không thể cập nhật.'))}>Làm mới</button>}>
    {message && <Notice kind={message.includes('Không thể') ? 'error' : 'info'}>{message}</Notice>}
    {loading ? <div className="app-card">Đang tải dữ liệu…</div> : view === 'dashboard' ? <>
      <div className="summary-grid"><div className="summary-card"><span>Có thể tham gia</span><strong>{active.length}</strong></div><div className="summary-card"><span>Đã bỏ phiếu</span><strong>{items.filter(e => e.userHasVoted).length}</strong></div><div className="summary-card"><span>Sắp diễn ra</span><strong>{items.filter(e => e.chain.state === 'Upcoming').length}</strong></div><div className="summary-card"><span>Đã kết thúc</span><strong>{items.filter(e => e.chain.state === 'Closed').length}</strong></div></div>
      <div className="two-column"><section className="app-card"><h2>Đang mở cho bạn</h2>{active.length ? <div className="election-list">{active.slice(0, 5).map(e => <ElectionTile key={e.chain.id} election={e} />)}</div> : <EmptyState title="Chưa có cuộc bầu cử có thể tham gia" detail="Quyền tham gia do quản trị viên cấp riêng cho từng cuộc bầu cử." />}</section><section className="app-card"><h2>Hoạt động gần đây</h2>{history.length ? <HistoryTable rows={history.slice(0, 5)} items={items} explorer={explorer} /> : <EmptyState title="Chưa có lượt bỏ phiếu" />}<p><a href="/voting-history">Xem toàn bộ lịch sử →</a></p></section></div>
      <div className="two-column"><section className="app-card"><h2>Sắp diễn ra</h2>{items.filter(e => e.chain.state === 'Upcoming').slice(0, 3).map(e => <ElectionTile key={e.chain.id} election={e} />)}{!items.some(e => e.chain.state === 'Upcoming') && <EmptyState title="Chưa có cuộc bầu cử sắp diễn ra" />}</section><section className="app-card"><h2>Đã tham gia</h2>{items.filter(e => e.userHasVoted).slice(0, 3).map(e => <ElectionTile key={e.chain.id} election={e} />)}{!items.some(e => e.userHasVoted) && <EmptyState title="Chưa có cuộc bầu cử đã tham gia" />}</section></div>
    </> : view === 'history' ? <section className="app-card"><div className="toolbar"><input aria-label="Tìm cuộc bầu cử" placeholder="Tìm cuộc bầu cử" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><select aria-label="Lọc trạng thái" value={state} onChange={e => { setState(e.target.value); setPage(1); }}><option value="all">Mọi trạng thái</option>{Object.keys(voteLabel).map(key => <option key={key} value={key}>{voteLabel[key]}</option>)}</select></div>{(() => { const rows = history.filter(row => (state === 'all' || row.status === state) && (items.find(e => e.chain.id === row.electionId)?.metadata?.title ?? row.electionId).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))); return rows.length ? <><HistoryTable rows={rows.slice((page - 1) * pageSize, page * pageSize)} items={items} explorer={explorer} /><Pagination page={page} total={rows.length} size={pageSize} onPage={setPage} /></> : <EmptyState title="Không có lịch sử phù hợp" />; })()}</section>
    : view === 'detail' ? selected ? <div className="two-column"><section className="app-card"><span className="status-pill">{stateLabel[selected.chain.state] ?? selected.chain.state}</span><h2 style={{ marginTop: 17 }}>{electionTitle(selected)}</h2><p>{selected.metadata?.description ?? 'Thông tin cuộc bầu cử chưa được xác minh.'}</p><p className="muted">Bắt đầu: {dateTime(selected.chain.startTime)}<br />Kết thúc: {dateTime(selected.chain.endTime)}</p><Notice>{selected.userHasVoted ? 'Bạn đã bỏ phiếu.' : selected.userEligible ? 'Bạn đủ điều kiện tham gia.' : 'Bạn chưa được cấp quyền tham gia.'}</Notice><details><summary>Thông tin blockchain</summary><p>Election #{selected.chain.id} · Block tham chiếu {selected.chain.blockNumber}</p><p>Đã ghi nhận {selected.chain.totalVotes} phiếu.</p></details></section><section className="app-card"><h2>Bỏ phiếu</h2>{selected.metadata?.candidates.map((candidate, index) => <label className="portal-choice" key={index}><input type="radio" name="candidate" disabled={!!pending || busy || !selected.userEligible || selected.userHasVoted || selected.chain.state !== 'Active'} checked={choice === index} onChange={() => setChoice(index)} /><span><strong>{candidate.name}</strong><small>{candidate.biography}</small></span></label>)}{pending && <Notice>Yêu cầu đang xử lý. <a href="/voting-history">Xem trạng thái trong lịch sử</a>.</Notice>}<button className="primary" disabled={choice === null || !!pending || busy || !selected.metadata || !selected.userEligible || selected.userHasVoted || selected.chain.state !== 'Active'} onClick={() => void submit()}>{busy ? 'Đang xử lý…' : 'Xác nhận và bỏ phiếu'}</button>{selected.userHasVoted && <Notice kind="success">Phiếu đã được ghi nhận trên blockchain.</Notice>}{selected.chain.state === 'Closed' && <Notice>Cuộc bầu cử đã kết thúc.</Notice>}</section></div> : <EmptyState title="Không tìm thấy cuộc bầu cử" detail="Mã cuộc bầu cử không hợp lệ hoặc chưa có dữ liệu được xác minh." />
    : <section className="app-card"><div className="toolbar"><input aria-label="Tìm cuộc bầu cử" placeholder="Tìm theo tên cuộc bầu cử" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><select aria-label="Trạng thái" value={state} onChange={e => { setState(e.target.value); setPage(1); }}><option value="all">Mọi trạng thái</option>{Object.entries(stateLabel).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><select aria-label="Quyền tham gia" value={eligibility} onChange={e => { setEligibility(e.target.value); setPage(1); }}><option value="all">Mọi quyền</option><option value="eligible">Đủ điều kiện</option><option value="ineligible">Chưa cấp quyền</option></select><select aria-label="Tham gia" value={participation} onChange={e => { setParticipation(e.target.value); setPage(1); }}><option value="all">Mọi lượt tham gia</option><option value="voted">Đã bỏ phiếu</option><option value="not-voted">Chưa bỏ phiếu</option></select><select aria-label="Sắp xếp" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Mới nhất</option><option value="oldest">Cũ nhất</option></select></div>{filtered.length ? <><div className="election-list">{filtered.slice((page - 1) * pageSize, page * pageSize).map(e => <ElectionTile key={e.chain.id} election={e} />)}</div><Pagination page={page} total={filtered.length} size={pageSize} onPage={setPage} /></> : <EmptyState title="Không có cuộc bầu cử phù hợp" detail="Thử điều chỉnh nội dung tìm kiếm hoặc bộ lọc." />}</section>}
  </PortalShell>;
}

function ElectionTile({ election: e }: { election: Election }) { return <a className="election-tile" href={`/elections/detail?id=${encodeURIComponent(e.chain.id)}`}><span className="status-pill">{stateLabel[e.chain.state] ?? e.chain.state}</span><strong>{electionTitle(e)}</strong><p>{e.metadata?.description || 'Chưa có mô tả.'}</p><small>{dateTime(e.chain.startTime)} – {dateTime(e.chain.endTime)} · {e.userHasVoted ? 'Đã bỏ phiếu' : e.userEligible ? 'Đủ điều kiện' : 'Chưa được cấp quyền'}</small></a>; }
function HistoryTable({ rows, items, explorer }: { rows: VoteRecord[]; items: Election[]; explorer: string | null }) { return <table className="app-table"><thead><tr><th>Cuộc bầu cử</th><th>Thời gian</th><th>Trạng thái</th><th>Xác minh</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><a href={`/elections/detail?id=${encodeURIComponent(row.electionId)}`}>{items.find(e => e.chain.id === row.electionId)?.metadata?.title ?? `Cuộc bầu cử #${row.electionId}`}</a></td><td>{new Date(row.confirmedAt ?? row.createdAt).toLocaleString('vi-VN')}</td><td><span className={`status-pill ${row.status === 'CONFIRMED' ? 'success' : row.status === 'FAILED' || row.status === 'REJECTED' ? 'error' : 'warning'}`}>{voteLabel[row.status] ?? row.status}</span></td><td>{row.transactionHash ? <details><summary>Chi tiết giao dịch</summary><code>{row.transactionHash}</code>{explorer && <p><a target="_blank" rel="noopener noreferrer" href={`${explorer}/tx/${row.transactionHash}`}>Mở trình khám phá ↗</a></p>}</details> : 'Chưa có giao dịch'}</td></tr>)}</tbody></table>; }

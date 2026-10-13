'use client';

import { useEffect, useMemo, useState } from 'react';
import { decodeEventLog, encodeFunctionData, keccak256, stringToHex, type Address, type Hex } from 'viem';
import { votingAbi } from '../../../packages/contracts/src/abi';
import { manifestSchema, payloadHash, type Manifest } from '../../../packages/shared-types/src/index';
import { api } from './auth-client';
import { connectWallet } from './wallet';
import { PortalShell, Notice, EmptyState, Pagination } from './portal-shell';
import { type Election, stateLabel, electionTitle, dateTime } from './portal-data';

type View = 'dashboard' | 'elections' | 'voters' | 'results' | 'activity';
type Config = { chainId: number; contractAddress: Address; owner: Address; confirmations: number; explorerUrl: string | null };
type UserRow = { id: string; username: string; fullName: string; role: string; status: string; createdAt: string };
type Identity = { id: string; voterAddress: Address; status: string; user: { username: string; fullName: string } };
type Activity = { id: string; action: string; targetId: string | null; createdAt: string; actor: { username: string } };
const activityLabel: Record<string, string> = { USER_CREATED: 'Tạo người dùng', USER_UPDATED: 'Cập nhật người dùng', PASSWORD_RESET: 'Đặt lại mật khẩu', ELIGIBILITY_IDENTITY_ASSIGNED: 'Tạo danh tính cử tri', ElectionCreated: 'Tạo cuộc bầu cử', ElectionConfigured: 'Sửa bản nháp', ElectionFrozen: 'Khóa cấu hình', ElectionFinalized: 'Chốt kết quả', ElectionCancelled: 'Hủy cuộc bầu cử', VoterAuthorized: 'Cập nhật quyền cử tri' };
const pageSize = 8;

export function AdminPortal({ view }: { view: View }) {
  const [items, setItems] = useState<Election[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [identities, setIdentities] = useState<Identity[]>([]);
  const [voterStates, setVoterStates] = useState<Record<string, { eligible: boolean; hasVoted: boolean }>>({});
  const [config, setConfig] = useState<Config>();
  const [electionId, setElectionId] = useState('');
  const [search, setSearch] = useState('');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [names, setNames] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [usernames, setUsernames] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [recoveryId, setRecoveryId] = useState('');
  const [recoveryTitle, setRecoveryTitle] = useState('');
  const [recoveryDescription, setRecoveryDescription] = useState('');
  const [recoveryNames, setRecoveryNames] = useState('');
  const [tab, setTab] = useState<'list' | 'form'>('list');
  const selected = items.find(e => e.chain.id === electionId);
  async function refresh() {
    const [elections, accounts, chain] = await Promise.all([api<Election[]>('/auth/elections'), api<UserRow[]>('/auth/admin/users'), api<Config>('/config')]);
    setItems(elections); setUsers(accounts); setConfig(chain);
    if (view === 'activity' || view === 'dashboard') setActivities(await api<Activity[]>('/auth/admin/activity'));
  }
  useEffect(() => { void refresh().catch(error => setMessage(error instanceof Error ? error.message : 'Không thể tải dữ liệu.')).finally(() => setLoading(false)); }, [view]);
  useEffect(() => { if (view !== 'voters' || !electionId) return; setVoterStates({}); void api<Identity[]>(`/auth/admin/elections/${electionId}/identities`).then(setIdentities).catch(error => setMessage(error instanceof Error ? error.message : 'Không thể tải cử tri.')); }, [view, electionId]);
  const visible = useMemo(() => items.filter(e => (state === 'all' || e.chain.state === state) && electionTitle(e).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).sort((a,b) => Number(sort === 'newest' ? BigInt(b.chain.startTime) - BigInt(a.chain.startTime) : BigInt(a.chain.startTime) - BigInt(b.chain.startTime))), [items, state, search, sort]);
  const totalVotes = items.reduce((sum, e) => sum + BigInt(e.chain.totalVotes), 0n).toString();
  function fill(e: Election) { setElectionId(e.chain.id); setTitle(e.metadata?.title ?? ''); setDescription(e.metadata?.description ?? ''); setNames(e.metadata?.candidates.map(c => c.name).join('\n') ?? ''); setStart(new Date(Number(e.chain.startTime) * 1000).toISOString().slice(0,16)); setEnd(new Date(Number(e.chain.endTime) * 1000).toISOString().slice(0,16)); setTab('form'); }
  function clearForm() { setElectionId(''); setTitle(''); setDescription(''); setNames(''); setStart(''); setEnd(''); setTab('form'); }
  async function send(data: Hex) {
    if (!config) throw new Error('Chưa có cấu hình blockchain.');
    const wallet = await connectWallet(config.chainId);
    if (wallet.address.toLowerCase() !== config.owner.toLowerCase()) throw new Error('Cần ví chủ hợp đồng để thực hiện thao tác quản trị.');
    const hash = await wallet.client.sendTransaction({ account: wallet.address, to: config.contractAddress, data });
    setMessage('Giao dịch đã gửi. Đang chờ xác nhận trên blockchain…');
    const receipt = await wallet.reader.waitForTransactionReceipt({ hash, confirmations: config.confirmations, timeout: 120_000 });
    const transaction = await wallet.reader.getTransaction({ hash: receipt.transactionHash });
    if (receipt.status !== 'success' || transaction.from.toLowerCase() !== wallet.address.toLowerCase() || transaction.to?.toLowerCase() !== config.contractAddress.toLowerCase() || transaction.input !== data) throw new Error('Giao dịch chưa được xác nhận đúng nội dung.');
    return { receipt, wallet };
  }
  async function saveMetadata(id: string, manifest: Manifest) {
    if (!config) throw new Error('Chưa có cấu hình blockchain.');
    const wallet = await connectWallet(config.chainId);
    if (wallet.address.toLowerCase() !== config.owner.toLowerCase()) throw new Error('Cần ví chủ hợp đồng để lưu metadata.');
    const payload = { electionId: id, manifest };
    const challenge = await api<{ nonce: string; message: string }>('/admin/challenge', { method: 'POST', body: JSON.stringify({ action: 'metadata', digest: payloadHash(payload) }) });
    const signature = await wallet.client.signMessage({ account: wallet.address, message: challenge.message });
    await api(`/admin/elections/${id}/metadata`, { method: 'POST', headers: { 'x-admin-nonce': challenge.nonce, 'x-admin-signature': signature }, body: JSON.stringify(manifest) });
  }
  async function syncActivity() {
    if (!config) throw new Error('Chưa có cấu hình blockchain.');
    const wallet = await connectWallet(config.chainId);
    if (wallet.address.toLowerCase() !== config.owner.toLowerCase()) throw new Error('Cần ví chủ hợp đồng để đồng bộ sự kiện.');
    const challenge = await api<{ nonce: string; message: string }>('/admin/challenge', { method: 'POST', body: JSON.stringify({ action: 'index', digest: payloadHash({}) }) });
    const signature = await wallet.client.signMessage({ account: wallet.address, message: challenge.message });
    await api('/admin/index', { method: 'POST', headers: { 'x-admin-nonce': challenge.nonce, 'x-admin-signature': signature } });
  }
  async function run(action: () => Promise<void>) { setBusy(true); setMessage('Đang xử lý…'); try { await action(); await refresh(); setMessage('Thao tác đã được xác nhận.'); } catch (error) { setMessage(error instanceof Error ? error.message : 'Thao tác thất bại.'); } finally { setBusy(false); } }
  async function saveElection() {
    if (!config) throw new Error('Chưa có cấu hình blockchain.');
    const manifest = manifestSchema.parse({ title, description, candidates: names.split('\n').map(name => name.trim()).filter(Boolean).map(name => ({ name, biography: '' })) });
    const from = BigInt(Math.floor(new Date(start).getTime() / 1000)); const to = BigInt(Math.floor(new Date(end).getTime() / 1000));
    if (from <= 0n || to <= from) throw new Error('Thời gian bắt đầu và kết thúc không hợp lệ.');
    if (electionId && selected?.chain.state !== 'Draft') throw new Error('Chỉ có thể sửa cuộc bầu cử ở trạng thái bản nháp.');
    const data = electionId ? encodeFunctionData({ abi: votingAbi, functionName: 'configureElection', args: [BigInt(electionId), from, to, manifest.candidates.length, payloadHash(manifest)] }) : encodeFunctionData({ abi: votingAbi, functionName: 'createElection', args: [from, to, manifest.candidates.length, payloadHash(manifest)] });
    const { receipt, wallet } = await send(data);
    let id = electionId;
    if (!id) for (const log of receipt.logs) { if (log.address.toLowerCase() !== config.contractAddress.toLowerCase()) continue; try { const event = decodeEventLog({ abi: votingAbi, data: log.data, topics: log.topics }); if (event.eventName === 'ElectionCreated') id = event.args.electionId.toString(); } catch { /* Ignore unrelated logs. */ } }
    if (!id) throw new Error('Giao dịch đã xác nhận nhưng chưa đọc được mã cuộc bầu cử.');
    setElectionId(id);
    const chainElection = await wallet.reader.readContract({ address: config.contractAddress, abi: votingAbi, functionName: 'getElection', args: [BigInt(id)] });
    if (chainElection.manifestHash !== payloadHash(manifest)) throw new Error('Manifest trên blockchain không khớp.');
    const hashes = manifest.candidates.slice(chainElection.registeredCandidates).map(payloadHash);
    if (hashes.length) await send(encodeFunctionData({ abi: votingAbi, functionName: 'registerCandidates', args: [BigInt(id), hashes] }));
    await saveMetadata(id, manifest);
    setTab('list');
  }
  async function recoverMetadata() {
    if (!config || !/^[1-9]\d{0,19}$/.test(recoveryId)) throw new Error('Nhập mã cuộc bầu cử hợp lệ.');
    const manifest = manifestSchema.parse({ title: recoveryTitle, description: recoveryDescription, candidates: recoveryNames.split('\n').map(name => name.trim()).filter(Boolean).map(name => ({ name, biography: '' })) });
    const wallet = await connectWallet(config.chainId);
    const chainElection = await wallet.reader.readContract({ address: config.contractAddress, abi: votingAbi, functionName: 'getElection', args: [BigInt(recoveryId)] });
    if (chainElection.manifestHash !== payloadHash(manifest)) throw new Error('Nội dung không khớp manifest đã ghi trên blockchain.');
    if (chainElection.registeredCandidates > manifest.candidates.length) throw new Error('Số ứng viên trên blockchain không hợp lệ.');
    const hashes = manifest.candidates.slice(chainElection.registeredCandidates).map(payloadHash);
    if (hashes.length) await send(encodeFunctionData({ abi: votingAbi, functionName: 'registerCandidates', args: [BigInt(recoveryId), hashes] }));
    await saveMetadata(recoveryId, manifest);
  }
  async function lifecycle(action: 'freeze' | 'finalize' | 'cancel') {
    if (!selected) throw new Error('Chọn cuộc bầu cử.');
    if (action === 'cancel' && (!cancelReason.trim() || !window.confirm('Hủy cuộc bầu cử này?'))) return;
    const data = action === 'cancel' ? encodeFunctionData({ abi: votingAbi, functionName: 'cancel', args: [BigInt(selected.chain.id), keccak256(stringToHex(cancelReason))] }) : encodeFunctionData({ abi: votingAbi, functionName: action, args: [BigInt(selected.chain.id)] });
    await send(data);
  }
  async function grant() {
    if (!electionId || selected?.chain.state !== 'Draft') throw new Error('Chỉ có thể cấp quyền khi cuộc bầu cử còn là bản nháp.');
    const names = [...new Set(usernames.split(/[\n,]+/).map(s => s.trim()).filter(Boolean))];
    if (!names.length) throw new Error('Nhập ít nhất một tên đăng nhập.');
    if (names.length > 50) throw new Error('Tối đa 50 tài khoản mỗi lần.');
    const addresses: Address[] = [];
    for (const username of names) { const row = await api<{ voterAddress: Address }>(`/auth/admin/elections/${electionId}/identities`, { method: 'POST', body: JSON.stringify({ username }) }); addresses.push(row.voterAddress); }
    await send(encodeFunctionData({ abi: votingAbi, functionName: 'setEligibility', args: [BigInt(electionId), addresses, true] }));
    setIdentities(await api<Identity[]>(`/auth/admin/elections/${electionId}/identities`)); setUsernames('');
  }
  async function revoke(identity: Identity) {
    if (!electionId || selected?.chain.state !== 'Draft' || !window.confirm(`Thu hồi quyền của ${identity.user.username}?`)) return;
    await send(encodeFunctionData({ abi: votingAbi, functionName: 'setEligibility', args: [BigInt(electionId), [identity.voterAddress], false] }));
    setVoterStates(current => ({ ...current, [identity.id]: { eligible: false, hasVoted: false } }));
  }
  async function checkVoter(identity: Identity) {
    const status = await api<{ eligible: boolean; hasVoted: boolean }>(`/elections/${electionId}/voters/${identity.voterAddress}`);
    setVoterStates(current => ({ ...current, [identity.id]: status }));
  }
  const pageTitle = { dashboard: 'Tổng quan', elections: 'Quản lý cuộc bầu cử', voters: 'Quản lý cử tri', results: 'Kết quả & thống kê', activity: 'Nhật ký hoạt động' }[view];
  return <PortalShell role="ADMIN" title={pageTitle} description={view === 'voters' ? 'Quyền bỏ phiếu được cấp riêng cho từng cuộc bầu cử trên blockchain.' : undefined} action={view === 'elections' ? <button className="primary" onClick={clearForm}>Tạo cuộc bầu cử</button> : view === 'activity' ? <button onClick={() => void run(syncActivity)}>Đồng bộ blockchain</button> : <button onClick={() => void run(async () => undefined)}>Làm mới</button>}>
    {message && <Notice kind={message.includes('thất bại') || message.includes('không') || message.includes('cần') ? 'error' : 'info'}>{message}</Notice>}
    {view === 'elections' && tab === 'list' && <div className="toolbar"><select aria-label="Sắp xếp theo ngày" value={sort} onChange={e => setSort(e.target.value as 'newest' | 'oldest')}><option value="newest">Ngày bắt đầu mới nhất</option><option value="oldest">Ngày bắt đầu cũ nhất</option></select></div>}
    {view === 'voters' && selected?.chain.state === 'Draft' && <section className="app-card"><h2>Tìm người dùng đã đăng ký</h2><input placeholder="Tên đăng nhập hoặc họ tên" value={search} onChange={e => setSearch(e.target.value)} />{search && <div className="form-actions">{users.filter(u => u.status === 'ACTIVE' && `${u.username} ${u.fullName}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).slice(0,10).map(u => <button key={u.id} onClick={() => { setUsernames(current => current ? `${current.trim()}\n${u.username}` : u.username); setSearch(''); }}>{u.username} · {u.fullName}</button>)}</div>}</section>}
    {loading ? <div className="app-card">Đang tải dữ liệu…</div> : view === 'dashboard' ? <><div className="summary-grid"><Metric label="Cuộc bầu cử có metadata" value={items.length} /><Metric label="Đang diễn ra" value={items.filter(e => e.chain.state === 'Active').length} /><Metric label="Sắp diễn ra" value={items.filter(e => e.chain.state === 'Upcoming').length} /><Metric label="Đã kết thúc" value={items.filter(e => e.chain.state === 'Closed').length} /><Metric label="Người dùng" value={users.length} /><Metric label="Phiếu đã ghi nhận" value={totalVotes} /></div><div className="two-column"><section className="app-card"><h2>Cuộc bầu cử gần đây</h2>{items.slice(0,5).map(e => <p key={e.chain.id}><a href="/admin/elections">{electionTitle(e)}</a> · {stateLabel[e.chain.state]}</p>)}{!items.length && <EmptyState title="Chưa có cuộc bầu cử" />}</section><section className="app-card"><h2>Hoạt động gần đây</h2>{activities.slice(0,5).map(a => <p key={a.id}>{activityLabel[a.action] ?? a.action} · {new Date(a.createdAt).toLocaleString('vi-VN')}</p>)}{!activities.length && <EmptyState title="Chưa có hoạt động được ghi nhận" />}</section><section className="app-card"><h2>Đăng ký gần đây</h2>{users.slice(0,5).map(u => <p key={u.id}>{u.fullName} · {new Date(u.createdAt).toLocaleDateString('vi-VN')}</p>)}{!users.length && <EmptyState title="Chưa có người dùng" />}</section><section className="app-card"><h2>Cuộc bầu cử đang diễn ra</h2>{items.filter(e => e.chain.state === 'Active').slice(0,5).map(e => <p key={e.chain.id}>{electionTitle(e)} · {e.chain.totalVotes} phiếu</p>)}{!items.some(e => e.chain.state === 'Active') && <EmptyState title="Chưa có cuộc bầu cử đang mở" />}</section></div><section className="app-card"><h2>Thao tác nhanh</h2><div className="form-actions"><a href="/admin/elections">Quản lý bầu cử →</a><a href="/admin/users">Quản lý người dùng →</a><a href="/admin/voters">Quản lý cử tri →</a><a href="/admin/results">Xem kết quả →</a></div></section></>
    : view === 'elections' ? <>{tab === 'form' ? <section className="app-card"><h2>{electionId ? `Sửa bản nháp #${electionId}` : 'Tạo cuộc bầu cử'}</h2><p className="muted">Thao tác cấu hình cần ví chủ hợp đồng; metadata được lưu sau khi kiểm tra hash trên blockchain.</p><div className="form-grid"><label>Tiêu đề<input value={title} onChange={e => setTitle(e.target.value)} required /></label><label>Bắt đầu<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} required /></label><label>Kết thúc<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} required /></label><label>Ứng viên (mỗi dòng một tên)<textarea value={names} onChange={e => setNames(e.target.value)} /></label><label>Mô tả<textarea value={description} onChange={e => setDescription(e.target.value)} /></label></div><div className="form-actions"><button className="primary" disabled={busy || !title || !start || !end || !names.trim()} onClick={() => void run(saveElection)}>{busy ? 'Đang xử lý…' : 'Lưu trên blockchain'}</button><button onClick={() => setTab('list')}>Quay lại</button></div></section> : <section className="app-card"><div className="toolbar"><input placeholder="Tìm cuộc bầu cử" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /><select value={state} onChange={e => { setState(e.target.value); setPage(1); }}><option value="all">Mọi trạng thái</option>{Object.entries(stateLabel).map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></div>{visible.length ? <><table className="app-table"><thead><tr><th>Tiêu đề</th><th>Bắt đầu</th><th>Kết thúc</th><th>Trạng thái</th><th>Ứng viên</th><th>Cử tri</th><th>Phiếu</th><th>Thao tác</th></tr></thead><tbody>{visible.slice((page-1)*pageSize,page*pageSize).map(e => <tr key={e.chain.id}><td>{electionTitle(e)}</td><td>{dateTime(e.chain.startTime)}</td><td>{dateTime(e.chain.endTime)}</td><td><span className="status-pill">{stateLabel[e.chain.state]}</span></td><td>{e.metadata?.candidates.length ?? '—'}</td><td>{e.chain.eligibleCount}</td><td>{e.chain.totalVotes}</td><td><button onClick={() => fill(e)}>Xem{e.chain.state === 'Draft' ? ' / sửa' : ''}</button></td></tr>)}</tbody></table><Pagination page={page} total={visible.length} size={pageSize} onPage={setPage} /></> : <EmptyState title="Không có cuộc bầu cử phù hợp" />}</section>}{selected && tab === 'form' && <section className="app-card"><h2>Vòng đời cuộc bầu cử #{selected.chain.id}</h2><p>Trạng thái hiện tại: {stateLabel[selected.chain.state]}. Các thao tác được xác nhận trên blockchain.</p><div className="form-actions"><button disabled={busy || selected.chain.state !== 'Draft'} onClick={() => void run(() => lifecycle('freeze'))}>Khóa cấu hình</button><button disabled={busy || selected.chain.state !== 'Closed' || selected.chain.finalized} onClick={() => void run(() => lifecycle('finalize'))}>Chốt kết quả</button><button disabled={busy || selected.chain.state === 'Cancelled' || selected.chain.finalized} onClick={() => void run(() => lifecycle('cancel'))}>Hủy cuộc bầu cử</button></div><label>Lý do hủy<input value={cancelReason} onChange={e => setCancelReason(e.target.value)} /></label></section>}</>
    : view === 'voters' ? <><section className="app-card"><label>Chọn cuộc bầu cử<select value={electionId} onChange={e => setElectionId(e.target.value)}><option value="">Chọn cuộc bầu cử</option>{items.map(e => <option key={e.chain.id} value={e.chain.id}>{electionTitle(e)} · #{e.chain.id}</option>)}</select></label>{selected && <p>Trạng thái: {stateLabel[selected.chain.state]} · Đã cấp quyền: {selected.chain.eligibleCount} · Phiếu: {selected.chain.totalVotes}</p>}{selected?.chain.state === 'Draft' && <><label>Tên đăng nhập (mỗi dòng một tài khoản)<textarea value={usernames} onChange={e => setUsernames(e.target.value)} placeholder={'user1\nuser2'} /></label><button className="primary" disabled={busy || !usernames.trim()} onClick={() => void run(grant)}>Cấp quyền cho cử tri</button></>}</section>{selected && <section className="app-card"><h2>Danh tính đã tạo</h2>{identities.length ? <table className="app-table"><thead><tr><th>Tài khoản</th><th>Họ tên</th><th>Địa chỉ danh tính</th><th>Trên blockchain</th><th>Thao tác</th></tr></thead><tbody>{identities.map(identity => <tr key={identity.id}><td>{identity.user.username}</td><td>{identity.user.fullName}</td><td><code>{identity.voterAddress}</code></td><td>{voterStates[identity.id] ? `${voterStates[identity.id]?.eligible ? 'Đủ điều kiện' : 'Chưa cấp quyền'} · ${voterStates[identity.id]?.hasVoted ? 'Đã bỏ phiếu' : 'Chưa bỏ phiếu'}` : <button onClick={() => void run(() => checkVoter(identity))}>Kiểm tra</button>}</td><td><button disabled={busy || selected.chain.state !== 'Draft' || voterStates[identity.id]?.hasVoted} onClick={() => void run(() => revoke(identity))}>Thu hồi</button></td></tr>)}</tbody></table> : <EmptyState title="Chưa có danh tính cử tri" />}</section>}</>
    : view === 'results' ? <section className="app-card"><label>Chọn cuộc bầu cử<select value={electionId} onChange={e => setElectionId(e.target.value)}><option value="">Chọn cuộc bầu cử</option>{items.map(e => <option key={e.chain.id} value={e.chain.id}>{electionTitle(e)}</option>)}</select></label>{selected ? <><div className="summary-grid"><Metric label="Cử tri đủ điều kiện" value={selected.chain.eligibleCount} /><Metric label="Tổng phiếu" value={selected.chain.totalVotes} /><Metric label="Trạng thái" value={stateLabel[selected.chain.state] ?? selected.chain.state} /><Metric label="Kết quả" value={selected.chain.finalized ? 'Đã chốt' : 'Chưa chốt'} /></div>{selected.chain.finalized ? <table className="app-table"><thead><tr><th>Ứng viên</th><th>Phiếu</th></tr></thead><tbody>{selected.chain.counts.map((count, index) => <tr key={index}><td>{selected.metadata?.candidates[index]?.name ?? `Phương án ${index+1}`}</td><td>{count}</td></tr>)}</tbody></table> : <Notice>Chỉ hiển thị tổng phiếu cho từng ứng viên sau khi kết quả được chốt. Dữ liệu on-chain của MVP 2.5 vẫn công khai.</Notice>}<p className="muted">Nguồn: blockchain · Block {selected.chain.blockNumber}</p></> : <EmptyState title="Chọn cuộc bầu cử để xem kết quả" />}</section>
    : <section className="app-card"><h2>Hoạt động quản trị được lưu</h2>{activities.length ? <table className="app-table"><thead><tr><th>Thời gian ghi nhận</th><th>Người thực hiện</th><th>Hoạt động</th><th>Đối tượng</th></tr></thead><tbody>{activities.map(a => <tr key={a.id}><td>{new Date(a.createdAt).toLocaleString('vi-VN')}</td><td>{a.actor.username}</td><td>{activityLabel[a.action] ?? a.action}</td><td>{a.targetId ?? '—'}</td></tr>)}</tbody></table> : <EmptyState title="Chưa có hoạt động được ghi nhận" />}<p className="muted">Sự kiện blockchain chỉ xuất hiện sau khi chỉ mục được đồng bộ. Không tạo lịch sử trước khi nhật ký được bật.</p></section>}
    {view === 'elections' && <section className="app-card"><details><summary>Khôi phục metadata sau giao dịch đã xác nhận</summary><p className="muted">Nhập chính xác nội dung đã ghi trên blockchain. Hệ thống chỉ lưu khi manifest hash khớp.</p><div className="form-grid"><label>Mã cuộc bầu cử<input inputMode="numeric" value={recoveryId} onChange={e => setRecoveryId(e.target.value)} /></label><label>Tiêu đề<input value={recoveryTitle} onChange={e => setRecoveryTitle(e.target.value)} /></label><label>Mô tả<textarea value={recoveryDescription} onChange={e => setRecoveryDescription(e.target.value)} /></label><label>Ứng viên (mỗi dòng một tên)<textarea value={recoveryNames} onChange={e => setRecoveryNames(e.target.value)} /></label></div><button className="primary" disabled={busy || !recoveryId || !recoveryTitle || !recoveryNames.trim()} onClick={() => void run(recoverMetadata)}>Kiểm tra và khôi phục</button></details></section>}
  </PortalShell>;
}
function Metric({ label, value }: { label: string; value: string | number }) { return <div className="summary-card"><span>{label}</span><strong>{value}</strong></div>; }

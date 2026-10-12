'use client';

import { useEffect, useState } from 'react';
import { decodeEventLog, encodeFunctionData, keccak256, stringToHex, type Address, type EIP1193Provider, type Hex } from 'viem';
import { votingAbi } from '../../../packages/contracts/src/abi';
import { manifestSchema, payloadHash, type Manifest } from '../../../packages/shared-types/src/index';

import { connectWallet } from './wallet';
import { Dashboard } from './dashboard';

type Config = { chainId: number; contractAddress: Address; confirmations: number; explorerUrl: string | null };
type Election = { metadata: Manifest | null; metadataStatus: string; chain: { id: string; manifestHash: Hex; candidateCount: number; state: string; counts: string[]; totalVotes: string; eligibleCount: string; finalized: boolean; eligible: boolean | null; hasVoted: boolean | null; startTime: string; endTime: string; blockNumber: string; blockHash: Hex; finality: string } };
const stateLabels: Record<string, string> = { Draft: "Nháp", Upcoming: "Sắp diễn ra", Active: "Đang mở", Closed: "Đã đóng", Cancelled: "Đã hủy" };
const api = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}/v1${path}`, init);
  if (!response.ok) throw new Error(`API ${response.status}: kiểm tra cấu hình, quyền quản trị hoặc trạng thái election.`);
  return response.json() as Promise<T>;
}


export default function Home() {
  const [config, setConfig] = useState<Config>();
  const [account, setAccount] = useState<Address>();
  const [items, setItems] = useState<Election[]>([]);
  const [selected, setSelected] = useState<Election>();
  const [candidate, setCandidate] = useState(0);
  const [tab, setTab] = useState('vote');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Đang kết nối API…');
  const [txHash, setTxHash] = useState<Hex>();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [names, setNames] = useState('Ứng viên A\nỨng viên B');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [electionId, setElectionId] = useState('');
  const [voters, setVoters] = useState('');
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [receiptElection, setReceiptElection] = useState<string>();

  async function refresh() { setItems(await request<Election[]>('/elections')); }
  useEffect(() => {
    void Promise.all([request<Config>('/config'), request<Election[]>('/elections')]).then(([c, rows]) => { setConfig(c); setItems(rows); setMessage('Sẵn sàng. Chỉ sử dụng cử tri giả lập.'); }).catch(() => setMessage('Chưa kết nối được NestJS API. Xem hướng dẫn Supabase và cấu hình server.'));
    const wallet = (window as unknown as { ethereum?: EIP1193Provider }).ethereum;
    const reset = () => { setAccount(undefined); setSelected(undefined); setMessage('Ví hoặc mạng đã thay đổi. Kết nối lại để tiếp tục.'); };
    wallet?.on('accountsChanged', reset); wallet?.on('chainChanged', reset);
    return () => { wallet?.removeListener('accountsChanged', reset); wallet?.removeListener('chainChanged', reset); };
  }, []);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setReceiptElection(undefined);
    try { await work(); } catch (error) { setMessage(error instanceof Error ? error.message : 'Thao tác thất bại.'); }
    finally { setBusy(false); }
  }
  async function wallet() {
    if (!config) throw new Error('API chưa cung cấp cấu hình mạng blockchain.');
    const connected = await connectWallet(config.chainId);
    setAccount(connected.address);
    return connected;
  }
  async function send(data: Hex, expectedAddress?: Address) {
    const { client, address, reader } = await wallet();
    if (expectedAddress && expectedAddress.toLowerCase() !== address.toLowerCase()) throw new Error('Ví đã thay đổi. Xem lại lựa chọn trước khi gửi.');
    setMessage('Xác nhận giao dịch trong ví…');
    const hash = await client.sendTransaction({ account: address, to: config!.contractAddress, data });
    setTxHash(hash); setMessage('Đã gửi. Đang chờ receipt và số block xác nhận đã cấu hình…');
    const receipt = await reader.waitForTransactionReceipt({ hash, confirmations: config!.confirmations, timeout: 120_000, onReplaced: event => { setTxHash(event.transaction.hash); setMessage(`Giao dịch được thay thế: ${event.reason}`); } });
    const confirmed = await reader.getTransaction({ hash: receipt.transactionHash });
    if (confirmed.to?.toLowerCase() !== config!.contractAddress.toLowerCase() || confirmed.input !== data || confirmed.from.toLowerCase() !== address.toLowerCase()) throw new Error('Giao dịch bị thay thế hoặc hủy; thao tác ban đầu chưa được xác nhận.');
    if (receipt.status !== 'success') throw new Error('Giao dịch đã revert. Phiếu chưa được chấp nhận.');
    setMessage(`Giao dịch được xác nhận tại block ${receipt.blockNumber}. Đây là confirmation depth, không phải settlement finality.`);
    return receipt;
  }
  async function signedRequest<T>(action: 'metadata' | 'index', payload: unknown, path: string, body?: unknown) {
    const { client, address } = await wallet();
    const challenge = await request<{ nonce: string; message: string; owner: Address }>('/admin/challenge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, digest: payloadHash(payload) }) });
    if (address.toLowerCase() !== challenge.owner.toLowerCase()) throw new Error('Chỉ ví chủ sở hữu hợp đồng được quản trị.');
    const signature = await client.signMessage({ account: address, message: challenge.message });
    return request<T>(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-nonce': challenge.nonce, 'x-admin-signature': signature }, ...(body ? { body: JSON.stringify(body) } : {}) });
  }
  function manifest() { return manifestSchema.parse({ title, description, candidates: names.split('\n').filter(Boolean).map(name => ({ name, biography: '' })) }); }
  async function saveMetadata(id: string, data: Manifest) {
    await signedRequest('metadata', { electionId: id, manifest: data }, `/admin/elections/${id}/metadata`, data);
    await refresh(); setMessage(`Đã lưu metadata của election ${id}, hash khớp với chain.`);
  }
  async function createOrUpdate(update: boolean) {
    const data = manifest();
    const from = BigInt(Math.floor(new Date(start).getTime() / 1000));
    const to = BigInt(Math.floor(new Date(end).getTime() / 1000));
    const receipt = await send(update ? encodeFunctionData({ abi: votingAbi, functionName: 'configureElection', args: [BigInt(electionId), from, to, data.candidates.length, payloadHash(data)] }) : encodeFunctionData({ abi: votingAbi, functionName: 'createElection', args: [from, to, data.candidates.length, payloadHash(data)] }));
    let id = electionId;
    if (!update) {
      for (const log of receipt.logs) {
        if (log.address.toLowerCase() !== config!.contractAddress.toLowerCase()) continue;
        const decoded = decodeEventLog({ abi: votingAbi, data: log.data, topics: log.topics });
        if (decoded.eventName === 'ElectionCreated') id = decoded.args.electionId.toString();
      }
    }
    setElectionId(id);
    await registerCandidates(id, data);
    try { await saveMetadata(id, data); } catch { throw new Error(`Election ${id} đã cập nhật trên chain, nhưng chưa lưu metadata. Giữ nguyên nội dung và dùng “Lưu lại thông tin”.`); }
  }
  async function registerCandidates(id: string, data: Manifest) {
    const { reader } = await wallet();
    const election = await reader.readContract({ address: config!.contractAddress, abi: votingAbi, functionName: 'getElection', args: [BigInt(id)] });
    if (election.manifestHash !== payloadHash(data)) throw new Error('Nội dung không khớp mã băm trên blockchain.');
    const hashes = data.candidates.slice(election.registeredCandidates).map(payloadHash);
    if (hashes.length) await send(encodeFunctionData({ abi: votingAbi, functionName: 'registerCandidates', args: [BigInt(id), hashes] }));
  }
  async function load(id: string) {
    const row = await request<Election>(`/elections/${id}${account ? `?voter=${account}` : ''}`);
    setSelected(row); setCandidate(0);
  }

  async function voteConfirmed() {
    if (!selected?.metadata || !config) return;
    const { reader, address } = await wallet();
    const data = encodeFunctionData({ abi: votingAbi, functionName: 'vote', args: [BigInt(selected.chain.id), candidate] });
    const gas = await reader.estimateGas({ account: address, to: config.contractAddress, data });
    const gasPrice = await reader.getGasPrice();
    if (!window.confirm(`Ứng viên: ${selected.metadata.candidates[candidate]!.name}\nVí: ${address}\nChain: ${config.chainId}\nGas ước tính: ${gas}\nPhí tham khảo: ${gas * gasPrice} wei\nLựa chọn công khai và không thể thay đổi. Xác nhận?`)) return;
    await send(data, address);
    setReceiptElection(selected.chain.id);
    await load(selected.chain.id);
    await refresh();
  }

  function resultsChart() {
    if (!selected) return null;
    return <div className="rounded-lg bg-emerald-50 p-3"><p>Tham gia: {selected.chain.totalVotes}/{selected.chain.eligibleCount} cử tri được cấp quyền</p>{selected.chain.counts.map((count, i) => <div key={i} className="result-row"><span>{selected.metadata?.candidates[i]?.name ?? `Ứng viên ${i}`}: {count}</span><progress max={Math.max(1, Number(selected.chain.totalVotes))} value={Number(count)} /></div>)}</div>;
  }

  function filters() {
    return <div className="filters"><label>Tìm cuộc bầu cử<input value={search} onChange={event => setSearch(event.target.value)} /></label><label>Trạng thái<select value={stateFilter} onChange={event => setStateFilter(event.target.value)}><option value="all">Tất cả</option>{Object.entries(stateLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>;
  }

  const visibleItems = items.filter(item => (stateFilter === 'all' || item.chain.state === stateFilter) && (item.metadata?.title ?? item.chain.id).toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));

  return <main>
    <header><div className="brand"><span className="mark">V</span><div>NGHIÊN CỨU HCMUT<span className="sub">BẦU CỬ BLOCKCHAIN · MVP 1</span></div></div><button disabled={busy} onClick={() => void run(async () => { await wallet(); setMessage('Đã kết nối ví. Chọn lại cuộc bầu cử để kiểm tra quyền bỏ phiếu.'); })}>{account ? `${account.slice(0, 6)}…${account.slice(-4)}` : 'Kết nối MetaMask'}</button></header>
    <section className="intro"><p className="eyebrow">BỎ PHIẾU CÔNG KHAI</p><h1>Mỗi phiếu bầu.<br /><em>Một bản ghi có thể kiểm tra.</em></h1><p>Thử nghiệm bầu cử trên blockchain cho nghiên cứu luận văn. Lựa chọn và địa chỉ ví trong MVP 1 được công khai; chỉ dùng dữ liệu giả lập.</p></section>
    <div className="status" role="status" aria-live="polite">{message}{txHash && <code>Hash: {txHash}{config?.explorerUrl && <a href={`${config.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer"> · Xem giao dịch</a>}</code>}{receiptElection && <p>Phiếu đã được xác nhận: cuộc bầu cử #{receiptElection}. Tải lại trạng thái để kiểm tra chain hiện tại.</p>}</div>
    <nav aria-label="Chức năng"><button className={tab === 'vote' ? 'active' : ''} onClick={() => setTab('vote')}>Bỏ phiếu & kết quả</button><button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>Quản trị bầu cử</button></nav>
    {tab === 'admin' && <Dashboard items={items} open={id => { setTab('vote'); void run(() => load(id)); }} />}
    {tab === 'vote' ? <div className="grid"><section className="panel"><div className="heading"><h2>Cuộc bầu cử</h2><button disabled={busy} onClick={() => void run(refresh)}>Làm mới</button></div>{items.length === 0 && <p className="muted">Chưa có cuộc bầu cử được lưu thông tin. Quản trị viên có thể tạo cuộc đầu tiên.</p>}{filters()}{visibleItems.map(item => <button className="election" key={item.chain.id} disabled={busy} onClick={() => void run(() => load(item.chain.id))}><span className="badge">{stateLabels[item.chain.state]}</span><strong>{item.metadata?.title ?? `Election ${item.chain.id} · metadata chưa xác minh`}</strong><span>{item.chain.totalVotes} phiếu · #{item.chain.id}</span></button>)}<label>Tra cứu trực tiếp mã cuộc bầu cử<input value={electionId} onChange={e => setElectionId(e.target.value)} inputMode="numeric" /></label><button disabled={busy || !electionId} onClick={() => void run(() => load(electionId))}>Đọc trạng thái từ chain</button></section>
      <section className="panel">{selected ? <><p className="eyebrow">{stateLabels[selected.chain.state]} · ELECTION {selected.chain.id}</p><h2>{selected.metadata?.title ?? 'Metadata chưa được xác minh'}</h2><p>{selected.metadata?.description}</p><p className="muted">{new Date(Number(selected.chain.startTime) * 1000).toLocaleString('vi-VN')} — {new Date(Number(selected.chain.endTime) * 1000).toLocaleString('vi-VN')}</p><fieldset disabled={busy || selected.chain.state !== 'Active' || !selected.metadata}><legend>Chọn một ứng viên</legend>{selected.chain.counts.map((count, index) => <label className="choice" key={index}><input type="radio" name="candidate" checked={candidate === index} onChange={() => setCandidate(index)} /><span>{selected.metadata?.candidates[index]?.name ?? `Ứng viên ${index}`}<small>{count} phiếu trên chain</small></span></label>)}</fieldset>{resultsChart()}<p>Quyền bỏ phiếu: {selected.chain.eligible === null ? 'Kết nối ví và tải lại' : selected.chain.eligible ? 'Được cấp quyền' : 'Chưa được cấp quyền'} · {selected.chain.hasVoted ? 'Đã bỏ phiếu' : 'Chưa ghi nhận phiếu của ví'}</p><button className="primary" disabled={busy || !account || selected.chain.state !== 'Active' || !selected.chain.eligible || !!selected.chain.hasVoted || !selected.metadata} onClick={() => void run(voteConfirmed)}>Xác nhận & gửi phiếu</button><p className="muted">Nguồn: blockchain · block {selected.chain.blockNumber}. Đọc lại sau thay đổi ví/mạng. Kết quả chỉ chính thức trong lifecycle khi finalized = true.</p></> : <div className="empty"><span>01 / LỰA CHỌN</span><h2>Chọn cuộc bầu cử</h2><p>Kiểm tra điều kiện, ứng viên và trạng thái trực tiếp từ smart contract.</p></div>}</section></div> : <section className="panel admin"><h2>Quản trị bằng ví chủ sở hữu</h2><p>Giao dịch cấu hình được ký trong ví. NestJS chỉ lưu metadata sau khi kiểm tra hash trên chain; không giữ khóa riêng của bạn.</p><div className="grid"><div><label>Tiêu đề<input value={title} onChange={e => setTitle(e.target.value)} /></label><label>Mô tả<textarea value={description} onChange={e => setDescription(e.target.value)} /></label><label>Ứng viên (mỗi dòng một tên)<textarea value={names} onChange={e => setNames(e.target.value)} /></label><label>Bắt đầu<input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} /></label><label>Kết thúc<input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} /></label><button className="primary" disabled={busy || !config || !start || !end} onClick={() => void run(() => createOrUpdate(false))}>Tạo cuộc bầu cử</button></div><div><label>Mã cuộc bầu cử<input value={electionId} onChange={e => setElectionId(e.target.value)} /></label><button disabled={busy || !electionId || !start || !end} onClick={() => void run(() => createOrUpdate(true))}>Cập nhật bản nháp</button><button disabled={busy || !electionId} onClick={() => void run(async () => { await registerCandidates(electionId, manifest()); await saveMetadata(electionId, manifest()); })}>Lưu lại thông tin</button><label>Ví cử tri giả lập (mỗi dòng một địa chỉ)<textarea value={voters} onChange={e => setVoters(e.target.value)} /></label>{[true, false].map(authorized => <button key={String(authorized)} disabled={busy || !electionId} onClick={() => void run(async () => { const addresses = [...new Set(voters.split(/\s+/).filter(Boolean).map(value => value.toLowerCase()))]; if (!addresses.every(a => /^0x[0-9a-fA-F]{40}$/.test(a))) throw new Error('Địa chỉ ví không hợp lệ.'); await send(encodeFunctionData({ abi: votingAbi, functionName: 'setEligibility', args: [BigInt(electionId), addresses as Address[], authorized] })); })}>{authorized ? 'Cấp quyền' : 'Thu hồi trước khi khóa'}</button>)}<div>{(['freeze', 'finalize'] as const).map(action => <button key={action} disabled={busy || !electionId} onClick={() => void run(async () => { await send(encodeFunctionData({ abi: votingAbi, functionName: action, args: [BigInt(electionId)] })); await refresh(); })}>{action === 'freeze' ? 'Khóa cấu hình' : 'Chốt kết quả sau khi đóng'}</button>)}</div><label>Lý do hủy<input value={reason} onChange={e => setReason(e.target.value)} /></label><button disabled={busy || !electionId || !reason} onClick={() => void run(async () => { if (window.confirm('Hủy cuộc bầu cử? Đây là trạng thái kết thúc.')) await send(encodeFunctionData({ abi: votingAbi, functionName: 'cancel', args: [BigInt(electionId), keccak256(stringToHex(reason))] })); await refresh(); })}>Hủy cuộc bầu cử</button><hr /><button disabled={busy} onClick={() => void run(async () => { const result = await signedRequest<{ records: number }>('index', {}, '/admin/index'); setMessage(`Đã đồng bộ ${result.records ?? 0} sự kiện từ blockchain.`); })}>Đồng bộ sự kiện blockchain</button></div></div></section>}
    <footer><span>HCMUT · Nghiên cứu luận văn thạc sĩ</span><span>{config ? `Chain ${config.chainId} · ${config.contractAddress}` : 'MVP 1 · Chỉ dùng phiếu giả lập, công khai'}</span></footer>
  </main>;
}

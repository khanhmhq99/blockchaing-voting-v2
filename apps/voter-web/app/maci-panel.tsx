'use client';

import { useEffect, useRef, useState } from 'react';
import { api, apiOrigin, ApiError, type AppUser } from './auth-client';
import { PortalShell, Notice, EmptyState } from './portal-shell';
import { createMaciCredential, encryptMaciVote, publicKeyFromSecret } from './maci-client';
import { findMaciJoin, generateMaciJoin } from './maci-join-client';
import { addLocalCredential, credentialId, readLocalCredential, type CredentialContext } from './maci-credential-store';
import { showToast } from './action-toast';
import { describeWorkflowFailure, nextAutomaticStep, voteBlockReason } from './maci-workflow';
import { maciStatusLabel } from './maci-status';
import { ChainStatus, ElectionOverview, ElectionStatus } from './election-overview';

type Election = {
  id: string; title: string; candidates: string[]; chainId: string; maciAddress: `0x${string}`;
  pollAddress: `0x${string}`; pollId: string; deploymentBlock: string; status: string;
  eligible: boolean; coordinatorKeyX: string; coordinatorKeyY: string; voteOptions: number;
  startTimestamp: string; endTimestamp: string; chainHealth?: string;
};
type Eligibility = { registration: { status: string; publicKeyX: string; publicKeyY: string } | null };
type Participation = { status: 'NOT_REGISTERED' | 'PENDING' | 'APPROVED' | 'REJECTED' };
type Submission = { id: string; status: string; transactionHash: string | null; pollStateIndex?: string | null; errorCode?: string | null };
type Audit = { tally: { results: { tally: string[] } }; manifest: { snapshotBlock: number; snapshotBlockHash: string } };
async function anonymousPost<T>(path: string, body: unknown, key: string): Promise<T> {
  const response = await fetch(`${apiOrigin}/v1${path}`, {
    method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof payload?.error?.code === 'string' ? payload.error.code : 'REQUEST_FAILED', payload?.error?.message ?? 'Encrypted MACI submission failed.');
  return payload as T;
}
async function anonymousGet<T>(path: string): Promise<T> {
  const response = await fetch(`${apiOrigin}/v1${path}`, { credentials: 'omit', cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(typeof payload?.error?.code === 'string' ? payload.error.code : 'REQUEST_FAILED', payload?.error?.message ?? 'MACI status is unavailable.');
  return payload as T;
}

export function MaciPanel({ view = 'dashboard', electionId }: { view?: 'dashboard' | 'elections' | 'details' | 'vote' | 'history' | 'results'; electionId?: string }) {
  const [userId, setUserId] = useState('');
  const [loadedCredentialId, setLoadedCredentialId] = useState('');
  const [credentialProblem, setCredentialProblem] = useState<'missing' | 'mismatch' | 'storage' | null>(null);
  const [elections, setElections] = useState<Election[]>([]);
  const [activeId, setActiveId] = useState('');
  const [eligibility, setEligibility] = useState<Eligibility>();
  const [participation, setParticipation] = useState<Participation>();
  const [participationByElection, setParticipationByElection] = useState<Record<string, string>>({});
  const [loadingParticipation, setLoadingParticipation] = useState(true);
  const [loadingElections, setLoadingElections] = useState(true);
  const secretRef = useRef('');
  const [credentialReady, setCredentialReady] = useState(false);
  const [candidate, setCandidate] = useState(0);
  const [joinIndex, setJoinIndex] = useState<string | null>(null);
  const [join, setJoin] = useState<Submission>();
  const [message, setMessage] = useState<Submission>();
  const [audit, setAudit] = useState<{ electionId: string; evidence: Audit }>();
  const [busy, setBusy] = useState(false);
  const [workflowBusy, setWorkflowBusy] = useState(false);
  const workflowLock = useRef(false);
  const workflowAttempt = useRef('');
  const workflowRetryAt = useRef(0);
  const workflowFailures = useRef(0);
  const voteLock = useRef(false);
  const [confirmVote, setConfirmVote] = useState(false);
  const [error, setError] = useState('');
  const [workflowError, setWorkflowError] = useState<{ electionId: string; step: 'register' | 'join'; message: string } | null>(null);
  const [notice, setNotice] = useState('');
  const active = elections.find(election => election.id === activeId);
  const credentialContext: CredentialContext | null = active && userId ? { userId, electionId: active.id, chainId: active.chainId, maciAddress: active.maciAddress } : null;
  const currentCredentialId = credentialContext ? credentialId(credentialContext) : '';
  const registrationMatches = !eligibility?.registration || (credentialReady && !!secretRef.current && (() => {
    const key = publicKeyFromSecret(secretRef.current);
    return key.publicKeyX === eligibility.registration.publicKeyX && key.publicKeyY === eligibility.registration.publicKeyY;
  })());

  useEffect(() => { void api<AppUser>('/auth/me').then(user => setUserId(user.id)).catch(() => {}); }, []);
  useEffect(() => {
    if (!credentialContext) return;
    let cancelled = false;
    secretRef.current = '';
    setCredentialReady(false); setCredentialProblem(null); setLoadedCredentialId(''); setEligibility(undefined); setJoinIndex(null); setJoin(undefined); setMessage(undefined); setAudit(undefined); setWorkflowError(null);
    workflowAttempt.current = ''; workflowRetryAt.current = 0;
    void readLocalCredential(credentialContext).then(record => {
      if (cancelled) return;
      if (record) {
        const publicKey = publicKeyFromSecret(record.secret);
        if (publicKey.publicKeyX !== record.publicKeyX || publicKey.publicKeyY !== record.publicKeyY) throw new Error('MACI_CREDENTIAL_INVALID');
        secretRef.current = record.secret;
        setCredentialReady(true);
      } else setCredentialProblem('missing');
    }).catch(() => { if (!cancelled) setCredentialProblem('storage'); }).finally(() => { if (!cancelled) setLoadedCredentialId(currentCredentialId); });
    return () => { cancelled = true; };
  }, [userId, activeId, active?.chainId, active?.maciAddress]);

  useEffect(() => {
    if (!eligibility || loadedCredentialId !== currentCredentialId || !credentialReady || !secretRef.current) return;
    const registration = eligibility.registration;
    if (!registration) { setCredentialProblem(null); return; }
    const key = publicKeyFromSecret(secretRef.current);
    if (registration.publicKeyX !== key.publicKeyX || registration.publicKeyY !== key.publicKeyY) {
      secretRef.current = ''; setCredentialReady(false); setCredentialProblem('mismatch');
    } else setCredentialProblem(null);
  }, [eligibility, loadedCredentialId, currentCredentialId, credentialReady]);

  useEffect(() => {
    let cancelled = false;
    const load = () => { void api<Election[]>('/maci/elections').then(rows => { if (!cancelled) { setElections(rows); setActiveId(current => electionId || current || rows[0]?.id || ''); Promise.all(rows.map(row => api<Participation>(`/maci/elections/${row.id}/my-participation`).then(result => [row.id, result.status] as const).catch(() => [row.id, ''] as const))).then(statuses => { if (!cancelled) { setParticipationByElection(Object.fromEntries(statuses)); setLoadingParticipation(false); } }); } }).catch(() => { if (!cancelled) setError('Không thể tải danh sách cuộc bỏ phiếu. Vui lòng thử lại.'); }).finally(() => { if (!cancelled) setLoadingElections(false); }); };
    load(); const timer = window.setInterval(load, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [electionId]);
  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    const load = () => {
      void api<Eligibility>(`/maci/elections/${activeId}/eligibility`)
        .then(result => { if (!cancelled) setEligibility(result); })
        .catch(() => { if (!cancelled) setError('Không thể tải trạng thái đăng ký MACI.'); });
      void api<Submission>(`/maci/elections/${activeId}/registration`).then(() => {
        void api<Eligibility>(`/maci/elections/${activeId}/eligibility`).then(result => { if (!cancelled) setEligibility(result); });
      }).catch(() => {});
      void api<Participation>(`/maci/elections/${activeId}/my-participation`)
        .then(result => { if (!cancelled) { setParticipation(result); setParticipationByElection(current => ({ ...current, [activeId]: result.status })); } })
        .catch(() => { if (!cancelled) setError('Không thể tải trạng thái tham gia.'); });
    };
    load(); const timer = window.setInterval(load, 15_000);
    return () => { cancelled = true; window.clearInterval(timer); };
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
        .catch(() => { if (!cancelled && request === requestNumber) { setAudit(undefined); setError('Không thể kiểm tra bằng chứng công khai. Kết quả đã được ẩn.'); } });
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    refresh();
    const interval = window.setInterval(refresh, 15_000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { cancelled = true; window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisibility); };
  }, [activeId, elections]);
  useEffect(() => {
    if (!join || !['PREPARED', 'PENDING'].includes(join.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void anonymousGet<Submission>(`/maci/joins/${join.id}`).then(result => {
        if (!cancelled) { setJoin(result); if (result.pollStateIndex) setJoinIndex(result.pollStateIndex); }
      }).catch(() => {});
    }, 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [join?.id, join?.status]);
  useEffect(() => {
    if (!message || !['PREPARED', 'PENDING'].includes(message.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      void anonymousGet<Submission>(`/maci/messages/${message.id}`).then(result => { if (!cancelled) setMessage(result); }).catch(() => {});
    }, 4_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [message?.id, message?.status]);

  useEffect(() => {
    if (!active || active.chainId !== (process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337') || !eligibility || loadedCredentialId !== currentCredentialId || !registrationMatches || credentialProblem === 'storage' || credentialProblem === 'mismatch' ||
      (eligibility.registration && !credentialReady) || !active.eligible || active.chainHealth !== 'AVAILABLE' || workflowLock.current) return;
    const registration = eligibility?.registration?.status;
    const step = nextAutomaticStep({ electionStatus: active.status, chainHealth: active.chainHealth, eligible: active.eligible, credentialUnlocked: credentialReady, registrationStatus: registration, joinStatus: join?.status, joinIndex });
    if (!step || Date.now() < workflowRetryAt.current) return;
    const attempt = `${active.id}:${step}:${registration ?? ''}`;
    if (workflowAttempt.current !== attempt) { workflowFailures.current = 0; workflowRetryAt.current = 0; workflowAttempt.current = attempt; }
    workflowLock.current = true; setWorkflowBusy(true);
    const work = async () => {
      if (step === 'register') await register();
      else {
        const rpcUrl = process.env.NEXT_PUBLIC_MACI_RPC_URL;
        if (!rpcUrl) throw new Error('MACI_PUBLIC_RPC_NOT_CONFIGURED');
        const index = await findMaciJoin({ secret: secretRef.current, rpcUrl, chainId: active.chainId, maciAddress: active.maciAddress, pollId: active.pollId, deploymentBlock: active.deploymentBlock });
        if (index) setJoinIndex(index);
        else await joinPoll();
      }
      workflowFailures.current = 0;
      workflowRetryAt.current = Date.now() + 15_000;
      setWorkflowError(null);
    };
    void work().catch(cause => {
      const failure = describeWorkflowFailure(step, cause);
      workflowFailures.current += 1;
      workflowRetryAt.current = failure.retryable ? Date.now() + Math.min(120_000, 5_000 * 2 ** workflowFailures.current) : Number.POSITIVE_INFINITY;
      setWorkflowError({ electionId: active.id, step, message: failure.message });
    }).finally(() => { workflowLock.current = false; setWorkflowBusy(false); });
  }, [active, eligibility, credentialReady, credentialProblem, registrationMatches, loadedCredentialId, currentCredentialId, joinIndex, join]);

  async function run(work: () => Promise<void>, successMessage = 'Thao tác đã hoàn tất.') {
    setBusy(true); setError(''); setNotice('');
    const toastId = showToast('loading', 'Đang xử lý yêu cầu…');
    try {
      if (active?.chainId !== (process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337')) throw new Error('MACI_RPC_CHAIN_MISMATCH');
      await work(); showToast('success', successMessage, toastId);
    } catch (cause) {
      if (cause instanceof Error && cause.message === 'MACI_RPC_CHAIN_MISMATCH') {
        setError('Cuộc bỏ phiếu này không thuộc mạng của bản web đang chạy.');
        showToast('error', 'Sai mạng blockchain.', toastId);
        return;
      }
      setError('Không thể hoàn tất thao tác. Hãy kiểm tra trạng thái và thử lại.');
      showToast('error', 'Không thể hoàn tất thao tác.', toastId);
    } finally { setBusy(false); }
  }
  async function register() {
    if (!active || !credentialContext || !eligibility || loadedCredentialId !== currentCredentialId) throw new Error('MACI_CREDENTIAL_NOT_READY');
    if (active.chainId !== (process.env.NEXT_PUBLIC_CHAIN_ID ?? '31337')) throw new Error('MACI_RPC_CHAIN_MISMATCH');
    // Recheck the server record before generating. An existing authorization
    // binds voting rights to its original public key even if local data is lost.
    const latest = await api<Eligibility>(`/maci/elections/${active.id}/eligibility`);
    setEligibility(latest);
    let secret = secretRef.current;
    if (latest.registration) {
      if (!secret) throw new Error('MACI_CREDENTIAL_MISSING');
      const stored = publicKeyFromSecret(secret);
      if (stored.publicKeyX !== latest.registration.publicKeyX || stored.publicKeyY !== latest.registration.publicKeyY) throw new Error('MACI_CREDENTIAL_MISMATCH');
    } else if (!secret) {
      const created = createMaciCredential();
      try {
        await addLocalCredential({ version: 1, context: credentialContext, ...created });
        secret = created.secret;
      } catch {
        // Another tab may have won the atomic insert. Use that exact key.
        const existing = await readLocalCredential(credentialContext);
        if (!existing) throw new Error('MACI_CREDENTIAL_STORAGE_UNAVAILABLE');
        const existingPublic = publicKeyFromSecret(existing.secret);
        if (existingPublic.publicKeyX !== existing.publicKeyX || existingPublic.publicKeyY !== existing.publicKeyY) throw new Error('MACI_CREDENTIAL_INVALID');
        secret = existing.secret;
      }
      secretRef.current = secret;
      setCredentialReady(true); setCredentialProblem(null);
    }
    const key = publicKeyFromSecret(secret);
    const current = await api<Eligibility>(`/maci/elections/${active.id}/eligibility`);
    if (current.registration && (current.registration.publicKeyX !== key.publicKeyX || current.registration.publicKeyY !== key.publicKeyY)) throw new Error('MACI_CREDENTIAL_MISMATCH');
    if (current.registration?.status === 'CONFIRMED' || current.registration?.status === 'PENDING') { setEligibility(current); return; }
    await api(`/maci/elections/${active.id}/authorization`, { method: 'POST', body: JSON.stringify({ x: key.publicKeyX, y: key.publicKeyY }) });
    const result = await api<Submission>(`/maci/elections/${active.id}/registration`, { method: 'POST' });
    setNotice(`Đăng ký MACI: ${result.status}. ${result.transactionHash ?? ''}`);
    setEligibility(await api<Eligibility>(`/maci/elections/${active.id}/eligibility`));
  }
  async function requestParticipation() {
    if (!active) return;
    await api(`/maci/elections/${active.id}/participation`, { method: 'POST' });
    const result = await api<Participation>(`/maci/elections/${active.id}/my-participation`);
    setParticipation(result); setParticipationByElection(current => ({ ...current, [active.id]: result.status }));
    setNotice('Đã gửi yêu cầu tham gia. Quản trị viên cần phê duyệt trước khi đăng ký MACI.');
  }
  async function discoverJoin() {
    const secret = secretRef.current;
    if (!active || !secret) throw new Error('Restore the MACI credential first.');
    const rpcUrl = process.env.NEXT_PUBLIC_MACI_RPC_URL;
    if (!rpcUrl) throw new Error('MACI_PUBLIC_RPC_NOT_CONFIGURED');
    const index = await findMaciJoin({ secret, rpcUrl, chainId: active.chainId, maciAddress: active.maciAddress, pollId: active.pollId, deploymentBlock: active.deploymentBlock });
    setJoinIndex(index);
    setNotice(index ? `Đã tham gia poll với state index ${index}.` : 'Chưa tìm thấy giao dịch tham gia poll đã xác nhận.');
  }
  async function joinPoll() {
    const secret = secretRef.current;
    if (!active || !secret || !credentialReady) throw new Error('MACI_CREDENTIAL_MISSING');
    const rpcUrl = process.env.NEXT_PUBLIC_MACI_RPC_URL;
    if (!rpcUrl) throw new Error('MACI_PUBLIC_RPC_NOT_CONFIGURED');
    const generated = await generateMaciJoin({ secret, rpcUrl, chainId: active.chainId, maciAddress: active.maciAddress, pollAddress: active.pollAddress, pollId: active.pollId, deploymentBlock: active.deploymentBlock });
    let result: Submission;
    try { result = await anonymousPost<Submission>(`/maci/elections/${active.id}/joins`, generated.body, generated.idempotencyKey); }
    catch (cause) {
      if (cause instanceof ApiError && cause.code === 'MACI_ALREADY_JOINED') {
        await discoverJoin();
        return;
      }
      throw cause;
    }
    setJoin(result); setJoinIndex(result.pollStateIndex ?? null);
    setNotice(`Tham gia poll: ${result.status}. ${result.transactionHash ?? ''}`);
  }
  async function submitVote() {
    if (voteLock.current) return;
    voteLock.current = true;
    try {
    const secret = secretRef.current;
    if (!active || !secret || !credentialReady || !registrationMatches || loadedCredentialId !== currentCredentialId || !joinIndex || !active.eligible || active.chainHealth !== 'AVAILABLE' || active.status !== 'OPEN' || eligibility?.registration?.status !== 'CONFIRMED') throw new Error('A confirmed poll join is required.');
    const encrypted = encryptMaciVote({ secret, pollId: active.pollId, pollStateIndex: joinIndex, candidateIndex: candidate, nonce: 1, coordinatorKeyX: active.coordinatorKeyX, coordinatorKeyY: active.coordinatorKeyY, voteOptions: active.voteOptions, chainId: active.chainId, pollAddress: active.pollAddress });
    const result = await anonymousPost<Submission>(`/maci/elections/${active.id}/messages`, { data: encrypted.message.data, encryptionPublicKey: encrypted.encryptionPublicKey }, encrypted.idempotencyKey);
    setMessage(result);
    } finally { voteLock.current = false; }
  }

  const voteReason = active ? voteBlockReason({
    chainId: active.chainId, electionStatus: active.status, chainHealth: active.chainHealth, eligible: active.eligible,
    credentialReady: credentialReady && loadedCredentialId === currentCredentialId,
    registrationMatches, registrationStatus: eligibility?.registration?.status, joinStatus: join?.status, joinIndex,
  }) : null;
  const title = ({ dashboard: 'Tổng quan', elections: 'Cuộc bỏ phiếu', details: 'Chi tiết cuộc bỏ phiếu', vote: 'Bỏ phiếu', history: 'Lịch sử tham gia', results: 'Kết quả xác minh' } as const)[view];
  const showList = view === 'dashboard' || view === 'elections' || view === 'history';
  const showDetail = view === 'details' || view === 'vote' || view === 'results';
  const visibleWorkflowError = active && workflowError?.electionId === active.id &&
    (workflowError.step === 'register' ? active.status === 'REGISTRATION' : active.status === 'OPEN') ? workflowError.message : null;
  return <PortalShell role="USER" title={title} description="Xem cuộc bỏ phiếu, trạng thái tham gia và kết quả.">
    {error && <Notice kind="error">{error}</Notice>}{visibleWorkflowError && <Notice kind="error">{visibleWorkflowError}</Notice>}{notice && <Notice>{notice}</Notice>}
    {view === 'history' && <Notice>Lịch sử này chỉ hiển thị trạng thái tham gia của tài khoản. Thông điệp bỏ phiếu được gửi ẩn danh nên không liên kết với hồ sơ và không hiển thị lựa chọn cá nhân.</Notice>}
    {eligibility?.registration?.status === 'FAILED' && <Notice kind="error">Đăng ký MACI trên chuỗi thất bại. Cần đối soát giao dịch trước khi tiếp tục.</Notice>}
    {join?.status === 'FAILED' && <Notice kind="error">Giao dịch tham gia poll thất bại. Hãy kiểm tra trạng thái chuỗi và liên hệ quản trị viên trước khi tiếp tục.</Notice>}
    {view === 'dashboard' && !loadingElections && !loadingParticipation && elections.length > 0 && <div className="summary-grid" aria-label="Tổng quan của bạn">
      {([['Đang diễn ra', elections.filter(row => row.status === 'OPEN').length], ['Có thể đăng ký', elections.filter(row => row.status === 'REGISTRATION' && row.chainHealth === 'AVAILABLE' && participationByElection[row.id] === 'NOT_REGISTERED').length], ['Chờ phê duyệt', Object.values(participationByElection).filter(status => status === 'PENDING').length], ['Đã được phê duyệt', Object.values(participationByElection).filter(status => status === 'APPROVED').length]] as const).map(([label, value]) => <div className="summary-card" key={label}><span>{label}</span><strong>{value}</strong></div>)}
    </div>}
    {loadingElections ? <div className="election-card-grid" role="status" aria-label="Đang tải cuộc bỏ phiếu">{[0, 1, 2].map(index => <div key={index} className="election-card skeleton-card" />)}</div> : !elections.length ? <EmptyState title="Chưa có cuộc bỏ phiếu nào" /> : <>
      {showList && <div className="election-card-grid">{elections.map(election => <article key={election.id} className="election-card"><div className="election-card-top"><ElectionStatus status={election.status} /><ChainStatus health={election.chainHealth} /></div><h2>{election.title}</h2><p className="election-participation"><strong>Quyền tham gia:</strong> {maciStatusLabel(participationByElection[election.id])}</p><dl><div><dt>Bắt đầu</dt><dd>{new Date(Number(election.startTimestamp) * 1000).toLocaleString('vi-VN')}</dd></div><div><dt>Kết thúc</dt><dd>{new Date(Number(election.endTimestamp) * 1000).toLocaleString('vi-VN')}</dd></div></dl><a className="election-card-action" href={`/user/elections/detail?id=${encodeURIComponent(election.id)}`}>Xem cuộc bỏ phiếu</a></article>)}</div>}
      {showDetail && !active && <EmptyState title="Không tìm thấy cuộc bỏ phiếu" />}
      {showDetail && active && <ElectionOverview election={active} participation={participation?.status}><nav className="detail-links" aria-label="Điều hướng cuộc bỏ phiếu"><a aria-current={view === 'details' ? 'page' : undefined} href={`/user/elections/detail?id=${encodeURIComponent(active.id)}`}>Thông tin</a><a aria-current={view === 'vote' ? 'page' : undefined} href={`/user/elections/vote?id=${encodeURIComponent(active.id)}`}>Bỏ phiếu</a><a aria-current={view === 'results' ? 'page' : undefined} href={`/user/elections/results?id=${encodeURIComponent(active.id)}`}>Kết quả</a></nav>{active.chainHealth !== 'AVAILABLE' && <Notice kind="error">Chưa thể kiểm tra cuộc bỏ phiếu trên hệ thống. Các thao tác đang tạm dừng; hãy thử lại sau hoặc liên hệ quản trị viên.</Notice>}</ElectionOverview>}
      {showDetail && active && view === 'details' && <div className="app-card"><h2>Tham gia</h2>{!active.eligible && participation?.status === 'NOT_REGISTERED' && active.status === 'REGISTRATION' && active.chainHealth === 'AVAILABLE' && <button className="primary" disabled={busy} onClick={() => void run(requestParticipation)}>Yêu cầu tham gia</button>}{participation?.status === 'PENDING' && <Notice>Yêu cầu đang chờ quản trị viên phê duyệt.</Notice>}{participation?.status === 'REJECTED' && <Notice kind="error">Yêu cầu đã bị từ chối.</Notice>}{active.eligible && <Notice kind="success">Bạn đã được phê duyệt. Hệ thống sẽ tự hoàn tất đăng ký MACI trên thiết bị này.</Notice>}</div>}
      {showDetail && active && (view === 'details' || view === 'vote') && active.eligible && <div className="app-card"><h2>Tiến độ</h2><p>Đăng ký MACI: <strong>{maciStatusLabel(eligibility?.registration?.status)}</strong></p><p>Tham gia poll: <strong>{joinIndex ? 'Đã xác nhận' : join?.status ?? 'Chưa xác nhận'}</strong></p>{workflowBusy && <Notice>Đang hoàn tất đăng ký hoặc tham gia cuộc bỏ phiếu. Vui lòng giữ trang mở.</Notice>}{loadedCredentialId === currentCredentialId && !!eligibility?.registration && !credentialReady && credentialProblem === 'missing' && <Notice kind="error">Thiết bị này không còn khóa bỏ phiếu đã đăng ký. Không thể dùng credential hiện tại để bỏ phiếu. Vui lòng dùng trình duyệt và hồ sơ thiết bị ban đầu hoặc liên hệ quản trị viên về quy trình khôi phục trong tương lai. Đăng nhập lại hay đặt lại mật khẩu tài khoản không khôi phục được khóa.</Notice>}{credentialProblem === 'mismatch' && <Notice kind="error">Khóa lưu trên thiết bị không khớp với đăng ký MACI. Bỏ phiếu đã được tạm dừng; vui lòng liên hệ quản trị viên.</Notice>}{credentialProblem === 'storage' && <Notice kind="error">Không thể đọc kho khóa trên trình duyệt. Bỏ phiếu đã được tạm dừng; kiểm tra quyền lưu trữ của trình duyệt.</Notice>}</div>}
      {showDetail && active && view === 'vote' && <div className="app-card"><h2>Chọn ứng viên</h2><p>Lựa chọn được ký và mã hóa trong trình duyệt. Một thông điệp mới hợp lệ có thể thay lựa chọn cũ trước khi poll đóng.</p><fieldset disabled={busy || workflowBusy}>{active.candidates.map((name, index) => <label key={index} className="candidate-choice"><input type="radio" name="candidate" checked={candidate === index} onChange={() => setCandidate(index)} />{name}</label>)}</fieldset><button className="primary" disabled={busy || workflowBusy || !!voteReason} onClick={() => setConfirmVote(true)}>Bỏ phiếu</button>{voteReason && <Notice kind="error">Chưa thể bỏ phiếu: {voteReason}</Notice>}{message && <Notice kind={message.status === 'FAILED' ? 'error' : 'info'}>Thông điệp mã hóa: {message.status === 'INCLUDED' ? 'Đã ghi trên chuỗi. Kết quả chỉ có sau khi poll đóng, coordinator xử lý và proof được xác minh.' : message.status === 'PENDING' ? 'Giao dịch đang chờ xác nhận trên chuỗi.' : message.status === 'FAILED' ? 'Giao dịch thất bại; thông điệp chưa được ghi trên chuỗi.' : maciStatusLabel(message.status)} {message.transactionHash && <code>{message.transactionHash}</code>}</Notice>}</div>}
      {showDetail && active && view === 'results' && <div className="app-card"><h2>Kết quả</h2>{active.status === 'CLOSED' && <Notice>Poll đã đóng. Đang chờ xử lý và xác minh proof.</Notice>}{active.status === 'VERIFIED' && audit?.electionId !== active.id && <Notice kind="error">Chưa tải được bằng chứng công khai đã xác minh. Kết quả đang được ẩn.</Notice>}{active.status === 'VERIFIED' && audit?.electionId === active.id && <><p>Snapshot block {audit.evidence.manifest.snapshotBlock}.</p><ul>{active.candidates.map((name, index) => <li key={index}>{name}: {audit.evidence.tally.results.tally[index] ?? '0'}</li>)}</ul><a href={`${apiOrigin}/v1/maci/elections/${active.id}/audit`}>Xem bằng chứng kiểm toán</a></>}{active.status !== 'CLOSED' && active.status !== 'VERIFIED' && <EmptyState title="Chưa có kết quả đã xác minh" />}</div>}
    </>}
    {confirmVote && active && <VoteDialog candidate={active.candidates[candidate] ?? ''} onCancel={() => setConfirmVote(false)} onConfirm={() => { setConfirmVote(false); void run(submitVote, 'Đã gửi thông điệp mã hóa. Theo dõi trạng thái giao dịch bên dưới.'); }} />}
  </PortalShell>;
}

function VoteDialog({ candidate, onCancel, onConfirm }: { candidate: string; onCancel(): void; onConfirm(): void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = dialogRef.current; if (dialog && !dialog.open) dialog.showModal(); }, []);
  return <dialog ref={dialogRef} className="review-dialog" onClose={onCancel}><h2>Xác nhận bỏ phiếu</h2><p>Bạn đã chọn <strong>{candidate}</strong>. Lựa chọn sẽ được mã hóa trên thiết bị này.</p><div className="form-actions"><button onClick={onCancel}>Hủy</button><button className="primary" onClick={onConfirm}>Xác nhận và gửi</button></div></dialog>;
}

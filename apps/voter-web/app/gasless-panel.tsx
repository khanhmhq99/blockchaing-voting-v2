'use client';

import { useEffect, useRef, useState } from 'react';
import type { Address, Hex } from 'viem';
import { relayRequest, signVotingIntent, type GaslessReceipt } from './gasless-client';

type Props = { api: string; config: { chainId: number; contractAddress: Address; explorerUrl: string | null }; account: Address | undefined; election: { id: string; manifestHash: Hex }; candidate: number; candidateName: string; disabled: boolean; onChainChange(): Promise<void>; onBusyChange(busy: boolean): void };
const labels: Record<string, string> = { QUEUED: 'Đang xác minh yêu cầu và chờ relayer', SUBMITTED: 'Đang gửi giao dịch', PENDING: 'Đang chờ blockchain xác nhận', CONFIRMED: 'Bỏ phiếu thành công', FAILED: 'Không thể hoàn tất bỏ phiếu', REJECTED: 'Yêu cầu chưa được tài trợ' };

export function GaslessPanel({ api, config, account, election, candidate, candidateName, disabled, onChainChange, onBusyChange }: Props) {
  const key = `gasless:${config.chainId}:${config.contractAddress.toLowerCase()}:${election.id}:${account?.toLowerCase() ?? 'disconnected'}`;
  const [requestId, setRequestId] = useState<string>();
  const [receipt, setReceipt] = useState<GaslessReceipt>();
  const [message, setMessage] = useState('Chỉ ký lựa chọn; relayer sẽ thanh toán phí blockchain.');
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const lastStatus = useRef('');
  const refreshChain = useRef(onChainChange);
  useEffect(() => { refreshChain.current = onChainChange; }, [onChainChange]);
  useEffect(() => { generation.current++; return () => { generation.current++; }; }, [account, config.chainId, config.contractAddress, election.id]);
  useEffect(() => {
    const id = localStorage.getItem(key); if (id) setRequestId(id);
    else {
      const digest = localStorage.getItem(`${key}:intent`);
      if (digest) void relayRequest<GaslessReceipt>(api, `/intents/${digest}`).then(row => { localStorage.setItem(key, row.id); setRequestId(row.id); }).catch(() => setMessage('Lần gửi trước chưa có mã yêu cầu. Kiểm tra trạng thái cuộc bầu cử trước khi ký lại.'));
    }
  }, [api, key]);
  useEffect(() => {
    if (!requestId) return;
    let disposed = false;
    async function poll() {
      try {
        const next = await relayRequest<GaslessReceipt>(api, `/votes/${requestId}`);
        if (disposed) return;
        if (next.chainId !== String(config.chainId) || next.contractAddress.toLowerCase() !== config.contractAddress.toLowerCase() || next.electionId !== election.id) throw new Error('Biên nhận không khớp cuộc bầu cử.');
        setReceipt(next); setMessage(`${labels[next.status] ?? next.status}${next.errorCode ? ` · ${next.errorCode}` : ''}`);
        if (next.status !== lastStatus.current) {
          const previous = lastStatus.current; lastStatus.current = next.status;
          if (next.status === 'CONFIRMED' || previous === 'CONFIRMED') await refreshChain.current();
        }
      } catch (error) { if (!disposed) setMessage(`Chưa đọc được trạng thái. Yêu cầu ${requestId} vẫn được lưu; hệ thống sẽ kiểm tra lại. ${error instanceof Error ? error.message : ''}`); }
    }
    void poll(); const timer = setInterval(() => void poll(), 1500);
    return () => { disposed = true; clearInterval(timer); };
  }, [api, config.chainId, config.contractAddress, election.id, requestId]);
  async function submit() {
    if (inFlight.current || !account) return;
    if (!window.confirm(`Ứng viên: ${candidateName}\nCuộc bầu cử: ${election.id}\nVí: ${account}\nBạn chỉ ký EIP-712; hệ thống trả phí. Lựa chọn công khai, không thể đổi sau khi chấp nhận. Xác nhận?`)) return;
    inFlight.current = true; setBusy(true); onBusyChange(true); const current = generation.current;
    try {
      setMessage('Đang chờ xác nhận chữ ký');
      const signed = await signVotingIntent(api, config, election, candidate, account);
      if (current !== generation.current) throw new Error('Ví hoặc cuộc bầu cử đã thay đổi. Chưa gửi yêu cầu.');
      localStorage.setItem(`${key}:intent`, signed.digest);
      setMessage('Đang xác minh yêu cầu');
      const result = await relayRequest<GaslessReceipt>(api, '/votes', { method: 'POST', headers: { 'Content-Type': 'application/json', 'idempotency-key': signed.digest }, body: JSON.stringify(signed.body) });
      localStorage.setItem(key, result.id); setRequestId(result.id); setReceipt(result);
      setMessage(labels[result.status] ?? result.status);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể hoàn tất bỏ phiếu.'); }
    finally { setBusy(false); onBusyChange(false); inFlight.current = false; }
  }
  const active = !!requestId && !['REJECTED', 'FAILED'].includes(receipt?.status ?? '');
  return <section aria-label="Gasless Voting"><h3>Gasless Voting · MVP 2</h3><p>Bạn không cần có ETH hoặc token để bỏ phiếu. Phí giao dịch blockchain sẽ được hệ thống hỗ trợ.</p>
    <p>Ứng viên sẽ ký: <strong>{candidateName}</strong></p>
    <button className="primary" disabled={disabled || busy || active} onClick={() => void submit()}>Xác nhận bỏ phiếu</button>
    <p role="status" aria-live="polite">{message}</p>
    {requestId && <p>Mã yêu cầu: <code>{requestId}</code></p>}
    {receipt?.transactionHash && <p>Hash: <code>{receipt.transactionHash}</code>{config.explorerUrl && <a href={`${config.explorerUrl}/tx/${receipt.transactionHash}`} target="_blank" rel="noopener noreferrer">Xem giao dịch</a>}</p>}
    {receipt?.status === 'CONFIRMED' && <p>Biên nhận: block {receipt.blockNumber} · gas {receipt.gasUsed} · phí relayer {receipt.transactionFee} wei · phí cử tri 0 wei. Trạng thái tiếp tục được kiểm tra khi trang mở; confirmation depth không phải settlement finality.</p>}
    {receipt && ['REJECTED', 'FAILED'].includes(receipt.status) && <button onClick={() => { localStorage.removeItem(key); localStorage.removeItem(`${key}:intent`); setRequestId(undefined); setReceipt(undefined); }}>Kiểm tra và ký yêu cầu mới</button>}
  </section>;
}

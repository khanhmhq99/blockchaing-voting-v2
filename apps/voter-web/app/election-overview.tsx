import type { ReactNode } from 'react';
import { CalendarDays, CheckCircle2, CircleAlert, Clock3, ShieldCheck, UsersRound, Vote } from 'lucide-react';
import { maciStatusLabel } from './maci-status';

type ElectionInfo = {
  title: string;
  status: string;
  chainHealth?: string;
  startTimestamp: string;
  endTimestamp: string;
  candidates?: string[];
};

export function ElectionStatus({ status }: { status: string }) {
  const tone = status === 'OPEN' || status === 'VERIFIED' ? 'success' : status === 'REGISTRATION' ? 'warning' : '';
  const Icon = status === 'OPEN' ? Vote : status === 'VERIFIED' ? CheckCircle2 : Clock3;
  const label = ({ REGISTRATION: 'Đang nhận đăng ký', OPEN: 'Đang bỏ phiếu', CLOSED: 'Đã đóng bỏ phiếu', VERIFIED: 'Kết quả đã xác minh' } as Record<string, string>)[status] ?? maciStatusLabel(status);
  return <span className={`status-pill election-status ${tone}`}><Icon size={14} aria-hidden="true" />{label}</span>;
}

export function ChainStatus({ health }: { health: string | undefined }) {
  const available = health === 'AVAILABLE';
  const Icon = available ? ShieldCheck : CircleAlert;
  return <span className={`status-pill election-status ${available ? 'success' : 'error'}`}><Icon size={14} aria-hidden="true" />{available ? 'Chuỗi đã kiểm tra' : 'Chưa kiểm tra được chuỗi'}</span>;
}

export function ElectionOverview({ election, participation, children }: {
  election: ElectionInfo;
  participation?: string | undefined;
  children?: ReactNode;
}) {
  return <section className="app-card election-overview" aria-label={`Tóm tắt ${election.title}`}>
    <div className="election-overview-heading"><div><p className="election-kicker">CUỘC BỎ PHIẾU</p><h2>{election.title}</h2></div><div className="election-card-top"><ElectionStatus status={election.status} /><ChainStatus health={election.chainHealth} /></div></div>
    <dl className="election-facts">
      <div><dt><CalendarDays size={16} aria-hidden="true" />Bắt đầu</dt><dd>{new Date(Number(election.startTimestamp) * 1000).toLocaleString('vi-VN')}</dd></div>
      <div><dt><Clock3 size={16} aria-hidden="true" />Kết thúc</dt><dd>{new Date(Number(election.endTimestamp) * 1000).toLocaleString('vi-VN')}</dd></div>
      {participation && <div><dt><UsersRound size={16} aria-hidden="true" />Quyền tham gia</dt><dd>{maciStatusLabel(participation)}</dd></div>}
      {election.candidates && <div><dt><Vote size={16} aria-hidden="true" />Ứng viên</dt><dd>{election.candidates.join(' · ')}</dd></div>}
    </dl>
    {children}
  </section>;
}

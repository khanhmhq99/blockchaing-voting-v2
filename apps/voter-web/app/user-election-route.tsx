'use client';
import { useSearchParams } from 'next/navigation';
import { MaciPanel } from './maci-panel';
export function UserElectionRoute({ view }: { view: 'details' | 'vote' | 'results' }) {
  const id = useSearchParams().get('id');
  return id ? <MaciPanel view={view} electionId={id} /> : <main><p>Thiếu mã cuộc bỏ phiếu.</p><a href="/user/elections">Xem danh sách</a></main>;
}

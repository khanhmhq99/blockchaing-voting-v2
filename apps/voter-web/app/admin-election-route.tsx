'use client';
import { useSearchParams } from 'next/navigation';
import { MaciAdminPanel } from './maci-admin-panel';
export function AdminElectionRoute({ view }: { view: 'details' | 'participants' | 'results' }) {
  const id = useSearchParams().get('id');
  return id ? <MaciAdminPanel view={view} electionId={id} /> : <main><p>Thiếu mã cuộc bỏ phiếu.</p><a href="/admin/elections">Xem danh sách</a></main>;
}

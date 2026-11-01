'use client';

import { useMemo, useState } from 'react';
import { ChainStatus, ElectionStatus } from './election-overview';

export type ElectionSummary = { id: string; title: string; status: string; chainHealth?: string; startTimestamp: string; endTimestamp: string };
type Filter = 'all' | 'registration' | 'open' | 'ended';

export function ElectionCards<T extends ElectionSummary>({ rows, selectedId, onSelect, participation }: {
  rows: T[]; selectedId: string; onSelect(id: string): void; participation?: Record<string, string>;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'soonest' | 'latest'>('soonest');
  const [limit, setLimit] = useState(9);
  const visible = useMemo(() => rows.filter(row => {
    const matches = filter === 'all' || (filter === 'registration' && row.status === 'REGISTRATION') ||
      (filter === 'open' && row.status === 'OPEN') || (filter === 'ended' && ['CLOSED', 'VERIFIED'].includes(row.status));
    return matches && row.title.toLocaleLowerCase('vi').includes(search.trim().toLocaleLowerCase('vi'));
  }).sort((a, b) => sort === 'soonest' ? Number(a.startTimestamp) - Number(b.startTimestamp) : Number(b.startTimestamp) - Number(a.startTimestamp)), [rows, filter, search, sort]);
  return <section className="app-card" aria-label="Danh sách cuộc bỏ phiếu">
    <div className="section-heading"><div><h2>Cuộc bỏ phiếu</h2><p>Xem trạng thái và thời gian, sau đó chọn cuộc cần quản lý.</p></div><span className="status-pill">{rows.length} cuộc</span></div>
    <div className="election-toolbar"><div className="filter-tabs" role="group" aria-label="Lọc cuộc bỏ phiếu">
      {([['all', 'Tất cả'], ['registration', 'Đang đăng ký'], ['open', 'Đang diễn ra'], ['ended', 'Đã kết thúc']] as const).map(([value, label]) =>
        <button key={value} type="button" className={filter === value ? 'selected' : ''} aria-pressed={filter === value} onClick={() => { setFilter(value); setLimit(9); }}>{label}</button>)}
    </div><label className="visually-labeled">Tìm theo tên<input type="search" placeholder="Tìm cuộc bỏ phiếu" value={search} onChange={event => { setSearch(event.target.value); setLimit(9); }} /></label>
    <label className="visually-labeled">Sắp xếp<select value={sort} onChange={event => { setSort(event.target.value as typeof sort); setLimit(9); }}><option value="soonest">Bắt đầu sớm nhất</option><option value="latest">Bắt đầu gần đây</option></select></label></div>
    {visible.length ? <div className="election-card-grid">{visible.slice(0, limit).map(row => <article key={row.id} className={`election-card ${selectedId === row.id ? 'is-selected' : ''}`}>
      <div className="election-card-top"><ElectionStatus status={row.status} /><ChainStatus health={row.chainHealth} /></div>
      <h3>{row.title}</h3><dl><div><dt>Bắt đầu</dt><dd>{new Date(Number(row.startTimestamp) * 1000).toLocaleString('vi-VN')}</dd></div><div><dt>Kết thúc</dt><dd>{new Date(Number(row.endTimestamp) * 1000).toLocaleString('vi-VN')}</dd></div></dl>
      {participation?.[row.id] && <p className="election-participation"><strong>Quyền tham gia:</strong> {({ NOT_REGISTERED: 'Chưa đăng ký', PENDING: 'Chờ phê duyệt', APPROVED: 'Đã phê duyệt', REJECTED: 'Đã từ chối' } as Record<string, string>)[participation[row.id] ?? ''] ?? participation[row.id]}</p>}
      <button type="button" className={selectedId === row.id ? '' : 'primary'} onClick={() => onSelect(row.id)} aria-current={selectedId === row.id ? 'true' : undefined}>{selectedId === row.id ? 'Đang xem chi tiết' : 'Xem chi tiết'}</button>
    </article>)}</div> : <div className="empty-state"><strong>Không có cuộc bỏ phiếu phù hợp</strong><p>Thử tên tìm kiếm hoặc bộ lọc khác.</p></div>}
    {visible.length > limit && <button type="button" className="load-more" onClick={() => setLimit(current => current + 9)}>Xem thêm {Math.min(9, visible.length - limit)} cuộc bỏ phiếu</button>}
  </section>;
}

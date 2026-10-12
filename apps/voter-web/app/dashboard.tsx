type Row = { chain: { id: string; state: string; eligibleCount: string; totalVotes: string }; metadata: { title: string } | null };

export function Dashboard({ items, open }: { items: Row[]; open(id: string): void }) {
  const eligible = items.reduce((sum, item) => sum + BigInt(item.chain.eligibleCount), 0n);
  const accepted = items.reduce((sum, item) => sum + BigInt(item.chain.totalVotes), 0n);
  const participation = eligible ? Number(accepted * 10000n / eligible) / 100 : 0;
  return <section className="panel"><h2>Tổng quan bầu cử</h2><div className="metrics">
    <div><strong>{items.length}</strong><span>Cuộc bầu cử đã tải</span></div>
    <div><strong>{items.filter(item => item.chain.state === 'Active').length}</strong><span>Đang mở</span></div>
    <div><strong>{eligible.toString()}</strong><span>Lượt cử tri được cấp quyền</span></div>
    <div><strong>{accepted.toString()}</strong><span>Phiếu được chấp nhận</span></div>
    <div><strong>{participation}%</strong><span>Tỷ lệ tham gia</span></div>
  </div><p className="muted">Tổng hợp tối đa 100 cuộc bầu cử đã lưu metadata. Một ví tham gia nhiều cuộc được tính riêng ở mỗi cuộc.</p>
    {items.map(item => <button key={item.chain.id} onClick={() => open(item.chain.id)}>Xem kết quả: {item.metadata?.title ?? `#${item.chain.id}`}</button>)}
  </section>;
}

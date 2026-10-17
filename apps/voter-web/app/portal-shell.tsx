'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { api, type AppUser } from './auth-client';

const adminLinks = [
  ['/admin/maci', '◇', 'Quản lý MACI'],
  ['/admin/users', '♙', 'Người dùng'],
  ['/admin/activity', '▷', 'Nhật ký hoạt động'],
  ['/admin/account', '◇', 'Tài khoản'],
];
const userLinks = [
  ['/maci', '◇', 'Bầu cử MACI'],
  ['/profile', '◇', 'Hồ sơ cá nhân'],
];

export function PortalShell({ role, title, description, children, action }: { role: 'ADMIN' | 'USER'; title: string; description?: string | undefined; children: ReactNode; action?: ReactNode }) {
  const [user, setUser] = useState<AppUser>();
  const [error, setError] = useState('');
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => {
    void api<AppUser>('/auth/me').then(me => {
      if (me.role !== role) { window.location.replace(me.role === 'ADMIN' ? '/admin/maci' : '/maci'); return; }
      setUser(me);
    }).catch(() => { setError('Phiên đăng nhập không hợp lệ.'); window.location.replace('/login'); });
  }, [role]);
  async function logout() { await api('/auth/logout', { method: 'POST' }).catch(() => undefined); window.location.assign('/login'); }
  if (!user) return <div className="shell-loading" role="status">{error || 'Đang xác thực tài khoản…'}</div>;
  const links = role === 'ADMIN' ? adminLinks : userLinks;
  return <div className="app-shell">
    <aside className="app-sidebar"><a className="app-brand" href={role === 'ADMIN' ? '/admin/maci' : '/maci'}><span className="app-logo">V</span><span>HCMUT Voting<small>NỀN TẢNG BẦU CỬ</small></span></a><p className="app-nav-title">{role === 'ADMIN' ? 'QUẢN TRỊ' : 'CỬ TRI'}</p><nav aria-label="Điều hướng chính">{links.map(([href, icon, label]) => <a key={href} href={href} aria-current={pathname === href ? 'page' : undefined} className={pathname === href ? 'selected' : ''}><span aria-hidden="true">{icon}</span>{label}</a>)}</nav><div className="app-sidebar-footer"><span className="avatar">{user.fullName.slice(0, 1).toLocaleUpperCase('vi')}</span><span><strong>{user.fullName}</strong><small>{role === 'ADMIN' ? 'Quản trị viên' : 'Cử tri'}</small></span></div></aside>
    <div className="app-workspace"><header className="app-topbar"><div className="breadcrumbs"><span>{role === 'ADMIN' ? 'Quản trị' : 'Cử tri'}</span><span aria-hidden="true">/</span><strong>{title}</strong></div><div className="app-account"><span className="avatar">{user.fullName.slice(0, 1).toLocaleUpperCase('vi')}</span><button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Mở menu tài khoản">{user.fullName}⌄</button>{menu && <div className="account-menu"><a href={role === 'ADMIN' ? '/admin/account' : '/profile'}>Tài khoản</a><button onClick={() => void logout()}>Đăng xuất</button></div>}</div></header>
      <main className="app-main"><div className="app-page-heading"><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>{children}</main>
    </div>
  </div>;
}

export function Notice({ children, kind = 'info' }: { children: ReactNode; kind?: 'info' | 'error' | 'success' }) { return <div className={`notice notice-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div>; }
export function EmptyState({ title, detail }: { title: string; detail?: string }) { return <div className="empty-state"><strong>{title}</strong>{detail && <p>{detail}</p>}</div>; }
export function Pagination({ page, total, size, onPage }: { page: number; total: number; size: number; onPage(page: number): void }) { const pages = Math.max(1, Math.ceil(total / size)); return <div className="pagination"><span>{total} kết quả · Trang {page}/{pages}</span><button disabled={page <= 1} onClick={() => onPage(page - 1)}>Trước</button><button disabled={page >= pages} onClick={() => onPage(page + 1)}>Sau</button></div>; }

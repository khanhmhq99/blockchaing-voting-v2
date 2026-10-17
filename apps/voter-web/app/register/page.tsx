'use client';

import { useEffect, useState } from 'react';
import { api, type AppUser } from '../auth-client';

export default function RegisterPage() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [fullName, setFullName] = useState(''); const [email, setEmail] = useState(''); const [phone, setPhone] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void api<AppUser>('/auth/me').then(user => window.location.replace(user.role === 'ADMIN' ? '/admin/maci' : '/maci')).catch(() => undefined); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, fullName, email, phone }) }); window.location.assign('/login?registered=1'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Không thể tạo tài khoản.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><a className="brand-link" href="/">HCMUT <span>Voting</span></a><p className="eyebrow">TÀI KHOẢN CỬ TRI</p><h1>Tạo tài khoản</h1><p className="muted">Sau khi đăng ký, quyền tham gia từng cuộc bầu cử sẽ do quản trị viên cấp riêng. Bạn không cần tạo ví hay cung cấp thông tin thanh toán.</p>
    <form onSubmit={submit}><label>Họ và tên<input autoComplete="name" required value={fullName} onChange={event => setFullName(event.target.value)} /></label><label>Tên đăng nhập<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label><label>Email (tùy chọn)<input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Số điện thoại (tùy chọn)<input type="tel" autoComplete="tel" value={phone} onChange={event => setPhone(event.target.value)} /></label><label>Mật khẩu<input autoComplete="new-password" type="password" required minLength={1} value={password} onChange={event => setPassword(event.target.value)} /></label><button className="primary" disabled={busy}>{busy ? 'Đang tạo…' : 'Tạo tài khoản'}</button></form>
    {message && <p className="form-message" role="alert">{message}</p>}<p className="auth-foot">Đã có tài khoản? <a href="/login">Đăng nhập</a></p>
  </section></main>;
}

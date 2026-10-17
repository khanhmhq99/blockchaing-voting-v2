'use client';

import { useEffect, useState } from 'react';
import { api, type AppUser } from '../auth-client';

export default function LoginPage() {
  const [username, setUsername] = useState(''); const [password, setPassword] = useState(''); const [showPassword, setShowPassword] = useState(false); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { void api<AppUser>('/auth/me').then(user => window.location.replace(user.role === 'ADMIN' ? '/admin/maci' : '/maci')).catch(() => undefined); }, []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage('');
    try { const { user } = await api<{ user: AppUser }>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }); window.location.assign(user.role === 'ADMIN' ? '/admin/maci' : '/maci'); }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Đăng nhập thất bại.'); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><a className="brand-link" href="/">HCMUT <span>Voting</span></a><p className="eyebrow">CỔNG BỎ PHIẾU</p><h1>Đăng nhập</h1><p className="muted">Sử dụng tên đăng nhập và mật khẩu của bạn. Không cần ví điện tử.</p>
    <form onSubmit={submit}><label>Tên đăng nhập<input autoComplete="username" required value={username} onChange={event => setUsername(event.target.value)} /></label><label>Mật khẩu<input autoComplete="current-password" type={showPassword ? 'text' : 'password'} required value={password} onChange={event => setPassword(event.target.value)} /></label><label className="password-toggle"><input type="checkbox" checked={showPassword} onChange={event => setShowPassword(event.target.checked)} />Hiện mật khẩu</label><button className="primary" disabled={busy}>{busy ? 'Đang đăng nhập…' : 'Đăng nhập'}</button></form>
    {message && <p className="form-message" role="alert">{message}</p>}<p className="auth-foot">Chưa có tài khoản? <a href="/register">Đăng ký</a></p>
  </section></main>;
}

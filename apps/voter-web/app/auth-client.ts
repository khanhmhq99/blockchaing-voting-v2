'use client';

export type AppUser = { id: string; username: string; fullName: string; role: 'ADMIN' | 'USER' };
export const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiOrigin}/v1${path}`, { ...init, credentials: 'include', headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.message ?? payload?.error?.message ?? 'Không thể hoàn thành yêu cầu.');
  return payload as T;
}

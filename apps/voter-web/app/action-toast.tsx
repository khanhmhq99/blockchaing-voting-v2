'use client';

import { useEffect, useState } from 'react';

type Kind = 'success' | 'error' | 'warning' | 'info' | 'loading';
type Toast = { id: string; kind: Kind; message: string };
const eventName = 'voting-action-toast';

export function showToast(kind: Kind, message: string, id = crypto.randomUUID()) {
  window.dispatchEvent(new CustomEvent<Toast>(eventName, { detail: { id, kind, message } }));
  return id;
}

export function ActionToasts() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const onToast = (event: Event) => {
      const toast = (event as CustomEvent<Toast>).detail;
      setItems(current => [...current.filter(item => item.id !== toast.id), toast].slice(-4));
      if (toast.kind !== 'loading') window.setTimeout(() => setItems(current => current.filter(item => item.id !== toast.id)), 6_000);
    };
    window.addEventListener(eventName, onToast);
    return () => window.removeEventListener(eventName, onToast);
  }, []);
  return <div className="action-toasts" aria-live="polite" aria-atomic="false">{items.map(item => <div key={item.id} className={`action-toast action-toast-${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>{item.message}<button type="button" aria-label="Đóng thông báo" onClick={() => setItems(current => current.filter(toast => toast.id !== item.id))}>×</button></div>)}</div>;
}

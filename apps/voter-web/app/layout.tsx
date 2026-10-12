import type { ReactNode } from 'react';
import './globals.css';

export const metadata = { title: 'HCMUT · Voting Research', description: 'Public blockchain voting research baseline' };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="vi"><body>{children}</body></html>; }

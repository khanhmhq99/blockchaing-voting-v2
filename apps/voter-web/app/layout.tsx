import type { ReactNode } from 'react';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import '@fontsource/be-vietnam-pro/700.css';
import './globals.css';
import { ActionToasts } from './action-toast';

export const metadata = { title: 'HCMUT · Voting Research', description: 'Public blockchain voting research baseline' };
export default function Layout({ children }: { children: ReactNode }) { return <html lang="vi"><body>{children}<ActionToasts /></body></html>; }

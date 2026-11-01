import { Suspense } from 'react';
import { AdminElectionRoute } from '../../../admin-election-route';
export default function Page() { return <Suspense fallback={<p>Đang tải…</p>}><AdminElectionRoute view="results" /></Suspense>; }

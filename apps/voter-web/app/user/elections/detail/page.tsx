import { Suspense } from 'react';
import { UserElectionRoute } from '../../../user-election-route';
export default function Page() { return <Suspense fallback={<p>Đang tải…</p>}><UserElectionRoute view="details" /></Suspense>; }

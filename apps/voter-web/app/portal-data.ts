export type Election = { metadata: { title: string; description: string; candidates: { name: string; biography: string }[] } | null; metadataStatus: string; userEligible: boolean; userHasVoted: boolean; chain: { id: string; state: string; startTime: string; endTime: string; totalVotes: string; eligibleCount: string; counts: string[]; finalized: boolean; blockNumber: string } };
export type VoteRecord = { id: string; electionId: string; status: string; transactionHash: string | null; createdAt: string; confirmedAt: string | null; errorCode: string | null };
export const stateLabel: Record<string, string> = { Draft: 'Bản nháp', Upcoming: 'Sắp diễn ra', Active: 'Đang diễn ra', Closed: 'Đã kết thúc', Cancelled: 'Đã hủy' };
export const voteLabel: Record<string, string> = { QUEUED: 'Đang xử lý', SUBMITTED: 'Đang ghi nhận trên blockchain', PENDING: 'Đang ghi nhận trên blockchain', CONFIRMED: 'Bỏ phiếu thành công', FAILED: 'Giao dịch thất bại', REJECTED: 'Yêu cầu bị từ chối', UNAVAILABLE: 'Chưa xác minh được trạng thái' };
export const electionTitle = (e: Election) => e.metadata?.title ?? `Cuộc bầu cử #${e.chain.id}`;
export const dateTime = (seconds: string) => new Date(Number(seconds) * 1000).toLocaleString('vi-VN');
export const isPending = (status: string) => ['QUEUED', 'SUBMITTED', 'PENDING', 'UNAVAILABLE'].includes(status);

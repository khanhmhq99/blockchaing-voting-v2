export type AutomaticStep = 'register' | 'join' | null;

export function voteBlockReason(state: {
  chainId: string;
  electionStatus: string;
  chainHealth: string | undefined;
  eligible: boolean;
  credentialReady: boolean;
  registrationMatches: boolean;
  registrationStatus: string | undefined;
  joinStatus: string | undefined;
  joinIndex: string | null;
}): string | null {
  if (state.chainId !== '31337') return 'Chỉ Hardhat Local 31337 được phép bỏ phiếu trong bản thử nghiệm này.';
  if (state.chainHealth !== 'AVAILABLE') return 'Không thể xác minh deployment MACI trên chuỗi hiện tại.';
  if (state.electionStatus !== 'OPEN') return 'Cuộc bỏ phiếu chưa mở hoặc đã kết thúc.';
  if (!state.eligible) return 'Tài khoản chưa được API xác nhận đủ điều kiện tham gia.';
  if (state.registrationStatus !== 'CONFIRMED') return state.registrationStatus
    ? `Đăng ký MACI chưa được xác nhận trên chuỗi (${state.registrationStatus}). Đăng ký phải hoàn tất trước khi cuộc bỏ phiếu bắt đầu.`
    : 'Chưa có đăng ký MACI trên chuỗi. Đăng ký phải hoàn tất trước khi cuộc bỏ phiếu bắt đầu.';
  if (!state.credentialReady || !state.registrationMatches) return 'Khóa MACI trên thiết bị chưa sẵn sàng hoặc không khớp với đăng ký.';
  if (!state.joinIndex) return state.joinStatus === 'FAILED'
    ? 'Giao dịch tham gia poll thất bại; cần đối soát trước khi bỏ phiếu.'
    : 'Đang chờ tham gia poll được xác nhận trên chuỗi.';
  return null;
}

export function describeWorkflowFailure(step: Exclude<AutomaticStep, null>, cause: unknown): { message: string; retryable: boolean } {
  const record = cause && typeof cause === 'object' ? cause as { code?: unknown; message?: unknown } : {};
  const code = typeof record.code === 'string' ? record.code : typeof record.message === 'string' && /^MACI_[A-Z_]+$/.test(record.message) ? record.message : '';
  if (code === 'MACI_PUBLIC_RPC_NOT_CONFIGURED') return { message: 'Chưa cấu hình RPC công khai cho trình duyệt. Người vận hành cần đặt NEXT_PUBLIC_MACI_RPC_URL rồi khởi động hoặc build lại web.', retryable: false };
  if (['MACI_CREDENTIAL_MISSING', 'MACI_CREDENTIAL_MISMATCH', 'MACI_CREDENTIAL_INVALID', 'MACI_CREDENTIAL_STORAGE_UNAVAILABLE'].includes(code)) return { message: 'Không thể dùng khóa bỏ phiếu cục bộ. Hệ thống đã dừng thao tác để tránh đăng ký hoặc bỏ phiếu sai credential.', retryable: false };
  if (['MACI_REGISTRATION_CLOSED', 'MACI_POLL_NOT_OPEN'].includes(code)) return { message: 'Giai đoạn đăng ký hoặc bỏ phiếu đã thay đổi. Vui lòng tải lại trạng thái cuộc bầu cử.', retryable: false };
  if (['MACI_NOT_ELIGIBLE', 'MACI_CREDENTIAL_ALREADY_BOUND'].includes(code)) return { message: 'Tài khoản hoặc khóa này không được phép đăng ký MACI. Vui lòng liên hệ quản trị viên.', retryable: false };
  if (['MACI_BALANCE_LOW', 'MACI_GAS_LIMIT', 'MACI_REGISTRATION_RELAYER_UNCONFIGURED', 'MACI_JOIN_RELAYER_UNCONFIGURED', 'MACI_REGISTRATION_KEY_REUSE', 'MACI_JOIN_KEY_REUSE'].includes(code)) return { message: 'Dịch vụ tài trợ giao dịch MACI chưa sẵn sàng. Người vận hành cần kiểm tra cấu hình hoặc test funds.', retryable: false };
  if (['MACI_INVALID_JOIN_PROOF', 'MACI_RPC_CHAIN_MISMATCH', 'MACI_CHAIN_MISMATCH', 'MACI_CONTRACT_MISSING'].includes(code)) return { message: 'Không thể xác minh proof hoặc mạng MACI. Hệ thống đã dừng bước này; người vận hành cần kiểm tra deployment.', retryable: false };
  if (['MACI_REGISTRATION_RELAY_BUSY', 'MACI_JOIN_RELAY_BUSY', 'MACI_EXTERNAL_PENDING', 'MACI_AUTHORIZATION_EXPIRED', 'DEPENDENCY_UNAVAILABLE', 'MACI_RPC_UNAVAILABLE'].includes(code)) return { message: `${step === 'register' ? 'Đăng ký' : 'Tham gia poll'} MACI đang chờ dịch vụ hoặc chuỗi. Hệ thống sẽ thử lại.`, retryable: true };
  return { message: `${step === 'register' ? 'Đăng ký' : 'Tham gia poll'} MACI chưa hoàn tất. Vui lòng kiểm tra kết nối và trạng thái dịch vụ; hệ thống sẽ thử lại.`, retryable: true };
}

export function nextAutomaticStep(state: {
  electionStatus: string;
  chainHealth: string | undefined;
  eligible: boolean;
  credentialUnlocked: boolean;
  registrationStatus: string | undefined;
  joinStatus: string | undefined;
  joinIndex: string | null;
}): AutomaticStep {
  if (!state.eligible || state.chainHealth !== 'AVAILABLE') return null;
  if (state.electionStatus === 'REGISTRATION' && (!state.registrationStatus || (state.registrationStatus === 'ISSUED' && state.credentialUnlocked))) return 'register';
  if (!state.credentialUnlocked) return null;
  if (state.electionStatus === 'OPEN' && state.registrationStatus === 'CONFIRMED' && !state.joinIndex && !state.joinStatus) return 'join';
  return null;
}

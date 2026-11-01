const labels: Record<string, string> = {
  NOT_REGISTERED: "Chưa đăng ký",
  REGISTRATION: "Đang đăng ký",
  OPEN: "Đang bỏ phiếu",
  CLOSED: "Đã đóng",
  VERIFIED: "Đã xác minh",
  PENDING: "Đang xét duyệt",
  APPROVED: "Đủ điều kiện tham gia",
  REJECTED: "Bị Từ chối",
  ISSUED: "Đã cấp quyền",
  PREPARED: "Đã chuẩn bị",
  CONFIRMED: "Đã xác nhận",
  JOINED: "Đã tham gia",
  INCLUDED: "Đã ghi trên chuỗi",
  FAILED: "Thất bại",
  READY: "Sẵn sàng",
  RECONCILIATION_REQUIRED: "Cần đối soát",
  COMPLETE: "Hoàn tất",
  AVAILABLE: "Sẵn sàng",
  INVALID_OR_UNAVAILABLE: "Không khả dụng",
  APPLICATION_VERIFIED: "Ứng dụng đã xác minh",
};
export function maciStatusLabel(status: string | null | undefined) {
  return status ? labels[status] ?? "Đang cập nhật" : "Chưa bắt đầu";
}

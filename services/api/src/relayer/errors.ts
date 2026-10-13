import { HttpException } from '@nestjs/common';

export class RelayError extends HttpException {
  constructor(readonly code: string, status = 400) {
    super({ error: { code, message: 'Không thể xử lý yêu cầu bỏ phiếu. Kiểm tra trạng thái trước khi thử lại.' } }, status);
  }
}

import { HttpException } from '@nestjs/common';

export class RelayError extends HttpException {
  constructor(readonly code: string, status = 400) {
    super({ error: { code, message: 'The gasless request could not proceed. Check its status before retrying.' } }, status);
  }
}

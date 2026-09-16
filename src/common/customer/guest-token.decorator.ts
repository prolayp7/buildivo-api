import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';

export const GuestToken = createParamDecorator((_data: unknown, ctx: ExecutionContext): string | undefined => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const header = request.headers['x-guest-token'];
  return Array.isArray(header) ? header[0] : header;
});

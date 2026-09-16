import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AdminRequest, AuthenticatedAdmin } from './admin-request';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedAdmin => {
    const request = ctx.switchToHttp().getRequest<AdminRequest>();
    return request.adminUser as AuthenticatedAdmin;
  },
);

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthenticatedCustomer, CustomerRequest } from './customer-request';

export const CurrentCustomer = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedCustomer => {
    const request = ctx.switchToHttp().getRequest<CustomerRequest>();
    return request.customer as AuthenticatedCustomer;
  },
);

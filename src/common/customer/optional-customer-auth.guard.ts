import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerRequest } from './customer-request';

interface AccessTokenPayload {
  sub: number;
}

// Cart/coupon/shipping endpoints work for guests and logged-in customers alike:
// this attaches request.customer when a valid bearer token is present, but never
// blocks the request when it's absent or invalid.
@Injectable()
export class OptionalCustomerAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<CustomerRequest>();
    const authHeader = request.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return true;

    try {
      const payload = await this.jwtService.verifyAsync<AccessTokenPayload>(authHeader.slice('Bearer '.length));
      const customer = await this.prisma.user.findFirst({
        where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      });
      if (customer) {
        request.customer = {
          id: customer.id,
          uuid: customer.uuid,
          email: customer.email,
          firstName: customer.firstName,
          lastName: customer.lastName,
        };
      }
    } catch {
      // invalid/expired token on an optional-auth route: proceed as guest
    }

    return true;
  }
}

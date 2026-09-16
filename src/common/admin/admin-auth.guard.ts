import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AdminRequest } from './admin-request';

interface AccessTokenPayload {
  sub: number;
}

@Injectable()
export class AdminAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }

    const token = authHeader.slice('Bearer '.length);
    let payload: AccessTokenPayload;
    try {
      payload = await this.jwtService.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const adminUser = await this.prisma.adminUser.findFirst({
      where: { id: payload.sub, deletedAt: null, status: 'ACTIVE' },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!adminUser) {
      throw new UnauthorizedException('Admin user not found or disabled');
    }

    request.adminUser = {
      id: adminUser.id,
      email: adminUser.email,
      name: adminUser.name,
      roleId: adminUser.roleId,
      permissionKeys: adminUser.role.permissions.map((rp) => rp.permission.key),
    };

    return true;
  }
}

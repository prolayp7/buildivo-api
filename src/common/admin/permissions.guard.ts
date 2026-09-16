import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRequest } from './admin-request';
import { PERMISSIONS_KEY } from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required || required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AdminRequest>();
    if (!request.adminUser) {
      throw new UnauthorizedException('Missing authenticated admin user');
    }

    const hasAll = required.every((key) => request.adminUser!.permissionKeys.includes(key));
    if (!hasAll) {
      throw new ForbiddenException(`Missing required permission: ${required.join(', ')}`);
    }

    return true;
  }
}

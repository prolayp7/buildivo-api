import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';

function mockContext(adminUser?: { permissionKeys: string[] }): ExecutionContext {
  const request = { adminUser };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

describe('PermissionsGuard', () => {
  it('allows the request when no permissions are required', () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(guard.canActivate(mockContext({ permissionKeys: [] }))).toBe(true);
  });

  it('throws UnauthorizedException when adminUser is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['products.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() => guard.canActivate(mockContext(undefined))).toThrow(UnauthorizedException);
  });

  it('throws ForbiddenException when a required permission is missing', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['orders.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(() =>
      guard.canActivate(mockContext({ permissionKeys: ['products.manage'] })),
    ).toThrow(ForbiddenException);
  });

  it('allows the request when the admin has the required permission', () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(['products.manage']),
    } as unknown as Reflector;
    const guard = new PermissionsGuard(reflector);

    expect(
      guard.canActivate(mockContext({ permissionKeys: ['products.manage'] })),
    ).toBe(true);
  });
});

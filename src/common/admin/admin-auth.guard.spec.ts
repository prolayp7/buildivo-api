import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { AdminAuthGuard } from './admin-auth.guard';
import { PrismaService } from '../../prisma/prisma.service';

function mockContext(headers: Record<string, string>): ExecutionContext {
  const request: Record<string, unknown> = { headers };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('AdminAuthGuard', () => {
  it('throws when no bearer token is present', async () => {
    const jwtService = { verifyAsync: jest.fn() } as unknown as JwtService;
    const prisma = {} as PrismaService;
    const guard = new AdminAuthGuard(jwtService, prisma);

    await expect(guard.canActivate(mockContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws when the token is invalid', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockRejectedValue(new Error('bad token')),
    } as unknown as JwtService;
    const prisma = {} as PrismaService;
    const guard = new AdminAuthGuard(jwtService, prisma);

    await expect(
      guard.canActivate(mockContext({ authorization: 'Bearer bad' })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('attaches adminUser with resolved permission keys on success', async () => {
    const jwtService = {
      verifyAsync: jest.fn().mockResolvedValue({ sub: 7 }),
    } as unknown as JwtService;
    const prisma = {
      adminUser: {
        findFirst: jest.fn().mockResolvedValue({
          id: 7,
          email: 'admin@example.com',
          name: 'Admin',
          roleId: 1,
          role: {
            permissions: [
              { permission: { key: 'products.manage' } },
              { permission: { key: 'orders.manage' } },
            ],
          },
        }),
      },
    } as unknown as PrismaService;
    const guard = new AdminAuthGuard(jwtService, prisma);
    const context = mockContext({ authorization: 'Bearer good' });

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    const request = context.switchToHttp().getRequest() as {
      adminUser: { permissionKeys: string[] };
    };
    expect(request.adminUser.permissionKeys).toEqual([
      'products.manage',
      'orders.manage',
    ]);
  });
});

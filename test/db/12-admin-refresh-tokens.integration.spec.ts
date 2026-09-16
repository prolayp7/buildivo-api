import { PrismaService } from '../../src/prisma/prisma.service';

describe('Admin Refresh Tokens', () => {
  const prisma = new PrismaService();
  let roleId: number;
  let adminUserId: number;
  let tokenId: number;

  afterAll(async () => {
    if (tokenId) await prisma.adminRefreshToken.delete({ where: { id: tokenId } });
    if (adminUserId) await prisma.adminUser.delete({ where: { id: adminUserId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    await prisma.$disconnect();
  });

  it('links a refresh token to an admin user and enforces unique token hashes', async () => {
    const role = await prisma.role.create({ data: { name: 'Test Refresh Role' } });
    roleId = role.id;

    const adminUser = await prisma.adminUser.create({
      data: {
        email: 'test-refresh@example.com',
        passwordHash: 'irrelevant-for-this-test',
        name: 'Test Admin',
        roleId,
      },
    });
    adminUserId = adminUser.id;

    const token = await prisma.adminRefreshToken.create({
      data: {
        adminUserId,
        tokenHash: 'test-hash-abc123',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });
    tokenId = token.id;

    expect(token.revokedAt).toBeNull();

    await expect(
      prisma.adminRefreshToken.create({
        data: {
          adminUserId,
          tokenHash: 'test-hash-abc123',
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
    ).rejects.toThrow();
  });
});

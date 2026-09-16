import { PrismaService } from '../../src/prisma/prisma.service';

describe('Identity & Access', () => {
  const prisma = new PrismaService();
  let userId: number;
  let addressId: number;
  let roleId: number;
  let permissionId: number;
  let adminUserId: number;

  afterAll(async () => {
    if (adminUserId) await prisma.adminUser.delete({ where: { id: adminUserId } });
    if (roleId) await prisma.rolePermission.deleteMany({ where: { roleId } });
    if (permissionId) await prisma.permission.delete({ where: { id: permissionId } });
    if (roleId) await prisma.role.delete({ where: { id: roleId } });
    if (addressId) await prisma.address.delete({ where: { id: addressId } });
    if (userId) await prisma.user.delete({ where: { id: userId } });
    await prisma.otpVerification.deleteMany({ where: { identifier: 'test-identity@example.com' } });
    await prisma.$disconnect();
  });

  it('creates a user with an address, and an admin user with a role and permission', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test-identity-user@example.com',
        passwordHash: 'hashed',
        firstName: 'Ada',
        lastName: 'Lovelace',
        addresses: {
          create: {
            fullName: 'Ada Lovelace',
            line1: '1 Test Street',
            city: 'London',
            postcode: 'SW1A 1AA',
            addressType: 'BOTH',
          },
        },
      },
      include: { addresses: true },
    });
    userId = user.id;
    addressId = user.addresses[0].id;
    expect(user.uuid).toBeDefined();
    expect(user.addresses[0].country).toBe('GB');

    const role = await prisma.role.create({ data: { name: 'Test Catalog Manager' } });
    roleId = role.id;
    const permission = await prisma.permission.create({ data: { key: 'products.create.test' } });
    permissionId = permission.id;
    await prisma.rolePermission.create({ data: { roleId, permissionId } });

    const admin = await prisma.adminUser.create({
      data: {
        email: 'test-identity-admin@example.com',
        passwordHash: 'hashed',
        name: 'Admin Test',
        roleId,
      },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    adminUserId = admin.id;
    expect(admin.role.permissions[0].permission.key).toBe('products.create.test');

    await prisma.otpVerification.create({
      data: {
        identifier: 'test-identity@example.com',
        channel: 'EMAIL',
        code: '123456',
        purpose: 'registration',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      },
    });
  });

  it('cascades address deletion when the owning user is deleted', async () => {
    const user = await prisma.user.create({
      data: {
        email: 'test-identity-cascade@example.com',
        passwordHash: 'hashed',
        firstName: 'Cascade',
        lastName: 'Test',
        addresses: { create: { fullName: 'Cascade Test', line1: 'x', city: 'x', postcode: 'x', addressType: 'BOTH' } },
      },
      include: { addresses: true },
    });
    const addrId = user.addresses[0].id;

    await prisma.user.delete({ where: { id: user.id } });

    const found = await prisma.address.findUnique({ where: { id: addrId } });
    expect(found).toBeNull();
  });

  it('allows a new user to reuse the email of a soft-deleted user, but still blocks duplicates among live users', async () => {
    const email = 'test-identity-soft-delete-reuse@example.com';

    const first = await prisma.user.create({
      data: { email, passwordHash: 'hashed', firstName: 'First', lastName: 'User' },
    });
    await prisma.user.update({ where: { id: first.id }, data: { deletedAt: new Date() } });

    const second = await prisma.user.create({
      data: { email, passwordHash: 'hashed', firstName: 'Second', lastName: 'User' },
    });
    expect(second.email).toBe(email);

    await expect(
      prisma.user.create({
        data: { email, passwordHash: 'hashed', firstName: 'Third', lastName: 'User' },
      }),
    ).rejects.toThrow();

    await prisma.user.delete({ where: { id: second.id } });
    await prisma.user.delete({ where: { id: first.id } });
  });
});

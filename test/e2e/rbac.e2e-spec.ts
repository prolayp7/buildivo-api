import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin RBAC (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let roleId: number;
  let adminUserId: number;
  const suffix = Date.now();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  afterAll(async () => {
    if (adminUserId) await prisma.adminUser.delete({ where: { id: adminUserId } }).catch(() => undefined);
    if (roleId) await prisma.role.delete({ where: { id: roleId } }).catch(() => undefined);
    await app.close();
  });

  it('lists permissions and creates a role with assignments', async () => {
    const permissions = await request(app.getHttpServer())
      .get('/api/v1/admin/permissions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(permissions.body.data.some((item: { key: string }) => item.key === 'products.manage')).toBe(true);

    const role = await request(app.getHttpServer())
      .post('/api/v1/admin/roles')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: `Test Catalog Manager ${suffix}`, permissionKeys: ['products.manage'] })
      .expect(201);
    roleId = role.body.data.id;
    expect(role.body.data.permissions[0].permission.key).toBe('products.manage');
  });

  it('creates, updates, lists, and soft-deletes a staff account', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/admin-users')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: `staff-${suffix}@example.com`, name: 'Test Staff', roleId, temporaryPassword: 'Temporary123!' })
      .expect(201);
    adminUserId = created.body.data.id;
    expect(created.body.data.passwordHash).toBeUndefined();

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/roles/${roleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/admin-users/${adminUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'DISABLED' })
      .expect(200);
    expect(updated.body.data.status).toBe('DISABLED');

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/admin-users/${adminUserId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });
});

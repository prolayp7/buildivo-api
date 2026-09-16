import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Admin Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await app.close();
  });

  const email = process.env.SEED_ADMIN_EMAIL ?? 'superadmin@ukshop.test';
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';

  it('rejects invalid credentials', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email, password: 'wrong-password' })
      .expect(401);

    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('logs in, fetches /me, refreshes, and logs out', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email, password })
      .expect(200);

    const { accessToken, refreshToken } = loginRes.body.data;
    expect(typeof accessToken).toBe('string');
    expect(typeof refreshToken).toBe('string');

    const meRes = await request(app.getHttpServer())
      .get('/api/v1/admin/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(meRes.body.data.email).toBe(email);
    expect(meRes.body.data.permissionKeys).toEqual(expect.arrayContaining(['products.manage']));

    const refreshRes = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    expect(refreshRes.body.data.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer())
      .post('/api/v1/admin/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/api/v1/admin/auth/logout')
      .send({ refreshToken: refreshRes.body.data.refreshToken })
      .expect(204);
  });

  it('rejects /me without a token', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/me').expect(401);
  });

  it('rejects refresh for a disabled admin, without leaving the refresh token usable', async () => {
    const loginRes = await request(app.getHttpServer())
      .post('/api/v1/admin/auth/login')
      .send({ email, password })
      .expect(200);

    const { refreshToken } = loginRes.body.data;

    const adminUser = await prisma.adminUser.findFirst({ where: { email } });
    await prisma.adminUser.update({
      where: { id: adminUser!.id },
      data: { status: 'DISABLED' },
    });

    try {
      await request(app.getHttpServer())
        .post('/api/v1/admin/auth/refresh')
        .send({ refreshToken })
        .expect(401);
    } finally {
      await prisma.adminUser.update({
        where: { id: adminUser!.id },
        data: { status: 'ACTIVE' },
      });
    }
  });
});

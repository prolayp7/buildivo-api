import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin Coupons (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let couponId: number;
  const code = `TEST${Date.now()}`;

  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); });
  afterAll(async () => {
    if (couponId) await prisma.coupon.delete({ where: { id: couponId } }).catch(() => undefined);
    await app.close();
  });

  it('creates, updates, lists, and soft-deletes a coupon', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/admin/coupons')
      .set('Authorization', `Bearer ${token}`).send({ code: code.toLowerCase(), discountType: 'PERCENT', discountAmount: 15 }).expect(201);
    couponId = created.body.data.id;
    expect(created.body.data.code).toBe(code);

    const updated = await request(app.getHttpServer()).patch(`/api/v1/admin/coupons/${couponId}`)
      .set('Authorization', `Bearer ${token}`).send({ maxDiscountValue: 50 }).expect(200);
    expect(Number(updated.body.data.maxDiscountValue)).toBe(50);

    await request(app.getHttpServer()).post('/api/v1/admin/coupons')
      .set('Authorization', `Bearer ${token}`).send({ code, discountType: 'PERCENT', discountAmount: 101 }).expect(400);

    await request(app.getHttpServer()).delete(`/api/v1/admin/coupons/${couponId}`)
      .set('Authorization', `Bearer ${token}`).expect(204);

    const normal = await request(app.getHttpServer()).get(`/api/v1/admin/coupons?q=${code}`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(normal.body.data).toHaveLength(0);

    const deleted = await request(app.getHttpServer()).get(`/api/v1/admin/coupons?q=${code}&includeDeleted=true`)
      .set('Authorization', `Bearer ${token}`).expect(200);
    expect(deleted.body.data).toHaveLength(1);
  });
});

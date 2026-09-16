import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin Shipping Methods (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let methodId: number;
  let bandId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  afterAll(async () => {
    if (methodId) await prisma.shippingMethod.delete({ where: { id: methodId } }).catch(() => undefined);
    await app.close();
  });

  it('creates and updates a weight-banded shipping method', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/shipping-methods')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Courier', carrier: 'Test Carrier', rateType: 'WEIGHT_BANDED', estimatedDaysMin: 1, estimatedDaysMax: 3 })
      .expect(201);
    methodId = created.body.data.id;

    const updated = await request(app.getHttpServer())
      .patch(`/api/v1/admin/shipping-methods/${methodId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(updated.body.data.status).toBe('INACTIVE');
  });

  it('adds non-overlapping rate bands and rejects overlap', async () => {
    const created = await request(app.getHttpServer())
      .post(`/api/v1/admin/shipping-methods/${methodId}/rate-bands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minWeightKg: 0, maxWeightKg: 5, rate: 7.5 })
      .expect(201);
    bandId = created.body.data.id;

    await request(app.getHttpServer())
      .post(`/api/v1/admin/shipping-methods/${methodId}/rate-bands`)
      .set('Authorization', `Bearer ${token}`)
      .send({ minWeightKg: 4, maxWeightKg: 8, rate: 10 })
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/shipping-methods/${methodId}/rate-bands/${bandId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    bandId = 0;
  });
});

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Admin Customers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let customerId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);

    const user = await prisma.user.create({
      data: {
        email: 'test-customer@example.com',
        passwordHash: 'irrelevant',
        firstName: 'Test',
        lastName: 'Customer',
      },
    });
    customerId = user.id;
  });

  afterAll(async () => {
    if (customerId) await prisma.user.delete({ where: { id: customerId } });
    await app.close();
  });

  it('rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/api/v1/admin/customers').expect(401);
  });

  it('lists customers with pagination meta', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/admin/customers?page=1&perPage=10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body.meta).toEqual(
      expect.objectContaining({ page: 1, perPage: 10 }),
    );
    expect(
      res.body.data.some((c: { id: number }) => c.id === customerId),
    ).toBe(true);
  });

  it('fetches, updates, and suspends a customer', async () => {
    const getRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(getRes.body.data.email).toBe('test-customer@example.com');

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/customers/${customerId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'SUSPENDED', firstName: 'Updated' })
      .expect(200);
    expect(patchRes.body.data.status).toBe('SUSPENDED');
    expect(patchRes.body.data.firstName).toBe('Updated');

    const ordersRes = await request(app.getHttpServer())
      .get(`/api/v1/admin/customers/${customerId}/orders`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(ordersRes.body.data).toEqual([]);
  });
});

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

  it('counts returning customers after two settled orders, not two pending orders', async () => {
    const orderNumbers = [`TEST-RET-${Date.now()}-1`, `TEST-RET-${Date.now()}-2`];
    const orderData = orderNumbers.map((orderNumber) => ({
      orderNumber,
      userId: customerId,
      email: 'test-customer@example.com',
      status: 'AWAITING_PAYMENT' as const,
      paymentStatus: 'PENDING' as const,
      billingFullName: 'Test Customer',
      billingLine1: '1 Test Street',
      billingCity: 'London',
      billingPostcode: 'SW1A 1AA',
      shippingFullName: 'Test Customer',
      shippingLine1: '1 Test Street',
      shippingCity: 'London',
      shippingPostcode: 'SW1A 1AA',
      subtotal: 10,
      total: 10,
    }));
    try {
      const before = await request(app.getHttpServer())
        .get('/api/v1/admin/customers/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      await prisma.order.createMany({ data: orderData });
      const pending = await request(app.getHttpServer())
        .get('/api/v1/admin/customers/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(pending.body.data.returningCustomers).toBe(before.body.data.returningCustomers);
      const potentialList = await request(app.getHttpServer())
        .get('/api/v1/admin/customers?q=test-customer%40example.com&segment=POTENTIAL')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(potentialList.body.data.find((customer: { id: number }) => customer.id === customerId)?.customerSegment).toBe('POTENTIAL');

      await prisma.order.updateMany({ where: { orderNumber: { in: orderNumbers } }, data: { status: 'PROCESSING', paymentStatus: 'PAID' } });
      const paid = await request(app.getHttpServer())
        .get('/api/v1/admin/customers/summary')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(paid.body.data.returningCustomers).toBe(before.body.data.returningCustomers + 1);
      const returningList = await request(app.getHttpServer())
        .get('/api/v1/admin/customers?q=test-customer%40example.com&segment=RETURNING')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(returningList.body.data.find((customer: { id: number }) => customer.id === customerId)).toMatchObject({ customerSegment: 'RETURNING', settledOrderCount: 2 });
      await request(app.getHttpServer())
        .get('/api/v1/admin/customers?q=test-customer%40example.com&segment=FIRST_TIME')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .then((response) => expect(response.body.data.some((customer: { id: number }) => customer.id === customerId)).toBe(false));
    } finally {
      await prisma.order.deleteMany({ where: { orderNumber: { in: orderNumbers } } });
    }
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

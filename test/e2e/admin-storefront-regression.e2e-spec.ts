import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';

describe('Storefront order visible and manageable in admin (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminToken: string;
  let customerToken: string;
  let orderUuid: string;
  let orderNumber: string;
  let adminOrderId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    adminToken = await loginAsSuperAdmin(app);

    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/products/${list.body.data[0].slug}`)
      .expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });

    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

    const email = `regression-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Reg', lastName: 'Ression' })
      .expect(201);
    customerToken = registerRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        shippingAddress: { fullName: 'Reg Ression', line1: '1 Regression Rd', city: 'Leeds', postcode: 'LS1 1AA' },
        shippingMethodId: method!.id,
      })
      .expect(201);
    orderUuid = orderRes.body.data.uuid;
    orderNumber = orderRes.body.data.orderNumber;
  });

  afterAll(async () => {
    await app.close();
  });

  it('appears in the admin order list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders?q=${orderNumber}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].orderNumber).toBe(orderNumber);
    adminOrderId = res.body.data[0].id;
  });

  it('shows correct customer, items, and totals in the admin order detail', async () => {
    const storefrontDetail = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderUuid}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .get(`/api/v1/admin/orders/${adminOrderId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.data.user.email).toBe(storefrontDetail.body.data.email);
    expect(res.body.data.status).toBe('AWAITING_PAYMENT');
    expect(Number(res.body.data.total)).toBeCloseTo(Number(storefrontDetail.body.data.total), 2);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(storefrontDetail.body.data.items[0].quantity);
  });

  it('lets admin fulfil/ship the order, and the customer sees the update reflected back', async () => {
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${adminOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'PROCESSING' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${adminOrderId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'SHIPPED' })
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${adminOrderId}/tracking`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trackingCarrier: 'Royal Mail', trackingNumber: 'RM123456789GB', trackingUrl: 'https://track.royalmail.com/RM123456789GB' })
      .expect(200);

    const customerView = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderUuid}`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(200);

    expect(customerView.body.data.status).toBe('SHIPPED');
    expect(customerView.body.data.trackingCarrier).toBe('Royal Mail');
    expect(customerView.body.data.trackingNumber).toBe('RM123456789GB');
  });

  it('lets admin approve, receive, and refund a return against a storefront order', async () => {
    // simulate a captured payment (the real payment-gateway flow is Day 5's other
    // hardening item and isn't wired end to end yet — see the payments audit note)
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid }, include: { items: true } });
    await prisma.paymentTransaction.create({
      data: {
        orderId: order.id,
        provider: 'STRIPE',
        providerTransactionId: `test_txn_${orderUuid}`,
        amount: order.total,
        status: 'CAPTURED',
      },
    });
    const orderItem = order.items[0];
    const returnRequest = await prisma.orderItemReturn.create({
      data: { orderItemId: orderItem.id, userId: order.userId!, reason: 'Changed my mind' },
    });

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/returns/${returnRequest.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({})
      .expect(200);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/returns/${returnRequest.id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const refundRes = await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnRequest.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ refundAmount: Number(orderItem.subtotal) })
      .expect(201);

    expect(refundRes.body.data.returnRequest.returnStatus).toBe('RECEIVED');
    expect(Number(refundRes.body.data.refund.amount)).toBeCloseTo(Number(orderItem.subtotal), 2);
  });

  it('does not leak this order to another customer', async () => {
    const otherEmail = `regression-other-${Date.now()}@example.com`;
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'SuperSecret123!', firstName: 'Other', lastName: 'Customer' })
      .expect(201);

    await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderUuid}`)
      .set('Authorization', `Bearer ${otherRes.body.data.accessToken}`)
      .expect(404);
  });
});

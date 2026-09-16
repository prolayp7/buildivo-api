import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { EmailService } from '../../src/modules/email/email.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';

// Resilience (checkout/status-update/refund/notification all succeeding with
// no SMTP configured) is already proven implicitly: every other e2e spec in
// this suite exercises those flows against the real, unconfigured EmailService
// and none of them fail. This file verifies the trigger wiring itself - that
// the right email fires, with the right recipient/content, at the right point
// - by spying on the live EmailService instance instead of mocking SMTP.

describe('Transactional email triggers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sendSpy: jest.SpyInstance;
  let adminToken: string;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    adminToken = await loginAsSuperAdmin(app);
  });

  beforeEach(() => {
    sendSpy = jest.spyOn(app.get(EmailService), 'send').mockResolvedValue(true);
  });

  afterEach(() => {
    sendSpy.mockRestore();
  });

  afterAll(async () => {
    await app.close();
  });

  async function placeOrder() {
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 20 } });
    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

    const email = `email-trigger-${Date.now()}-${Math.random()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Trig', lastName: 'Ger' })
      .expect(201);
    const customerToken = registerRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);

    sendSpy.mockClear(); // isolate the checkout call itself from setup noise

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({ shippingAddress: { fullName: 'Trig Ger', line1: '1 Trigger Ave', city: 'Leeds', postcode: 'LS1 1AA' }, shippingMethodId: method!.id })
      .expect(201);

    return { email, orderUuid: orderRes.body.data.uuid as string, customerToken };
  }

  it('sends an order confirmation email on checkout', async () => {
    const { email } = await placeOrder();

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^Order confirmed/);
    expect(html).toContain('has been received');
  });

  it('sends a shipped email (with tracking) when admin marks the order SHIPPED', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/tracking`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ trackingCarrier: 'DHL', trackingNumber: 'DHL999' })
      .expect(200);
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'PROCESSING' })
      .expect(200);
    sendSpy.mockClear();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'SHIPPED' })
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject, html] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^Your order has shipped/);
    expect(html).toContain('DHL999');
  });

  it('sends a delivered email when admin marks the order DELIVERED', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid } });
    for (const toStatus of ['PROCESSING', 'PACKED', 'SHIPPED']) {
      await request(app.getHttpServer())
        .patch(`/api/v1/admin/orders/${order.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ toStatus })
        .expect(200);
    }

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .patch(`/api/v1/admin/orders/${order.id}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ toStatus: 'DELIVERED' })
      .expect(200);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^Order delivered/);
  });

  it('sends a refund email once a return is refunded', async () => {
    const { email, orderUuid } = await placeOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { uuid: orderUuid }, include: { items: true } });

    await prisma.paymentTransaction.create({
      data: { orderId: order.id, provider: 'STRIPE', providerTransactionId: `email_test_${orderUuid}`, amount: order.total, status: 'CAPTURED' },
    });
    const returnRequest = await prisma.orderItemReturn.create({
      data: { orderItemId: order.items[0].id, userId: order.userId!, reason: 'Not needed' },
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

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post(`/api/v1/admin/returns/${returnRequest.id}/refund`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ refundAmount: Number(order.items[0].subtotal) })
      .expect(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toMatch(/^Refund processed/);
  });

  it('emails the customer when an admin sends them a notification, and skips email for broadcast notifications', async () => {
    const { email } = await placeOrder();
    const customer = await prisma.user.findFirstOrThrow({ where: { email } });

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ userId: customer.id, type: 'MARKETING', title: 'Sale this weekend', message: '20% off everything' })
      .expect(201);

    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [to, subject] = sendSpy.mock.calls[0];
    expect(to).toBe(email);
    expect(subject).toBe('Sale this weekend');

    sendSpy.mockClear();
    await request(app.getHttpServer())
      .post('/api/v1/admin/notifications')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ type: 'SYSTEM', title: 'Broadcast', message: 'No specific customer' })
      .expect(201);
    expect(sendSpy).not.toHaveBeenCalled();
  });
});

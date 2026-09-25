import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp, registerAndVerify } from './setup';

const api = (app: INestApplication) => request(app.getHttpServer());

describe('Order tracking and cancellation (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let variantId: number;
  let shippingMethodId: number;
  const address = { fullName: 'Jamie Rivers', line1: '10 Downing Street', city: 'London', postcode: 'SW1A 2AA', country: 'GB' };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const variant = await prisma.productVariant.findFirstOrThrow({ where: { deletedAt: null, status: 'ACTIVE', isDefault: true, product: { status: 'ACTIVE', deletedAt: null } } });
    variantId = variant.id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 50 } });
    shippingMethodId = (await prisma.shippingMethod.findFirstOrThrow({ where: { status: 'ACTIVE' } })).id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function placeOrder() {
    const email = `track-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
    const auth = await registerAndVerify(app, { email, password: 'SuperSecret123!', firstName: 'Track', lastName: 'Er' });
    const bearer = { Authorization: `Bearer ${auth.accessToken}` };
    await api(app).post('/api/v1/cart/items').set(bearer).send({ productVariantId: variantId, quantity: 1 }).expect(201);
    const order = (await api(app).post('/api/v1/orders').set(bearer).send({ shippingAddress: address, shippingMethodId }).expect(201)).body.data;
    return { order, email, bearer };
  }

  describe('POST /orders/track', () => {
    it('needs no login, only the order number plus the email on the order', async () => {
      const { order, email } = await placeOrder();
      const res = await api(app).post('/api/v1/orders/track').send({ orderNumber: order.orderNumber, email }).expect(200);
      expect(res.body.data).toMatchObject({ orderNumber: order.orderNumber, status: 'AWAITING_PAYMENT' });
      expect(res.body.data.items[0]).toMatchObject({ quantity: 1 });
      expect(Array.isArray(res.body.data.history)).toBe(true);
    });

    it('is case-insensitive on the order number and email', async () => {
      const { order, email } = await placeOrder();
      await api(app).post('/api/v1/orders/track').send({ orderNumber: order.orderNumber.toLowerCase(), email: email.toUpperCase() }).expect(200);
    });

    it('answers a wrong email and an unknown order number identically, so orders cannot be probed', async () => {
      const { order } = await placeOrder();
      const wrongEmail = await api(app).post('/api/v1/orders/track').send({ orderNumber: order.orderNumber, email: 'someone.else@example.com' }).expect(404);
      const unknown = await api(app).post('/api/v1/orders/track').send({ orderNumber: 'NOPE-000000', email: 'someone.else@example.com' }).expect(404);
      expect(wrongEmail.body.error.message).toBe(unknown.body.error.message);
    });

    it('does not leak the address, payment details or internal notes', async () => {
      const { order, email } = await placeOrder();
      const text = JSON.stringify((await api(app).post('/api/v1/orders/track').send({ orderNumber: order.orderNumber, email }).expect(200)).body);
      for (const secret of ['Downing', 'SW1A', 'shippingLine1', 'paymentStatus', 'billing', 'changedByAdmin', 'note']) expect(text).not.toContain(secret);
    });

    it('validates its input', async () => {
      await api(app).post('/api/v1/orders/track').send({ orderNumber: 'A', email: 'not-an-email' }).expect(400);
      await api(app).post('/api/v1/orders/track').send({}).expect(400);
    });
  });

  describe('customer order list', () => {
    it('includes each item\'s return status so the account can show "return requested"', async () => {
      const { order, bearer } = await placeOrder();
      const list = (await api(app).get('/api/v1/orders').set(bearer).expect(200)).body.data as { uuid: string; items: { returns: unknown[] }[] }[];
      const found = list.find((o) => o.uuid === order.uuid)!;
      expect(Array.isArray(found.items[0].returns)).toBe(true);
    });
  });

  describe('cancel', () => {
    it('lets a customer cancel an unshipped order, restocks it, and refuses a second cancel', async () => {
      const { order, bearer } = await placeOrder();
      const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty;
      const res = await api(app).patch(`/api/v1/orders/${order.uuid}/cancel`).set(bearer).send({ reason: 'Ordered by mistake' }).expect(200);
      expect(res.body.data.status).toBe('CANCELLED');
      expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty).toBe(before + 1);
      await api(app).patch(`/api/v1/orders/${order.uuid}/cancel`).set(bearer).send({}).expect(400);
    });

    it("will not cancel someone else's order", async () => {
      const { order } = await placeOrder();
      const { bearer: other } = await placeOrder();
      await api(app).patch(`/api/v1/orders/${order.uuid}/cancel`).set(other).send({}).expect(404);
    });
  });
  describe('totals (the rule the storefront cart and checkout mirror)', () => {
    it('cart subtotal is VAT-inclusive; order total = subtotal - coupon + delivery', async () => {
      const code = `TOT-${Date.now()}`;
      await prisma.coupon.create({ data: { code, name: 'Totals test', discountType: 'FIXED', discountAmount: 5, status: 'ACTIVE', targetType: 'ALL' } });
      const flat = await prisma.shippingMethod.findFirstOrThrow({ where: { status: 'ACTIVE', rateType: 'FLAT', freeOverAmount: null } });
      const variant = await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } });
      const unit = Number(variant.salePrice ?? variant.price);
      try {
        const email = `totals-${Date.now()}@example.com`;
        const auth = await registerAndVerify(app, { email, password: 'SuperSecret123!', firstName: 'Tot', lastName: 'Als' });
        const bearer = { Authorization: `Bearer ${auth.accessToken}` };
        const cart = (await api(app).post('/api/v1/cart/items').set(bearer).send({ productVariantId: variantId, quantity: 2 }).expect(201)).body.data;
        expect(cart.subtotal).toBeCloseTo(unit * 2, 2); // no 20% added on top of the catalogue price

        const check = (await api(app).post('/api/v1/cart/coupon/validate').set(bearer).send({ code }).expect(200)).body.data;
        expect(check.discountAmount).toBe(5);

        const order = (await api(app).post('/api/v1/orders').set(bearer).send({ shippingAddress: address, shippingMethodId: flat.id, couponCode: code }).expect(201)).body.data;
        expect(Number(order.total)).toBeCloseTo(unit * 2 - 5 + Number(flat.flatRate), 2);
      } finally {
        await prisma.coupon.deleteMany({ where: { code } }).catch(() => undefined);
      }
    });

    it('rejects a code that does not exist (the storefront no longer fakes BUILD10)', async () => {
      const email = `totals-bad-${Date.now()}@example.com`;
      const auth = await registerAndVerify(app, { email, password: 'SuperSecret123!', firstName: 'Bad', lastName: 'Code' });
      const bearer = { Authorization: `Bearer ${auth.accessToken}` };
      await api(app).post('/api/v1/cart/items').set(bearer).send({ productVariantId: variantId, quantity: 1 }).expect(201);
      const res = await api(app).post('/api/v1/cart/coupon/validate').set(bearer).send({ code: 'NOT-A-REAL-CODE' }).expect(400);
      expect(res.body.error.message).toMatch(/not valid/i);
    });
  });
});

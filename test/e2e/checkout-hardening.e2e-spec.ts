import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';
import { registerAndVerify as registerCustomer } from './setup';
import { OrderExpiryService } from '../../src/modules/storefront/orders/order-expiry.service';

describe('Checkout hardening (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let variantId: number;
  let methodId: number;

  const placeOrder = async (token: string, key?: string) => {
    await request(app.getHttpServer()).post('/api/v1/cart/items').set('Authorization', `Bearer ${token}`).send({ productVariantId: variantId, quantity: 1 });
    const req = request(app.getHttpServer()).post('/api/v1/orders').set('Authorization', `Bearer ${token}`);
    if (key) req.set('Idempotency-Key', key);
    return req.send({ shippingAddress: { fullName: 'A B', line1: '1 St', city: 'Bristol', postcode: 'BS1 1AA' }, shippingMethodId: methodId });
  };
  const newCustomer = async () => (await registerCustomer(app, { email: `hard-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`, password: 'SuperSecret123!', firstName: 'H', lastName: 'C' })).accessToken;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    variantId = detail.body.data.variants[0].id;
    methodId = (await prisma.shippingMethod.findFirstOrThrow({ where: { status: 'ACTIVE' } })).id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 50 } });
  });
  afterAll(async () => { await app.close(); });

  it('returns the same order when the Idempotency-Key is reused', async () => {
    const token = await newCustomer();
    const key = `chk-${Date.now()}`;
    const first = await placeOrder(token, key).then((r) => { expect(r.status).toBe(201); return r.body.data; });
    const second = await placeOrder(token, key);
    expect(second.status).toBe(201);
    expect(second.body.data.uuid).toBe(first.uuid);
    expect(await prisma.order.count({ where: { checkoutKey: key } })).toBe(1);
  });

  it('never oversells the last unit under concurrent checkouts', async () => {
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 1 } });
    const [a, b] = await Promise.all([newCustomer(), newCustomer()]);
    const results = await Promise.all([placeOrder(a), placeOrder(b)]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty).toBe(0);
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 50 } });
  });

  it('expires stale unpaid orders and restocks them', async () => {
    const token = await newCustomer();
    const order = (await placeOrder(token)).body.data;
    const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty;
    await prisma.order.update({ where: { uuid: order.uuid }, data: { placedAt: new Date(Date.now() - 3 * 3600_000) } });
    await app.get(OrderExpiryService).sweep();
    expect((await prisma.order.findUniqueOrThrow({ where: { uuid: order.uuid } })).status).toBe('CANCELLED');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty).toBeGreaterThanOrEqual(before + 1);
  });
});

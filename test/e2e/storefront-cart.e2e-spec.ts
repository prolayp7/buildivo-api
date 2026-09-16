import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Storefront Cart (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let variantId: number;
  let variantPrice: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/products/${list.body.data[0].slug}`)
      .expect(200);
    variantId = detail.body.data.variants[0].id;
    variantPrice = Number(detail.body.data.variants[0].salePrice ?? detail.body.data.variants[0].price);
  });

  afterAll(async () => {
    await app.close();
  });

  it('builds a guest cart, minting a guest token on first add', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: 2 })
      .expect(201);

    expect(res.body.data.guestToken).toBeTruthy();
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].quantity).toBe(2);
    expect(res.body.data.subtotal).toBeCloseTo(variantPrice * 2, 2);
  });

  it('reads, updates, and removes items using the guest token', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);
    const guestToken = created.body.data.guestToken;

    const getRes = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(getRes.body.data.items[0].quantity).toBe(1);

    await request(app.getHttpServer())
      .patch(`/api/v1/cart/items/${variantId}`)
      .set('x-guest-token', guestToken)
      .send({ quantity: 3 })
      .expect(200);

    const afterUpdate = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(afterUpdate.body.data.items[0].quantity).toBe(3);

    await request(app.getHttpServer())
      .delete(`/api/v1/cart/items/${variantId}`)
      .set('x-guest-token', guestToken)
      .expect(200);

    const afterRemove = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(afterRemove.body.data.items).toHaveLength(0);
  });

  it('merges a guest cart into the customer cart on login', async () => {
    const guestAdd = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: 2 })
      .expect(201);
    const guestToken = guestAdd.body.data.guestToken;

    const email = `cart-customer-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Cart', lastName: 'Tester' })
      .expect(201);
    const accessToken = registerRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cart/merge')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ guestToken })
      .expect(201);

    const customerCart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(customerCart.body.data.items[0].quantity).toBe(2);

    // guest cart is gone after merge
    const goneGuestCart = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(goneGuestCart.body.data.items).toHaveLength(0);
  });

  it('rejects adding more than the available stock', async () => {
    const variant = await prisma.productVariant.findUnique({ where: { id: variantId } });
    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: variant!.stockQty + 1000 })
      .expect(400);
  });

  it('validates a coupon against the current cart', async () => {
    const code = `TESTCOUPON${Date.now()}`;
    await prisma.coupon.create({
      data: { code, name: 'Test coupon', discountType: 'PERCENT', discountAmount: 10, excludeSaleItems: false },
    });

    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);
    const guestToken = added.body.data.guestToken;

    const res = await request(app.getHttpServer())
      .post('/api/v1/cart/coupon/validate')
      .set('x-guest-token', guestToken)
      .send({ code })
      .expect(200);
    expect(res.body.data.discountAmount).toBeCloseTo(variantPrice * 0.1, 2);

    await request(app.getHttpServer())
      .post('/api/v1/cart/coupon/validate')
      .set('x-guest-token', guestToken)
      .send({ code: 'DOES-NOT-EXIST' })
      .expect(400);
  });

  it('quotes shipping methods for the current cart', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);
    const guestToken = added.body.data.guestToken;

    const res = await request(app.getHttpServer())
      .get('/api/v1/shipping-methods')
      .set('x-guest-token', guestToken)
      .expect(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('rate');
  });
});

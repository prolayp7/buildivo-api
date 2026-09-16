import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Storefront Checkout (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let variantId: number;
  let variantPrice: number;
  let shippingMethodId: number;
  let shippingRate: number;

  const address = {
    fullName: 'Jamie Rivers',
    line1: '10 Downing Street',
    city: 'London',
    postcode: 'SW1A 2AA',
    country: 'GB',
  };

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer())
      .get(`/api/v1/products/${list.body.data[0].slug}`)
      .expect(200);
    variantId = detail.body.data.variants[0].id;
    variantPrice = Number(detail.body.data.variants[0].salePrice ?? detail.body.data.variants[0].price);
    // ensure comfortable stock for this suite regardless of seed randomisation
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 50 } });

    // pick a FLAT method with no free-shipping threshold so the rate is deterministic
    // regardless of the cart subtotal (seed data's Royal Mail method waives shipping over £75)
    const method = await prisma.shippingMethod.findFirst({
      where: { status: 'ACTIVE', rateType: 'FLAT', freeOverAmount: null },
    });
    shippingMethodId = method!.id;
    shippingRate = Number(method!.flatRate);
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndAddToCart(quantity = 1) {
    const email = `checkout-${Date.now()}-${Math.random()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Check', lastName: 'Out' })
      .expect(201);
    const accessToken = registerRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productVariantId: variantId, quantity })
      .expect(201);

    return { email, accessToken };
  }

  it('checks out a logged-in customer cart with correct totals and decrements stock', async () => {
    const { accessToken } = await registerAndAddToCart(2);
    const stockBefore = (await prisma.productVariant.findUnique({ where: { id: variantId } }))!.stockQty;

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: address, shippingMethodId })
      .expect(201);

    const order = res.body.data;
    expect(order.status).toBe('AWAITING_PAYMENT');
    expect(order.paymentStatus).toBe('PENDING');
    expect(Number(order.subtotal)).toBeCloseTo(variantPrice * 2, 2);
    expect(Number(order.shippingCharge)).toBeCloseTo(shippingRate, 2);
    // subtotal is VAT-inclusive, so total doesn't add vatTotal on top -
    // vatTotal is only the informational VAT component within subtotal.
    expect(Number(order.total)).toBeCloseTo(
      Number(order.subtotal) - Number(order.discountTotal) + Number(order.shippingCharge),
      2,
    );
    expect(order.items).toHaveLength(1);
    expect(order.items[0].quantity).toBe(2);

    const stockAfter = (await prisma.productVariant.findUnique({ where: { id: variantId } }))!.stockQty;
    expect(stockAfter).toBe(stockBefore - 2);

    const cartAfter = await request(app.getHttpServer())
      .get('/api/v1/cart')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(cartAfter.body.data.items).toHaveLength(0);
  });

  it('applies a coupon discount at checkout and increments coupon usage', async () => {
    const { accessToken } = await registerAndAddToCart(1);
    const code = `CHECKOUT10-${Date.now()}`;
    const coupon = await prisma.coupon.create({
      data: { code, name: 'Checkout test', discountType: 'FIXED', discountAmount: 5, excludeSaleItems: false },
    });

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: address, shippingMethodId, couponCode: code })
      .expect(201);

    expect(Number(res.body.data.discountTotal)).toBeCloseTo(5, 2);
    expect(res.body.data.couponCode).toBe(code);

    const updatedCoupon = await prisma.coupon.findUnique({ where: { id: coupon.id } });
    expect(updatedCoupon!.usageCount).toBe(1);
  });

  it('rejects checkout with an empty cart', async () => {
    const email = `empty-cart-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Empty', lastName: 'Cart' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${registerRes.body.data.accessToken}`)
      .send({ shippingAddress: address, shippingMethodId })
      .expect(400);
  });

  it('rejects checkout that exceeds available stock', async () => {
    const { accessToken } = await registerAndAddToCart(1);
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 0 } });

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ shippingAddress: address, shippingMethodId })
      .expect(400);

    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 50 } });
  });

  it('checks out as a guest, requiring an email', async () => {
    const added = await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);
    const guestToken = added.body.data.guestToken;

    await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-guest-token', guestToken)
      .send({ shippingAddress: address, shippingMethodId })
      .expect(400); // no email

    const res = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('x-guest-token', guestToken)
      .send({ shippingAddress: address, shippingMethodId, email: 'guest-checkout@example.com' })
      .expect(201);
    expect(res.body.data.email).toBe('guest-checkout@example.com');
    expect(res.body.data.userId ?? null).toBeNull();
  });

  it('lists and fetches order history scoped to the owning customer only', async () => {
    const { accessToken: ownerToken } = await registerAndAddToCart(1);
    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ shippingAddress: address, shippingMethodId })
      .expect(201);
    const orderUuid = orderRes.body.data.uuid;

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/orders')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listRes.body.data.some((o: { uuid: string }) => o.uuid === orderUuid)).toBe(true);

    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderUuid}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(detailRes.body.data.uuid).toBe(orderUuid);

    const { accessToken: strangerToken } = await registerAndAddToCart(1);
    await request(app.getHttpServer())
      .get(`/api/v1/orders/${orderUuid}`)
      .set('Authorization', `Bearer ${strangerToken}`)
      .expect(404);

    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
  });
});

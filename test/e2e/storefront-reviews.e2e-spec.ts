import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Storefront Reviews (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let productId: number;
  let orderItemId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());

    const list = await request(app.getHttpServer()).get('/api/v1/products?perPage=1').expect(200);
    const detail = await request(app.getHttpServer()).get(`/api/v1/products/${list.body.data[0].slug}`).expect(200);
    productId = detail.body.data.id;
    const variantId = detail.body.data.variants[0].id;
    await prisma.productVariant.update({ where: { id: variantId }, data: { stockQty: 10 } });

    const method = await prisma.shippingMethod.findFirst({ where: { status: 'ACTIVE' } });

    const email = `reviewer-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'SuperSecret123!', firstName: 'Rev', lastName: 'Iewer' })
      .expect(201);
    accessToken = registerRes.body.data.accessToken;

    await request(app.getHttpServer())
      .post('/api/v1/cart/items')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productVariantId: variantId, quantity: 1 })
      .expect(201);

    const orderRes = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        shippingAddress: { fullName: 'Rev Iewer', line1: '1 Test St', city: 'London', postcode: 'E1 1AA' },
        shippingMethodId: method!.id,
      })
      .expect(201);
    orderItemId = orderRes.body.data.items[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects submission without a token', async () => {
    await request(app.getHttpServer()).post('/api/v1/reviews').send({ productId, rating: 5 }).expect(401);
  });

  it('submits a verified-purchase review as pending, invisible until approved', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, orderItemId, rating: 5, title: 'Great', comment: 'Loved it' })
      .expect(201);
    expect(created.body.data.status).toBe('PENDING');

    const listRes = await request(app.getHttpServer()).get(`/api/v1/reviews?productId=${productId}`).expect(200);
    expect(listRes.body.data.some((r: { id: number }) => r.id === created.body.data.id)).toBe(false);

    await prisma.review.update({ where: { id: created.body.data.id }, data: { status: 'APPROVED' } });
    const listAfterApproval = await request(app.getHttpServer()).get(`/api/v1/reviews?productId=${productId}`).expect(200);
    expect(listAfterApproval.body.data.some((r: { id: number }) => r.id === created.body.data.id)).toBe(true);
  });

  it('rejects a second review for the same order item', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, orderItemId, rating: 4 })
      .expect(409);
  });

  it("rejects an orderItemId that does not belong to the customer's order", async () => {
    const otherEmail = `other-reviewer-${Date.now()}@example.com`;
    const otherRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: otherEmail, password: 'SuperSecret123!', firstName: 'Other', lastName: 'Person' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${otherRes.body.data.accessToken}`)
      .send({ productId, orderItemId, rating: 3 })
      .expect(400);
  });

  it('accepts a review without an orderItemId (unverified)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/reviews')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ productId, rating: 2, comment: 'Meh' })
      .expect(201);
    expect(res.body.data.orderItemId).toBeNull();
  });
});

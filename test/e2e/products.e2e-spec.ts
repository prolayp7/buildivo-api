import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin Products (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let categoryId: number;
  let secondaryCategoryId: number;
  let attributeId: number;
  let attributeValueId: number;
  let productId: number;
  let variantId: number;
  const suffix = Date.now().toString();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
    const [category, secondaryCategory, attribute] = await Promise.all([
      prisma.category.create({ data: { title: 'Test Primary', slug: `test-primary-${suffix}` } }),
      prisma.category.create({ data: { title: 'Test Secondary', slug: `test-secondary-${suffix}` } }),
      prisma.productAttribute.create({ data: { title: 'Test Size', slug: `test-size-${suffix}` } }),
    ]);
    categoryId = category.id;
    secondaryCategoryId = secondaryCategory.id;
    attributeId = attribute.id;
    const value = await prisma.productAttributeValue.create({
      data: { attributeId, value: `16GB-${suffix}` },
    });
    attributeValueId = value.id;
  });

  afterAll(async () => {
    if (productId) {
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    }
    if (attributeId) {
      await prisma.productAttribute.delete({ where: { id: attributeId } }).catch(() => undefined);
    }
    await prisma.category.deleteMany({ where: { id: { in: [categoryId, secondaryCategoryId] } } });
    await app.close();
  });

  it('creates and retrieves a product with secondary categories', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${token}`)
      .send({
        categoryId,
        title: 'Test Gaming PC',
        slug: `test-gaming-pc-${suffix}`,
        status: 'DRAFT',
        secondaryCategoryIds: [secondaryCategoryId],
      })
      .expect(201);
    productId = created.body.data.id;
    expect(created.body.data.secondaryCategories[0].categoryId).toBe(secondaryCategoryId);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detail.body.data.slug).toBe(`test-gaming-pc-${suffix}`);
  });

  it('adds a FAQ and a variant with attributes', async () => {
    const faq = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/faqs`)
      .set('Authorization', `Bearer ${token}`)
      .send({ question: 'Is it upgradeable?', answer: 'Yes.', sortOrder: 1 })
      .expect(201);
    expect(faq.body.data.productId).toBe(productId);

    const variant = await request(app.getHttpServer())
      .post(`/api/v1/admin/products/${productId}/variants`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: '16GB / 1TB',
        slug: `16gb-1tb-${suffix}`,
        price: 1299.99,
        stockQty: 10,
        isDefault: true,
        attributeValueIds: [attributeValueId],
      })
      .expect(201);
    variantId = variant.body.data.id;
    expect(variant.body.data.attributes[0].attributeValueId).toBe(attributeValueId);
  });

  it('supports absolute and delta stock changes without allowing negative stock', async () => {
    const absolute = await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${productId}/variants/${variantId}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ stockQty: 7 })
      .expect(200);
    expect(absolute.body.data.stockQty).toBe(7);

    const delta = await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${productId}/variants/${variantId}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: -2 })
      .expect(200);
    expect(delta.body.data.stockQty).toBe(5);

    await request(app.getHttpServer())
      .patch(`/api/v1/admin/products/${productId}/variants/${variantId}/stock`)
      .set('Authorization', `Bearer ${token}`)
      .send({ delta: -6 })
      .expect(400);
  });

  it('soft-deletes the product and excludes it from normal reads', async () => {
    await request(app.getHttpServer())
      .delete(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    const deletedList = await request(app.getHttpServer())
      .get('/api/v1/admin/products?includeDeleted=true')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(deletedList.body.data.some((product: { id: number }) => product.id === productId)).toBe(true);
  });
});

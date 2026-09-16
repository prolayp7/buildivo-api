import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin Product Import (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let categoryId: number;
  let productId: number;
  const suffix = Date.now();
  const slug = `imported-product-${suffix}`;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
    categoryId = (await prisma.category.create({
      data: { title: 'Import Test', slug: `import-test-${suffix}` },
    })).id;
  });

  afterAll(async () => {
    if (productId) await prisma.product.delete({ where: { id: productId } }).catch(() => undefined);
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    await app.close();
  });

  it('imports valid JSON rows and reports invalid rows', async () => {
    const payload = Buffer.from(JSON.stringify({ products: [
      { categoryId, title: 'Imported Product', slug, status: 'DRAFT' },
      { categoryId, title: '', slug: `invalid-${suffix}` },
    ] }));
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', payload, { filename: 'products.json', contentType: 'application/json' })
      .expect(200);
    expect(response.body.data.created).toBe(1);
    expect(response.body.data.errors).toHaveLength(1);
    productId = (await prisma.product.findFirstOrThrow({ where: { slug } })).id;
  });

  it('updates a live product with a matching slug from CSV', async () => {
    const csv = `categoryId,title,slug,status\n${categoryId},Updated Imported Product,${slug},ACTIVE\n`;
    const response = await request(app.getHttpServer())
      .post('/api/v1/admin/products/import')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from(csv), { filename: 'products.csv', contentType: 'text/csv' })
      .expect(200);
    expect(response.body.data.updated).toBe(1);
    const updated = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
    expect(updated.title).toBe('Updated Imported Product');
    expect(updated.status).toBe('ACTIVE');
  });
});

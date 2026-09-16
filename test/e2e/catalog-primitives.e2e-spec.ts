import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Admin catalog primitives (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const ids: { condition?: number; taxRate?: number; attribute?: number } = {};

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  afterAll(async () => {
    if (ids.attribute) {
      await prisma.productAttribute.delete({ where: { id: ids.attribute } }).catch(() => undefined);
    }
    if (ids.taxRate) {
      await prisma.taxRate.delete({ where: { id: ids.taxRate } }).catch(() => undefined);
    }
    if (ids.condition) {
      await prisma.productCondition.delete({ where: { id: ids.condition } }).catch(() => undefined);
    }
    await app.close();
  });

  it('creates and lists product conditions', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/product-conditions')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Refurbished', slug: 'test-refurbished' })
      .expect(201);
    ids.condition = created.body.data.id;

    const listed = await request(app.getHttpServer())
      .get('/api/v1/admin/product-conditions')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listed.body.data.some((item: { id: number }) => item.id === ids.condition)).toBe(true);
  });

  it('creates a validated tax rate', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/admin/tax-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test VAT', ratePercent: 20, status: 'ACTIVE' })
      .expect(201);
    ids.taxRate = created.body.data.id;
    expect(Number(created.body.data.ratePercent)).toBe(20);

    await request(app.getHttpServer())
      .post('/api/v1/admin/tax-rates')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Invalid VAT', ratePercent: 101 })
      .expect(400);
  });

  it('creates an attribute and nested value', async () => {
    const attribute = await request(app.getHttpServer())
      .post('/api/v1/admin/product-attributes')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Colour', slug: 'test-colour', inputType: 'COLOR_SWATCH' })
      .expect(201);
    ids.attribute = attribute.body.data.id;

    const value = await request(app.getHttpServer())
      .post(`/api/v1/admin/product-attributes/${ids.attribute}/values`)
      .set('Authorization', `Bearer ${token}`)
      .send({ value: 'Midnight', swatchValue: '#111827', sortOrder: 1 })
      .expect(201);
    expect(value.body.data.attributeId).toBe(ids.attribute);
  });
});

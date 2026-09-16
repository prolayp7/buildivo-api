import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Admin Brands (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let brandId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  afterAll(async () => {
    if (brandId) await prisma.brand.delete({ where: { id: brandId } }).catch(() => undefined);
    await app.close();
  });

  it('creates, lists, updates, and deletes a brand', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/brands')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test AMD', slug: 'test-amd' })
      .expect(201);
    brandId = createRes.body.data.id;

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/admin/brands')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data.some((b: { id: number }) => b.id === brandId)).toBe(true);

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/brands/${brandId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Chips and GPUs' })
      .expect(200);
    expect(patchRes.body.data.description).toBe('Chips and GPUs');

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/brands/${brandId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    brandId = 0;
  });
});

import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Admin Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let categoryId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
  });

  afterAll(async () => {
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined);
    await app.close();
  });

  it('creates, lists, updates, and soft-deletes a category', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Monitors', slug: 'test-monitors' })
      .expect(201);
    categoryId = createRes.body.data.id;
    expect(createRes.body.data.slug).toBe('test-monitors');

    const listRes = await request(app.getHttpServer())
      .get('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listRes.body.data.some((c: { id: number }) => c.id === categoryId)).toBe(true);

    const patchRes = await request(app.getHttpServer())
      .patch(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' })
      .expect(200);
    expect(patchRes.body.data.description).toBe('Updated description');

    await request(app.getHttpServer())
      .delete(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    const getAfterDelete = await request(app.getHttpServer())
      .get(`/api/v1/admin/categories/${categoryId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(getAfterDelete.body.error.code).toBe('NOT_FOUND');
  });

  it('rejects creating a category with a slug already used by a live category', async () => {
    const first = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Laptops', slug: 'test-laptops-dup' })
      .expect(201);

    const dupe = await request(app.getHttpServer())
      .post('/api/v1/admin/categories')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Laptops Again', slug: 'test-laptops-dup' })
      .expect(409);
    expect(dupe.body.error.code).toBe('CONFLICT');

    await prisma.category.delete({ where: { id: first.body.data.id } });
  });
});

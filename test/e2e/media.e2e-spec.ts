import { INestApplication } from '@nestjs/common'; import * as request from 'supertest'; import { PrismaService } from '../../src/prisma/prisma.service'; import { loginAsSuperAdmin } from './helpers/admin-auth'; import { createTestApp } from './setup';
describe('Admin Media (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let token: string; let categoryId: number; let mediaId: number; const suffix = Date.now();
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); const category = await prisma.category.create({ data: { title: 'Media Test', slug: `media-test-${suffix}` } }); categoryId = category.id; });
  afterAll(async () => { if (mediaId) await prisma.media.delete({ where: { id: mediaId } }).catch(() => undefined); if (categoryId) await prisma.category.delete({ where: { id: categoryId } }).catch(() => undefined); await app.close(); });
  it('uploads, lists, updates, and removes an owner image', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
    const uploaded = await request(app.getHttpServer()).post('/api/v1/admin/media').set('Authorization', `Bearer ${token}`).field('ownerType', 'CATEGORY').field('ownerId', String(categoryId)).field('collection', 'hero').field('altText', 'Test image').attach('file', png, { filename: 'test.png', contentType: 'image/png' });
    expect({ status: uploaded.status, body: uploaded.body }).toEqual(expect.objectContaining({ status: 201 }));
    mediaId = uploaded.body.data.id;
    expect(uploaded.body.data.url).toMatch(/^\/uploads\/.+\.webp$/);
    expect(uploaded.body.data.metadata).toMatchObject({ mimeType: 'image/webp', originalMimeType: 'image/png', width: 1, height: 1 });
    const listed = await request(app.getHttpServer()).get(`/api/v1/admin/media?ownerType=CATEGORY&ownerId=${categoryId}&collection=hero`).set('Authorization', `Bearer ${token}`).expect(200); expect(listed.body.data).toHaveLength(1);
    const updated = await request(app.getHttpServer()).patch(`/api/v1/admin/media/${mediaId}`).set('Authorization', `Bearer ${token}`).send({ sortOrder: 2 }).expect(200); expect(updated.body.data.sortOrder).toBe(2);
    await request(app.getHttpServer()).delete(`/api/v1/admin/media/${mediaId}`).set('Authorization', `Bearer ${token}`).expect(204); mediaId = 0;
  });
});

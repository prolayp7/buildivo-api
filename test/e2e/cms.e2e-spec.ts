import { INestApplication } from '@nestjs/common'; import * as request from 'supertest'; import { PrismaService } from '../../src/prisma/prisma.service'; import { loginAsSuperAdmin } from './helpers/admin-auth'; import { createTestApp } from './setup';
describe('Admin CMS (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let token: string; let categoryId: number; let postId: number; let pageId: number; const suffix = Date.now();
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); });
  afterAll(async () => { if (postId) await prisma.blogPost.delete({ where: { id: postId } }).catch(() => undefined); if (categoryId) await prisma.blogCategory.delete({ where: { id: categoryId } }).catch(() => undefined); if (pageId) await prisma.page.delete({ where: { id: pageId } }).catch(() => undefined); await app.close(); });
  it('creates a category and publishes a blog post', async () => {
    const category = await request(app.getHttpServer()).post('/api/v1/admin/blog/categories').set('Authorization', `Bearer ${token}`).send({ title: 'Test Guides', slug: `test-guides-${suffix}` }).expect(201); categoryId = category.body.data.id;
    const post = await request(app.getHttpServer()).post('/api/v1/admin/blog/posts').set('Authorization', `Bearer ${token}`).send({ blogCategoryId: categoryId, title: 'Test Build Guide', slug: `test-build-guide-${suffix}`, content: 'Guide content', tags: ['builds'], status: 'PUBLISHED' }).expect(201); postId = post.body.data.id; expect(post.body.data.publishedAt).toBeTruthy();
  });
  it('creates and updates a JSON-block page', async () => {
    const page = await request(app.getHttpServer()).post('/api/v1/admin/pages').set('Authorization', `Bearer ${token}`).send({ slug: `test-page-${suffix}`, title: 'Test Page', contentBlocks: [{ type: 'text', value: 'Hello' }] }).expect(201); pageId = page.body.data.id;
    const updated = await request(app.getHttpServer()).patch(`/api/v1/admin/pages/${pageId}`).set('Authorization', `Bearer ${token}`).send({ status: 'PUBLISHED' }).expect(200); expect(updated.body.data.status).toBe('PUBLISHED');
  });
});

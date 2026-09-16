import { INestApplication } from '@nestjs/common'; import * as request from 'supertest'; import { PrismaService } from '../../src/prisma/prisma.service'; import { loginAsSuperAdmin } from './helpers/admin-auth'; import { createTestApp } from './setup';
describe('Admin Merchandising (e2e)', () => {
  let app: INestApplication; let prisma: PrismaService; let token: string; let bannerId: number; let slideId: number; let badgeId: number; const suffix = Date.now();
  beforeAll(async () => { ({ app, prisma } = await createTestApp()); token = await loginAsSuperAdmin(app); });
  afterAll(async () => { if (bannerId) await prisma.banner.delete({ where: { id: bannerId } }).catch(() => undefined); if (slideId) await prisma.heroSlide.delete({ where: { id: slideId } }).catch(() => undefined); if (badgeId) await prisma.heroTrustBadge.delete({ where: { id: badgeId } }).catch(() => undefined); await app.close(); });
  it('creates and retargets a banner', async () => {
    const created = await request(app.getHttpServer()).post('/api/v1/admin/banners').set('Authorization', `Bearer ${token}`).send({ title: 'Test Sale', slug: `test-sale-${suffix}`, linkType: 'CUSTOM_URL', customUrl: '/sale', position: 'homepage' }).expect(201); bannerId = created.body.data.id;
    const updated = await request(app.getHttpServer()).patch(`/api/v1/admin/banners/${bannerId}`).set('Authorization', `Bearer ${token}`).send({ customUrl: '/clearance' }).expect(200); expect(updated.body.data.customUrl).toBe('/clearance');
  });
  it('creates a scheduled hero slide and trust badge', async () => {
    const slide = await request(app.getHttpServer()).post('/api/v1/admin/hero-slides').set('Authorization', `Bearer ${token}`).send({ headline: 'Test Hero', sortOrder: 99 }).expect(201); slideId = slide.body.data.id;
    const badge = await request(app.getHttpServer()).post('/api/v1/admin/hero-trust-badges').set('Authorization', `Bearer ${token}`).send({ label: 'Test Guarantee', sortOrder: 99 }).expect(201); badgeId = badge.body.data.id;
  });
});

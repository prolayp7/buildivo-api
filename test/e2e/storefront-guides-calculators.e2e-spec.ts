import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from './setup';

const api = (app: INestApplication) => request(app.getHttpServer());

describe('DIY guides, calculators and free-delivery threshold (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const stamp = Date.now();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
  });

  afterAll(async () => {
    await prisma.blogPost.deleteMany({ where: { slug: { startsWith: `zz-guide-${stamp}` } } });
    await app.close();
  });

  it('exposes the lowest free-delivery threshold from the active shipping methods', async () => {
    const methods = await prisma.shippingMethod.findMany({ where: { status: 'ACTIVE', freeOverAmount: { not: null } } });
    const expected = methods.length ? Math.min(...methods.map((m) => Number(m.freeOverAmount))) : null;
    const res = await api(app).get('/api/v1/shipping-methods/free-delivery-threshold').expect(200);
    expect(res.body.data.threshold).toBe(expected);
  });

  describe('materials calculator', () => {
    let productId: number;
    let slug: string;
    let original: { coverageValue: unknown; coverageUnit: string | null };

    beforeAll(async () => {
      const product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE', deletedAt: null } });
      productId = product.id; slug = product.slug;
      original = { coverageValue: product.coverageValue, coverageUnit: product.coverageUnit };
      await prisma.product.update({ where: { id: productId }, data: { coverageValue: 5, coverageUnit: 'm2_per_bag' } });
    });
    afterAll(async () => {
      await prisma.product.update({ where: { id: productId }, data: { coverageValue: original.coverageValue as never, coverageUnit: original.coverageUnit } });
    });

    it('lists products that have coverage data, with what the picker needs', async () => {
      const list = (await api(app).get('/api/v1/calculators/products').expect(200)).body.data as { slug: string; coverageValue: number; coverageUnit: string; variantId: number | null }[];
      const found = list.find((item) => item.slug === slug)!;
      expect(found).toMatchObject({ coverageValue: 5, coverageUnit: 'm2_per_bag' });
      expect(found.variantId).not.toBeNull();
    });

    it('rounds up to whole units after wastage: 23 m2 + 10% at 5 m2/bag = 6 bags', async () => {
      const res = await api(app).get('/api/v1/calculators/materials').query({ productSlug: slug, area: 23, wastagePercent: 10 }).expect(200);
      expect(res.body.data).toMatchObject({ unitsNeeded: 6, wastagePercent: 10, area: 23 });
    });
  });

  describe('guide filter on the blog list', () => {
    it('returns only posts that have steps', async () => {
      const base = { content: '<p>x</p>', status: 'PUBLISHED' as const, publishedAt: new Date() };
      await prisma.blogPost.create({ data: { ...base, title: 'With steps', slug: `zz-guide-${stamp}-yes`, steps: [{ title: 'One', description: 'Do it' }], difficulty: 'Beginner', estimatedTimeMinutes: 30 } });
      await prisma.blogPost.create({ data: { ...base, title: 'Empty steps', slug: `zz-guide-${stamp}-empty`, steps: [] } });
      await prisma.blogPost.create({ data: { ...base, title: 'No steps', slug: `zz-guide-${stamp}-none` } });

      const guides = (await api(app).get('/api/v1/blog').query({ guides: 'true', perPage: 100 }).expect(200)).body.data as { slug: string; difficulty: string | null }[];
      const ours = guides.filter((post) => post.slug.startsWith(`zz-guide-${stamp}`)).map((post) => post.slug);
      expect(ours).toEqual([`zz-guide-${stamp}-yes`]);

      const all = (await api(app).get('/api/v1/blog').query({ perPage: 100 }).expect(200)).body.data as { slug: string }[];
      expect(all.filter((post) => post.slug.startsWith(`zz-guide-${stamp}`))).toHaveLength(3);
    });
  });
});

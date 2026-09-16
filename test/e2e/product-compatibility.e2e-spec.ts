import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { loginAsSuperAdmin } from './helpers/admin-auth';
import { createTestApp } from './setup';

describe('Product Compatibility (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  let categoryId: number;
  const suffix = Date.now().toString();

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    token = await loginAsSuperAdmin(app);
    const category = await prisma.category.create({ data: { title: 'Compat Test', slug: `compat-test-${suffix}` } });
    categoryId = category.id;
  });

  afterAll(async () => {
    await prisma.product.deleteMany({ where: { categoryId } });
    await prisma.category.delete({ where: { id: categoryId } });
    await app.close();
  });

  describe('admin CRUD', () => {
    let productId: number;

    it('creates a product with compatibility facts', async () => {
      const res = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId,
          title: 'Compat CPU',
          slug: `compat-cpu-${suffix}`,
          status: 'ACTIVE',
          compatibility: { socket: 'AM5' },
        })
        .expect(201);
      productId = res.body.data.id;
      expect(res.body.data.compatibility.socket).toBe('AM5');

      const detail = await request(app.getHttpServer())
        .get(`/api/v1/admin/products/${productId}`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(detail.body.data.compatibility.socket).toBe('AM5');
    });

    it('upserts compatibility on update - creating then changing it', async () => {
      const withoutCompat = await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({ categoryId, title: 'No Compat Yet', slug: `no-compat-yet-${suffix}`, status: 'ACTIVE' })
        .expect(201);
      expect(withoutCompat.body.data.compatibility).toBeNull();

      const firstUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${withoutCompat.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ compatibility: { wattageCapacity: 650 } })
        .expect(200);
      expect(firstUpdate.body.data.compatibility.wattageCapacity).toBe(650);

      const secondUpdate = await request(app.getHttpServer())
        .patch(`/api/v1/admin/products/${withoutCompat.body.data.id}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ compatibility: { wattageCapacity: 750 } })
        .expect(200);
      expect(secondUpdate.body.data.compatibility.wattageCapacity).toBe(750);
    });

    it('rejects a socket longer than 60 characters', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${token}`)
        .send({
          categoryId,
          title: 'Bad Compat',
          slug: `bad-compat-${suffix}`,
          compatibility: { socket: 'x'.repeat(61) },
        })
        .expect(400);
    });
  });

  describe('storefront matching', () => {
    let cpuSlug: string;
    let matchingBoardSlug: string;
    let wrongSocketBoardSlug: string;
    let matchingCoolerSlug: string;
    let wrongSocketCoolerSlug: string;
    let matchingRamSlug: string;
    let wrongMemTypeRamSlug: string;
    let gpuSlug: string;
    let sufficientPsuSlug: string;
    let insufficientPsuSlug: string;
    let otherCategoryId: number;

    beforeAll(async () => {
      const otherCategory = await prisma.category.create({ data: { title: 'Compat PSU Cat', slug: `compat-psu-cat-${suffix}` } });
      otherCategoryId = otherCategory.id;

      interface CompatFacts {
        socket?: string;
        compatibleSockets?: string[];
        memoryType?: string;
        wattageCapacity?: number;
        wattageRequired?: number;
      }
      const make = (title: string, data: CompatFacts, catId = categoryId) =>
        prisma.product.create({
          data: {
            categoryId: catId,
            title,
            slug: `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${suffix}`,
            status: 'ACTIVE',
            compatibility: { create: data },
          },
        });

      const cpu = await make('Compat Ryzen CPU', { socket: 'AM5' });
      cpuSlug = cpu.slug;
      const board1 = await make('Compat Match Board', { socket: 'AM5' });
      matchingBoardSlug = board1.slug;
      const board2 = await make('Compat Wrong Board', { socket: 'AM4' });
      wrongSocketBoardSlug = board2.slug;
      const cooler1 = await make('Compat Match Cooler', { compatibleSockets: ['AM5', 'AM4'] });
      matchingCoolerSlug = cooler1.slug;
      const cooler2 = await make('Compat Wrong Cooler', { compatibleSockets: ['LGA1700'] });
      wrongSocketCoolerSlug = cooler2.slug;
      const ram1 = await make('Compat Match RAM', { memoryType: 'DDR5' });
      matchingRamSlug = ram1.slug;
      const ram2 = await make('Compat Wrong RAM', { memoryType: 'DDR4' });
      wrongMemTypeRamSlug = ram2.slug;

      const gpu = await make('Compat GPU', { wattageRequired: 650 }, otherCategoryId);
      gpuSlug = gpu.slug;
      const psuOk = await make('Compat Sufficient PSU', { wattageCapacity: 750 }, otherCategoryId);
      sufficientPsuSlug = psuOk.slug;
      const psuLow = await make('Compat Insufficient PSU', { wattageCapacity: 500 }, otherCategoryId);
      insufficientPsuSlug = psuLow.slug;

      // no-compatibility control product
      await prisma.product.create({
        data: { categoryId, title: 'Compat No Facts', slug: `compat-no-facts-${suffix}`, status: 'ACTIVE' },
      });
    });

    afterAll(async () => {
      await prisma.product.deleteMany({ where: { categoryId: otherCategoryId } });
      await prisma.category.delete({ where: { id: otherCategoryId } });
    });

    it('includes compatibility facts in the product detail response', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${cpuSlug}`).expect(200);
      expect(res.body.data.compatibility.socket).toBe('AM5');
    });

    it('matches a CPU to its socket-compatible motherboard and cooler, excluding mismatches', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${cpuSlug}/compatible?limit=10`).expect(200);
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(matchingBoardSlug);
      expect(slugs).toContain(matchingCoolerSlug);
      expect(slugs).toContain(matchingRamSlug);
      expect(slugs).not.toContain(wrongSocketBoardSlug);
      expect(slugs).not.toContain(wrongSocketCoolerSlug);
      expect(slugs).not.toContain(wrongMemTypeRamSlug);
    });

    it('matches a GPU to a PSU with sufficient wattage, excluding an underpowered one', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/${gpuSlug}/compatible?limit=10`).expect(200);
      const slugs = res.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(sufficientPsuSlug);
      expect(slugs).not.toContain(insufficientPsuSlug);
    });

    it('scopes matches to a given category slug', async () => {
      const category = await prisma.category.findUniqueOrThrow({ where: { id: categoryId } });
      const res = await request(app.getHttpServer())
        .get(`/api/v1/products/${gpuSlug}/compatible?category=${category.slug}&limit=10`)
        .expect(200);
      // sufficientPsuSlug lives in otherCategoryId, so scoping to `categoryId` excludes it
      expect(res.body.data.some((p: { slug: string }) => p.slug === sufficientPsuSlug)).toBe(false);
    });

    it('returns an empty list for a product with no compatibility facts', async () => {
      const res = await request(app.getHttpServer()).get(`/api/v1/products/compat-no-facts-${suffix}/compatible`).expect(200);
      expect(res.body.data).toEqual([]);
    });
  });
});

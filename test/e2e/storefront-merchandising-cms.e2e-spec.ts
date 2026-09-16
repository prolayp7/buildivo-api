import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './setup';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Storefront Merchandising & CMS (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let productId: number;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const product = await prisma.product.findFirstOrThrow({ where: { status: 'ACTIVE', deletedAt: null } });
    productId = product.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /home', () => {
    it('returns only active, in-window hero slides and badges', async () => {
      const activeSlide = await prisma.heroSlide.create({ data: { headline: `Active ${Date.now()}`, sortOrder: 0 } });
      const inactiveSlide = await prisma.heroSlide.create({ data: { headline: `Inactive ${Date.now()}`, status: 'INACTIVE' } });
      const futureSlide = await prisma.heroSlide.create({ data: { headline: `Future ${Date.now()}`, startsAt: new Date(Date.now() + 86_400_000) } });
      const badge = await prisma.heroTrustBadge.create({ data: { label: `Badge ${Date.now()}` } });

      const res = await request(app.getHttpServer()).get('/api/v1/home').expect(200);
      const headlines = res.body.data.hero.slides.map((s: { headline: string }) => s.headline);
      expect(headlines).toContain(activeSlide.headline);
      expect(headlines).not.toContain(inactiveSlide.headline);
      expect(headlines).not.toContain(futureSlide.headline);
      expect(res.body.data.hero.badges.some((b: { id: number }) => b.id === badge.id)).toBe(true);
    });

    it('resolves manual featured-section products', async () => {
      const section = await prisma.featuredSection.create({
        data: {
          title: `Manual section ${Date.now()}`,
          slug: `manual-section-${Date.now()}`,
          sectionType: 'MANUAL',
          manualProducts: { create: [{ productId, sortOrder: 0 }] },
        },
      });

      const res = await request(app.getHttpServer()).get('/api/v1/home').expect(200);
      const found = res.body.data.featuredSections.find((s: { id: number }) => s.id === section.id);
      expect(found).toBeDefined();
      expect(found.products.some((p: { id: number }) => p.id === productId)).toBe(true);
    });

    it('resolves a NEWLY_ADDED featured section to real active products', async () => {
      const section = await prisma.featuredSection.create({
        data: { title: `Newest ${Date.now()}`, slug: `newest-${Date.now()}`, sectionType: 'NEWLY_ADDED' },
      });

      const res = await request(app.getHttpServer()).get('/api/v1/home').expect(200);
      const found = res.body.data.featuredSections.find((s: { id: number }) => s.id === section.id);
      expect(found.products.length).toBeGreaterThan(0);
    });

    it('excludes expired banners', async () => {
      const expired = await prisma.banner.create({
        data: {
          title: `Expired ${Date.now()}`,
          slug: `expired-${Date.now()}`,
          linkType: 'CUSTOM_URL',
          customUrl: 'https://example.com',
          position: 'home-top',
          endsAt: new Date(Date.now() - 86_400_000),
        },
      });
      const res = await request(app.getHttpServer()).get('/api/v1/home').expect(200);
      expect(res.body.data.banners.some((b: { id: number }) => b.id === expired.id)).toBe(false);
    });
  });

  describe('CMS: pages, blog, faqs, testimonials', () => {
    it('serves a published page and 404s a draft one', async () => {
      const slug = `about-us-${Date.now()}`;
      await prisma.page.create({ data: { slug, title: 'About Us', status: 'PUBLISHED' } });
      const draftSlug = `draft-page-${Date.now()}`;
      await prisma.page.create({ data: { slug: draftSlug, title: 'Draft', status: 'DRAFT' } });

      const res = await request(app.getHttpServer()).get(`/api/v1/pages/${slug}`).expect(200);
      expect(res.body.data.title).toBe('About Us');

      await request(app.getHttpServer()).get(`/api/v1/pages/${draftSlug}`).expect(404);
    });

    it('lists published blog posts, filters by category, and hides drafts', async () => {
      const category = await prisma.blogCategory.create({ data: { title: `News ${Date.now()}`, slug: `news-${Date.now()}` } });
      const author = await prisma.author.create({ data: { name: 'Jane Author' } });
      const published = await prisma.blogPost.create({
        data: {
          title: `Published post ${Date.now()}`,
          slug: `published-post-${Date.now()}`,
          content: 'Hello world',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          blogCategoryId: category.id,
          authorId: author.id,
        },
      });
      const draft = await prisma.blogPost.create({
        data: { title: `Draft post ${Date.now()}`, slug: `draft-post-${Date.now()}`, content: 'Shh', status: 'DRAFT' },
      });

      const list = await request(app.getHttpServer()).get('/api/v1/blog').expect(200);
      const slugs = list.body.data.map((p: { slug: string }) => p.slug);
      expect(slugs).toContain(published.slug);
      expect(slugs).not.toContain(draft.slug);

      const filtered = await request(app.getHttpServer()).get(`/api/v1/blog?category=${category.slug}`).expect(200);
      expect(filtered.body.data.every((p: { blogCategory: { slug: string } }) => p.blogCategory.slug === category.slug)).toBe(true);

      const detail = await request(app.getHttpServer()).get(`/api/v1/blog/${published.slug}`).expect(200);
      expect(detail.body.data.author.name).toBe('Jane Author');

      await request(app.getHttpServer()).get(`/api/v1/blog/${draft.slug}`).expect(404);
    });

    it('groups FAQs by category', async () => {
      const category = await prisma.faqCategory.create({ data: { name: `Shipping ${Date.now()}` } });
      const faq = await prisma.faq.create({ data: { faqCategoryId: category.id, question: 'How long?', answer: 'Soon' } });

      const res = await request(app.getHttpServer()).get('/api/v1/faqs').expect(200);
      const found = res.body.data.find((c: { id: number }) => c.id === category.id);
      expect(found).toBeDefined();
      expect(found.faqs.some((f: { id: number }) => f.id === faq.id)).toBe(true);
    });

    it('lists active testimonials', async () => {
      const testimonial = await prisma.testimonial.create({ data: { name: 'Alex', quote: 'Great shop!', stars: 5 } });
      const res = await request(app.getHttpServer()).get('/api/v1/testimonials').expect(200);
      expect(res.body.data.some((t: { id: number }) => t.id === testimonial.id)).toBe(true);
    });
  });
});

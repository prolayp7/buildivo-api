import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { PrismaService } from '../../src/prisma/prisma.service';
import { createTestApp } from './setup';

const api = (app: INestApplication) => request(app.getHttpServer());

describe('Sitemap and robots (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let indexable: { id: number; slug: string; isIndexable: boolean };
  let hidden: { id: number; slug: string; isIndexable: boolean };
  const PAGE = 'zz-sitemap-page';

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    const [a, b] = await prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null }, orderBy: { id: 'asc' }, take: 2, select: { id: true, slug: true, isIndexable: true } });
    indexable = a; hidden = b;
    await prisma.product.update({ where: { id: a.id }, data: { isIndexable: true } });
    await prisma.product.update({ where: { id: b.id }, data: { isIndexable: false } });
    await prisma.page.deleteMany({ where: { slug: PAGE } });
    await prisma.page.create({ data: { slug: PAGE, title: 'Sitemap test', status: 'PUBLISHED' } });
  });

  afterAll(async () => {
    await prisma.page.deleteMany({ where: { slug: PAGE } });
    await prisma.product.update({ where: { id: indexable.id }, data: { isIndexable: indexable.isIndexable } });
    await prisma.product.update({ where: { id: hidden.id }, data: { isIndexable: hidden.isIndexable } });
    await app.close();
  });

  it('serves raw XML (not the JSON envelope)', async () => {
    const res = await api(app).get('/api/v1/sitemap.xml').expect(200);
    expect(res.headers['content-type']).toContain('application/xml');
    expect(res.text.startsWith('<?xml')).toBe(true);
    expect(res.text).toContain('<urlset');
  });

  it('uses the storefront route shapes: /p/, /c/, /blog and root-level pages', async () => {
    const { text } = await api(app).get('/api/v1/sitemap.xml').expect(200);
    expect(text).toMatch(/\/blog<\/loc>/);
    expect(text).toContain(`/p/${indexable.slug}</loc>`);
    expect(text).toMatch(/\/c\/[a-z0-9-]+<\/loc>/);
    expect(text).toMatch(new RegExp(`/${PAGE}</loc>`));
    expect(text).not.toContain('/products/');
    expect(text).not.toContain('/category/');
  });

  it('leaves out products an admin marked not indexable', async () => {
    const { text } = await api(app).get('/api/v1/sitemap.xml').expect(200);
    expect(text).not.toContain(`/p/${hidden.slug}</loc>`);
  });

  it('serves robots.txt as plain text pointing at the sitemap', async () => {
    const res = await api(app).get('/api/v1/robots.txt').expect(200);
    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('Sitemap: ');
  });
});

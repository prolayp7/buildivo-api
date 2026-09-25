import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

// Public address of the storefront (buildivo); must match its NEXT_PUBLIC_SITE_URL.
const STOREFRONT_URL = (process.env.STOREFRONT_URL ?? 'http://localhost:3002').replace(/\/$/, '');

function escapeXml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface SitemapUrl {
  loc: string;
  lastmod?: Date;
}

@Injectable()
export class SitemapService {
  constructor(private readonly prisma: PrismaService) {}

  async buildSitemap(): Promise<string> {
    const [products, categories, posts, pages] = await Promise.all([
      this.prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null, isIndexable: true }, select: { slug: true, updatedAt: true } }),
      this.prisma.category.findMany({ where: { deletedAt: null, status: 'ACTIVE' }, select: { slug: true, updatedAt: true } }),
      this.prisma.blogPost.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
      this.prisma.page.findMany({ where: { status: 'PUBLISHED' }, select: { slug: true, updatedAt: true } }),
    ]);
    const urls: SitemapUrl[] = [
      { loc: `${STOREFRONT_URL}/` },
      { loc: `${STOREFRONT_URL}/blog` },
      ...products.map((p) => ({ loc: `${STOREFRONT_URL}/p/${encodeURIComponent(p.slug)}`, lastmod: p.updatedAt })),
      ...categories.map((c) => ({ loc: `${STOREFRONT_URL}/c/${encodeURIComponent(c.slug)}`, lastmod: c.updatedAt })),
      ...posts.map((p) => ({ loc: `${STOREFRONT_URL}/blog/${encodeURIComponent(p.slug)}`, lastmod: p.updatedAt })),
      ...pages.map((p) => ({ loc: `${STOREFRONT_URL}/${encodeURIComponent(p.slug)}`, lastmod: p.updatedAt })),
    ];
    const body = urls
      .map((u) => `  <url><loc>${escapeXml(u.loc)}</loc>${u.lastmod ? `<lastmod>${u.lastmod.toISOString()}</lastmod>` : ''}</url>`)
      .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  }

  buildRobots(): string {
    return `User-agent: *\nAllow: /\nSitemap: ${STOREFRONT_URL}/sitemap.xml\n`;
  }
}

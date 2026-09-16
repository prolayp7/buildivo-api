import { PrismaService } from '../../src/prisma/prisma.service';

describe('Search & Personalization', () => {
  const prisma = new PrismaService();
  let categoryId: number;
  let productId: number;
  let searchLogId: number;
  let trendingId: number;

  beforeAll(async () => {
    const category = await prisma.category.create({ data: { title: 'Test Search Category', slug: 'test-search-category' } });
    categoryId = category.id;
    const product = await prisma.product.create({
      data: { categoryId, title: 'Test Search Product', slug: 'test-search-product', status: 'ACTIVE' },
    });
    productId = product.id;
  });

  afterAll(async () => {
    if (trendingId) await prisma.trendingProduct.delete({ where: { id: trendingId } });
    if (searchLogId) await prisma.searchLog.delete({ where: { id: searchLogId } });
    if (productId) await prisma.product.delete({ where: { id: productId } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });

  it('logs a search and computes a trending score for a product', async () => {
    const log = await prisma.searchLog.create({
      data: { query: 'rtx 4070', resultCount: 3, entityTypes: ['product'] },
    });
    searchLogId = log.id;

    const trending = await prisma.trendingProduct.create({
      data: { productId, period: 'DAILY', searchCount: 12, viewCount: 40, saleCount: 2, score: 54, computedAt: new Date() },
    });
    trendingId = trending.id;

    const found = await prisma.trendingProduct.findUniqueOrThrow({
      where: { id: trendingId },
      include: { product: true },
    });
    expect(found.product.title).toBe('Test Search Product');
  });
});

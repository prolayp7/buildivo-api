import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';
import { EmbeddingsService } from '../../../admin/ai/embeddings.service';
import { StorefrontProductsService } from './storefront-products.service';

export type RecommendationSource = 'curated' | 'bought-together' | 'same-platform' | 'similar' | 'same-category' | 'best-seller';

// "You may also need" list. Sources are tried strongest-first and de-duplicated, so an admin-curated
// pick always outranks a statistical one. Everything but 'similar' works with no AI key and no
// extensions; 'similar' (pgvector) contributes nothing until it is set up and indexed.
@Injectable()
export class StorefrontRecommendationsService {
  constructor(private readonly prisma: PrismaService, private readonly products: StorefrontProductsService, private readonly embeddings: EmbeddingsService) {}

  async forProduct(slug: string, limit: number) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      select: { id: true, categoryId: true, toolPlatform: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const picked = new Map<number, RecommendationSource>();
    const add = (ids: number[], source: RecommendationSource) => {
      for (const id of ids) if (id !== product.id && picked.size < limit && !picked.has(id)) picked.set(id, source);
    };
    // Each source runs only while there is still room, so a fully curated product costs one query.
    const fill = async (source: RecommendationSource, load: () => Promise<number[]>) => {
      if (picked.size < limit) add(await load(), source);
    };
    const wanted = limit * 2; // headroom: some candidates are inactive or already picked

    await fill('curated', async () => (await this.prisma.productRelated.findMany({ where: { productId: product.id }, select: { relatedProductId: true }, take: wanted })).map((r) => r.relatedProductId));
    await fill('bought-together', async () => {
      const orders = await this.prisma.orderItem.findMany({ where: { productId: product.id }, select: { orderId: true }, distinct: ['orderId'] });
      if (!orders.length) return [];
      const co = await this.prisma.orderItem.groupBy({
        by: ['productId'],
        where: { orderId: { in: orders.map((o) => o.orderId) }, productId: { not: product.id } },
        _count: { _all: true },
        orderBy: { _count: { productId: 'desc' } },
        take: wanted,
      });
      return co.map((row) => row.productId);
    });
    await fill('same-platform', async () => {
      if (!product.toolPlatform) return [];
      const rows = await this.prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null, id: { not: product.id }, toolPlatform: product.toolPlatform }, select: { id: true }, take: wanted });
      return rows.map((r) => r.id);
    });
    await fill('similar', () => this.embeddings.similarIds(product.id, wanted));
    await fill('same-category', async () => {
      const rows = await this.prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null, id: { not: product.id }, categoryId: product.categoryId }, select: { id: true }, orderBy: { id: 'desc' }, take: wanted });
      return rows.map((r) => r.id);
    });
    await fill('best-seller', async () => {
      const sold = await this.prisma.orderItem.groupBy({ by: ['productId'], _sum: { quantity: true }, orderBy: { _sum: { quantity: 'desc' } }, take: wanted + 1 });
      return sold.map((row) => row.productId);
    });

    const items = await this.products.byIds([...picked.keys()]);
    return items.map((item) => ({ ...item, recommendationSource: picked.get(item.id) }));
  }
}

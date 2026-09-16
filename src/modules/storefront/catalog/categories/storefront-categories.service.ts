import { Injectable, NotFoundException } from '@nestjs/common';
import { Category } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';

type CategoryNode = Category & { children: CategoryNode[]; productCount: number };

@Injectable()
export class StorefrontCategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async tree(): Promise<CategoryNode[]> {
    const categories = await this.prisma.category.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }],
    });

    // Product counts per category: products assigned directly plus products
    // carrying it as a secondary category - mirrors the storefront product
    // list's category filter (see storefront-products.service.ts#buildWhere)
    // so the count shown here matches what clicking through actually finds.
    const activeProduct = { status: 'ACTIVE' as const, deletedAt: null };
    const [directCounts, secondaryCounts] = await Promise.all([
      this.prisma.product.groupBy({ by: ['categoryId'], where: activeProduct, _count: { _all: true } }),
      this.prisma.categoryProduct.groupBy({ by: ['categoryId'], where: { product: activeProduct }, _count: { _all: true } }),
    ]);
    const directById = new Map(directCounts.map((c) => [c.categoryId, c._count._all]));
    const secondaryById = new Map(secondaryCounts.map((c) => [c.categoryId, c._count._all]));
    const ownCount = (id: number) => (directById.get(id) ?? 0) + (secondaryById.get(id) ?? 0);

    const byId = new Map<number, CategoryNode>(categories.map((c) => [c.id, { ...c, children: [], productCount: ownCount(c.id) }]));
    const roots: CategoryNode[] = [];
    for (const category of byId.values()) {
      if (category.parentId && byId.has(category.parentId)) {
        byId.get(category.parentId)!.children.push(category);
      } else {
        roots.push(category);
      }
    }
    // a top-level category's count includes its children's products, since
    // the real tree is two levels deep and products mostly live on leaves
    for (const root of roots) {
      root.productCount += root.children.reduce((sum, child) => sum + child.productCount, 0);
    }
    return roots;
  }

  async bySlug(slug: string) {
    const category = await this.prisma.category.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      include: { faqs: { orderBy: { sortOrder: 'asc' } }, parent: { select: { id: true, title: true, slug: true } } },
    });
    if (!category) throw new NotFoundException('Category not found');
    return category;
  }
}

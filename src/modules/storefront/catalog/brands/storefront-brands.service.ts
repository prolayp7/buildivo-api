import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../../prisma/prisma.service';

@Injectable()
export class StorefrontBrandsService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    const brands = await this.prisma.brand.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { title: 'asc' },
    });

    // one bounded query across all active variants rather than one
    // aggregate per brand (fine at this catalogue size; revisit with a
    // groupBy-based approach if the catalogue grows much larger)
    const variants = await this.prisma.productVariant.findMany({
      where: { deletedAt: null, status: 'ACTIVE', product: { status: 'ACTIVE', deletedAt: null, brandId: { not: null } } },
      select: { price: true, productId: true, product: { select: { brandId: true } } },
    });
    const productIdsByBrand = new Map<number, Set<number>>();
    const minPriceByBrand = new Map<number, number>();
    for (const v of variants) {
      const brandId = v.product.brandId!;
      const price = Number(v.price);
      if (!productIdsByBrand.has(brandId)) productIdsByBrand.set(brandId, new Set());
      productIdsByBrand.get(brandId)!.add(v.productId);
      if (!minPriceByBrand.has(brandId) || price < minPriceByBrand.get(brandId)!) minPriceByBrand.set(brandId, price);
    }

    return brands.map((b) => ({
      ...b,
      productCount: productIdsByBrand.get(b.id)?.size ?? 0,
      priceFrom: minPriceByBrand.get(b.id) ?? null,
    }));
  }

  async bySlug(slug: string) {
    const brand = await this.prisma.brand.findFirst({ where: { slug, status: 'ACTIVE' } });
    if (!brand) throw new NotFoundException('Brand not found');
    return brand;
  }
}

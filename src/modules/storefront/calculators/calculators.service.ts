import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { MaterialsCalculatorQueryDto } from './dto/materials-calculator-query.dto';

// One generic formula covers paint (m2 per litre), tiles/flooring (m2 per box
// or pack) and anything else priced by coverage rate - area / coverage-rate,
// rounded up to whole units, with a wastage allowance. Coverage data lives on
// Product.coverageValue/coverageUnit; products without it aren't calculator-eligible.
@Injectable()
export class StorefrontCalculatorsService {
  constructor(private readonly prisma: PrismaService) {}

  async products() {
    const rows = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null, coverageValue: { not: null } },
      select: {
        id: true, slug: true, title: true, coverageValue: true, coverageUnit: true,
        category: { select: { title: true } },
        variants: { where: { deletedAt: null, status: 'ACTIVE' }, select: { id: true, price: true, salePrice: true }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }], take: 1 },
      },
      orderBy: [{ coverageUnit: 'asc' }, { title: 'asc' }],
      take: 200,
    });
    return rows.map((row) => ({
      id: row.id, slug: row.slug, title: row.title, category: row.category.title,
      coverageValue: Number(row.coverageValue), coverageUnit: row.coverageUnit,
      variantId: row.variants[0]?.id ?? null,
      unitPrice: row.variants[0] ? Number(row.variants[0].salePrice ?? row.variants[0].price) : null,
    }));
  }

  async materials(query: MaterialsCalculatorQueryDto) {
    const product = await this.prisma.product.findFirst({
      where: { slug: query.productSlug, status: 'ACTIVE', deletedAt: null },
      select: {
        id: true,
        title: true,
        coverageValue: true,
        coverageUnit: true,
        variants: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: { id: true, price: true, salePrice: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    if (!product.coverageValue) throw new BadRequestException('This product does not have calculator coverage data configured');

    const wastagePercent = query.wastagePercent ?? 10;
    const effectiveArea = query.area * (1 + wastagePercent / 100);
    const unitsNeeded = Math.ceil(effectiveArea / Number(product.coverageValue));
    const primary = product.variants[0];
    const unitPrice = primary ? Number(primary.salePrice ?? primary.price) : null;

    return {
      productId: product.id,
      productTitle: product.title,
      coverageValue: product.coverageValue,
      coverageUnit: product.coverageUnit,
      area: query.area,
      wastagePercent,
      unitsNeeded,
      variantId: primary?.id ?? null,
      estimatedCost: unitPrice !== null ? Math.round(unitPrice * unitsNeeded * 100) / 100 : null,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { StorefrontProductsService } from '../catalog/products/storefront-products.service';

const FEATURED_SECTION_PRODUCT_LIMIT = 12;

// Shared by HeroSlide/Banner: both models have identical status/startsAt/endsAt
// fields, so this literal structurally satisfies either WhereInput type.
function activeAndInWindow() {
  const now = new Date();
  return {
    status: 'ACTIVE' as const,
    AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }, { OR: [{ endsAt: null }, { endsAt: { gte: now } }] }],
  };
}

@Injectable()
export class StorefrontMerchandisingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly productsService: StorefrontProductsService,
  ) {}

  private async resolveSectionProducts(section: { sectionType: string; categoryId: number | null; manualProducts: { productId: number }[] }) {
    switch (section.sectionType) {
      case 'MANUAL':
        return this.productsService.byIds(section.manualProducts.map((p) => p.productId));
      case 'FEATURED':
        return this.productsService.featured(FEATURED_SECTION_PRODUCT_LIMIT);
      case 'BEST_SELLER':
        return this.productsService.bestSellers(FEATURED_SECTION_PRODUCT_LIMIT);
      case 'TOP_RATED':
        return this.productsService.topRated(FEATURED_SECTION_PRODUCT_LIMIT);
      case 'NEWLY_ADDED':
      default:
        return this.productsService.newest(FEATURED_SECTION_PRODUCT_LIMIT);
    }
  }

  async home() {
    const [homepageSections, heroSlides, heroBadges, banners, featuredSections] = await Promise.all([
      this.prisma.homepageSection.findMany({ where: { isVisible: true }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.heroSlide.findMany({
        where: activeAndInWindow(),
        orderBy: { sortOrder: 'asc' },
      }),
      this.prisma.heroTrustBadge.findMany({ where: { status: 'ACTIVE' }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.banner.findMany({
        where: activeAndInWindow(),
        include: { product: { select: { id: true, slug: true } }, category: { select: { id: true, slug: true } }, brand: { select: { id: true, slug: true } } },
        orderBy: [{ position: 'asc' }, { displayOrder: 'asc' }],
      }),
      this.prisma.featuredSection.findMany({
        where: { status: 'ACTIVE' },
        include: { manualProducts: { select: { productId: true }, orderBy: { sortOrder: 'asc' } } },
        orderBy: { sortOrder: 'asc' },
      }),
    ]);

    const sections = await Promise.all(
      featuredSections.map(async (section) => ({
        id: section.id,
        title: section.title,
        slug: section.slug,
        sectionType: section.sectionType,
        products: await this.resolveSectionProducts(section),
      })),
    );

    return {
      homepageSections: homepageSections.map((section) => ({ id: section.id, type: section.type, config: section.config })),
      hero: { slides: heroSlides, badges: heroBadges },
      banners,
      featuredSections: sections,
    };
  }
}

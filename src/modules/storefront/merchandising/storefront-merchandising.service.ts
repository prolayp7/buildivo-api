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

  // A linked product's title/price/reference/spec are read live here rather
  // than duplicated onto the slide row, so they can never go stale.
  private resolveHeroSlide(slide: {
    id: number; eyebrow: string | null; heading: string; highlight: string | null; ending: string | null; description: string | null;
    overlayBadge: string | null; specification: string | null; image: string | null; imageAlt: string | null; imageFit: string | null;
    imagePosition: string | null; ctaLabel: string | null; linkType: string; customUrl: string | null;
    product: { slug: string; title: string; sku: string | null; specsSummary: unknown; variants: { price: unknown; salePrice: unknown }[] } | null;
    category: { slug: string } | null;
  }) {
    const variant = slide.product?.variants[0];
    const price = variant ? Number(variant.salePrice ?? variant.price) : null;
    const specsSummary = slide.product?.specsSummary as Record<string, string> | null;
    const derivedSpecification = specsSummary ? Object.values(specsSummary).slice(0, 2).join(' · ') : null;
    const href = slide.linkType === 'PRODUCT' && slide.product ? `/p/${slide.product.slug}`
      : slide.linkType === 'CATEGORY' && slide.category ? `/c/${slide.category.slug}`
      : slide.customUrl ?? null;
    return {
      id: slide.id,
      eyebrow: slide.eyebrow,
      heading: slide.heading,
      highlight: slide.highlight,
      ending: slide.ending,
      description: slide.description,
      overlayBadge: slide.overlayBadge,
      image: slide.image,
      imageAlt: slide.imageAlt,
      imageFit: slide.imageFit,
      imagePosition: slide.imagePosition,
      ctaLabel: slide.ctaLabel,
      href,
      title: slide.product?.title ?? null,
      reference: slide.product?.sku ?? null,
      specification: slide.specification ?? derivedSpecification,
      price,
    };
  }

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
        include: {
          product: { select: { slug: true, title: true, sku: true, specsSummary: true, variants: { where: { deletedAt: null }, orderBy: [{ isDefault: 'desc' }, { id: 'asc' }], take: 1, select: { price: true, salePrice: true } } } },
          category: { select: { slug: true } },
        },
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
      hero: {
        slides: heroSlides.map((slide) => this.resolveHeroSlide(slide)),
        badges: heroBadges.filter((badge) => badge.placement === 'TRUST_STRIP'),
        floatingBadge: heroBadges.find((badge) => badge.placement === 'HERO_FLOATING') ?? null,
      },
      banners,
      featuredSections: sections,
    };
  }
}

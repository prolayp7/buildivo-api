import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, ProductCompatibility } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { ListStorefrontProductsQueryDto } from './dto/list-storefront-products-query.dto';
import { CompatibleProductsQueryDto } from './dto/compatible-products-query.dto';

// Fixed hardware facts (which socket generation takes which memory type),
// not merchant-editable content - kept as a constant rather than a DB table.
const DDR5_SOCKETS = ['AM5', 'LGA1851'];
const DDR4_SOCKETS = ['AM4'];
function memoryTypeForSocket(socket: string): string | null {
  if (DDR5_SOCKETS.includes(socket)) return 'DDR5';
  if (DDR4_SOCKETS.includes(socket)) return 'DDR4';
  return null;
}

// Words that carry no search meaning on their own ("laptop with graphics card"
// should search for laptop/graphics/card, not treat "with" as a required term).
const SEARCH_STOPWORDS = new Set(['a', 'an', 'the', 'with', 'for', 'and', 'or', 'of', 'in', 'on', 'to', 'is', 'are']);
const SEARCH_SPEC_PATHS = ['model', 'warranty', 'condition', 'productType', 'catalogueType', 'configuration', 'countryOfSale'];

// Common alternate names for the same product, so a search for one term also
// tries the others (e.g. product copy says "dedicated graphics", a shopper
// types "graphics card" — same thing, different words). Lowercase; phrases
// may be multiple words. Each entry is genuinely interchangeable, not just
// related, to avoid pulling in a different product type as a false match.
const SEARCH_SYNONYM_GROUPS: string[][] = [
  ['graphics card', 'gpu', 'dedicated graphics', 'video card'],
  ['laptop', 'notebook'],
  ['motherboard', 'mobo', 'mainboard'],
  ['memory', 'ram'],
  ['power supply', 'psu'],
  ['monitor', 'display', 'screen'],
  ['cooler', 'cooling', 'aio'],
  ['case', 'chassis', 'tower'],
  ['headset', 'headphones'],
  ['processor', 'cpu'],
];

function isCompatible(a: ProductCompatibility, b: ProductCompatibility): boolean {
  if (a.socket && b.socket && a.socket !== b.socket) return false;
  const socket = a.socket || b.socket;
  if (socket) {
    for (const side of [a, b]) {
      if (side.compatibleSockets.length && !side.compatibleSockets.includes(socket)) return false;
    }
    const wantedMemType = memoryTypeForSocket(socket);
    if (wantedMemType) {
      for (const side of [a, b]) {
        if (side.memoryType && side.memoryType !== wantedMemType) return false;
      }
    }
  }
  if (a.wattageRequired && b.wattageCapacity && b.wattageCapacity < a.wattageRequired) return false;
  if (b.wattageRequired && a.wattageCapacity && a.wattageCapacity < b.wattageRequired) return false;
  return true;
}

const listInclude = {
  category: { select: { id: true, title: true, slug: true, parent: { select: { id: true, title: true, slug: true } } } },
  brand: { select: { id: true, title: true, slug: true } },
  taxRate: { select: { ratePercent: true } },
  variants: {
    where: { deletedAt: null, status: 'ACTIVE' as const },
    select: { id: true, price: true, salePrice: true, stockQty: true, isDefault: true },
    orderBy: [{ isDefault: 'desc' as const }, { id: 'asc' as const }],
  },
};

type ListProduct = Prisma.ProductGetPayload<{ include: typeof listInclude }>;

function pricingOf(variants: ListProduct['variants']) {
  const primary = variants.find((v) => v.isDefault) ?? variants[0] ?? null;
  return {
    price: primary?.price ?? null,
    salePrice: primary?.salePrice ?? null,
    inStock: variants.some((v) => v.stockQty > 0),
    stockQty: variants.reduce((sum, v) => sum + v.stockQty, 0),
    // the variant a storefront "add to cart" click should use when the
    // caller hasn't picked one explicitly (list/card contexts have no
    // variant picker) - cart items are always keyed by variant, not product
    defaultVariantId: primary?.id ?? null,
  };
}

@Injectable()
export class StorefrontProductsService {
  constructor(private readonly prisma: PrismaService) {}

  // Free-text search: each word must match somewhere (title, SEO title, descriptions,
  // SKU/MPN, brand, category/parent category name, or a spec facet like
  // model/warranty/condition) — matching per word
  // rather than the whole phrase as one substring, so word order and filler words like
  // "with" don't cause otherwise-relevant products to be missed.
  private searchConditions(q: string): Prisma.ProductWhereInput[] {
    // Split glued letter/digit runs ("demo18" -> "demo 18") so a query typed
    // without a space still matches text that has one, without requiring an
    // exact-substring hit on the untouched query.
    const spaced = q.replace(/([a-zA-Z])(\d)/g, '$1 $2').replace(/(\d)([a-zA-Z])/g, '$1 $2');
    const words = spaced.split(/\s+/).filter(Boolean);
    const lower = words.map((word) => word.toLowerCase());
    const consumed = new Array(words.length).fill(false);
    // Each entry is the set of alternate terms to try for one "slot" in the query —
    // either a matched synonym group (e.g. "graphics card" → also try gpu, dedicated
    // graphics, video card) or a single leftover word.
    const termGroups: string[][] = [];

    for (const group of SEARCH_SYNONYM_GROUPS) {
      let matched = false;
      for (const phrase of group) {
        if (matched) break;
        const phraseWords = phrase.split(' ');
        for (let i = 0; i + phraseWords.length <= words.length; i++) {
          if (consumed[i]) continue;
          if (lower.slice(i, i + phraseWords.length).join(' ') !== phrase) continue;
          for (let j = i; j < i + phraseWords.length; j++) consumed[j] = true;
          termGroups.push(group);
          matched = true;
          break;
        }
      }
    }
    for (let i = 0; i < words.length; i++) {
      if (consumed[i] || SEARCH_STOPWORDS.has(lower[i])) continue;
      termGroups.push([words[i]]);
    }
    if (!termGroups.length) termGroups.push([q.trim()]);

    return termGroups.map((terms) => ({
      OR: terms.flatMap((term) => [
        { title: { contains: term, mode: 'insensitive' as const } },
        { metaTitle: { contains: term, mode: 'insensitive' as const } },
        { shortDescription: { contains: term, mode: 'insensitive' as const } },
        { description: { contains: term, mode: 'insensitive' as const } },
        { sku: { contains: term, mode: 'insensitive' as const } },
        { mpn: { contains: term, mode: 'insensitive' as const } },
        { brand: { title: { contains: term, mode: 'insensitive' as const } } },
        { category: { title: { contains: term, mode: 'insensitive' as const } } },
        { category: { parent: { title: { contains: term, mode: 'insensitive' as const } } } },
        // JSON path filters don't support Prisma's `mode: 'insensitive'` (Postgres/MySQL
        // limitation) — these matches are case-sensitive, unlike the string fields above.
        ...SEARCH_SPEC_PATHS.map((path) => ({ specsSummary: { path: [path], string_contains: term } })),
      ]),
    }));
  }

  // Typo/glued-word tolerant fallback for free-text search, using pg_trgm
  // similarity (see migration 20260917170000_search_trigram) - catches
  // queries the strict word-by-word matching in searchConditions() misses,
  // e.g. "uvexsafety" (no space at all) or "uvexsafet" (missing letters).
  private async fuzzyProductIds(q: string): Promise<number[]> {
    const term = q.trim();
    if (term.length < 3) return [];
    const rows = await this.prisma.$queryRaw<{ id: number }[]>`
      SELECT p.id
      FROM products p
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.status = 'ACTIVE' AND p.deleted_at IS NULL
        AND (
          similarity(p.title, ${term}) > 0.3
          OR similarity(coalesce(p.sku, ''), ${term}) > 0.4
          OR similarity(coalesce(b.title, ''), ${term}) > 0.3
          OR similarity(coalesce(c.title, ''), ${term}) > 0.3
        )
      ORDER BY GREATEST(
        similarity(p.title, ${term}),
        similarity(coalesce(b.title, ''), ${term}),
        similarity(coalesce(c.title, ''), ${term})
      ) DESC
      LIMIT 50
    `;
    return rows.map((row) => row.id);
  }

  private async buildWhere(query: ListStorefrontProductsQueryDto): Promise<Prisma.ProductWhereInput> {
    const conditions: Prisma.ProductWhereInput[] = [{ status: 'ACTIVE', deletedAt: null }];

    if (query.category) {
      // matches products assigned directly to this category, to any of its
      // immediate children (the real category tree is two levels deep: a
      // top-level category filter must also surface its children's products),
      // or carrying it as a secondary category
      conditions.push({
        OR: [
          { category: { slug: query.category } },
          { category: { parent: { slug: query.category } } },
          { secondaryCategories: { some: { category: { slug: query.category } } } },
        ],
      });
    }
    if (query.brand) conditions.push({ brand: { slug: { in: query.brand.split(',').filter(Boolean) } } });
    if (query.inStock) conditions.push({ variants: { some: { status: 'ACTIVE', deletedAt: null, stockQty: { gt: 0 } } } });
    if (query.specs) {
      let specs: unknown;
      try { specs = JSON.parse(query.specs); } catch { throw new BadRequestException('Invalid specification filters'); }
      if (!specs || typeof specs !== 'object' || Array.isArray(specs) || Object.values(specs).some((v) => !Array.isArray(v) || !v.length || v.some((x) => typeof x !== 'string'))) {
        throw new BadRequestException('Specification filters must contain lists of values');
      }
      for (const [key, values] of Object.entries(specs as Record<string, string[]>)) {
        conditions.push({ OR: values.map((value) => ({ specsSummary: { path: [key], equals: value } })) });
      }
    }
    if (query.q) {
      const fuzzyIds = await this.fuzzyProductIds(query.q);
      conditions.push({
        OR: [
          { AND: this.searchConditions(query.q) },
          ...(fuzzyIds.length ? [{ id: { in: fuzzyIds } }] : []),
        ],
      });
    }
    return { AND: conditions };
  }

  private async fetchProductsByIds(ids: number[]): Promise<ListProduct[]> {
    if (!ids.length) return [];
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
      include: listInclude,
    });
    const byId = new Map(products.map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter((p): p is ListProduct => p !== undefined);
  }

  private async attachMedia(products: ListProduct[]) {
    const productIds = products.map((p) => p.id);
    const media = productIds.length
      ? await this.prisma.media.findMany({
          where: { ownerType: 'PRODUCT', ownerId: { in: productIds } },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })
      : [];
    const firstByProduct = new Map<number, (typeof media)[number]>();
    for (const item of media) {
      if (!firstByProduct.has(item.ownerId)) firstByProduct.set(item.ownerId, item);
    }
    const reviews = productIds.length ? await this.prisma.review.groupBy({
      by: ['productId'], where: { productId: { in: productIds }, status: 'APPROVED' },
      _avg: { rating: true }, _count: { rating: true },
    }) : [];
    const reviewsByProduct = new Map(reviews.map((review) => [review.productId, review]));
    return products.map((product) => {
      const { variants, ...rest } = product;
      return {
        ...rest,
        image: firstByProduct.get(product.id)?.url ?? null,
        reviewSummary: { average: reviewsByProduct.get(product.id)?._avg.rating ?? 0, count: reviewsByProduct.get(product.id)?._count.rating ?? 0 },
        ...pricingOf(variants),
      };
    });
  }

  // Facet counts (subcategories/brands/price range present in this filtered
  // set) for a listing page's filter sidebar. Simplification: each facet is
  // computed against the full current `where`, including its own dimension -
  // not the "exclude this facet's own filter" faceting some storefronts do.
  private async facets(where: Prisma.ProductWhereInput) {
    const [categoryCounts, brandCounts, priceRange, specRows] = await Promise.all([
      this.prisma.product.groupBy({ by: ['categoryId'], where, _count: { _all: true } }),
      this.prisma.product.groupBy({ by: ['brandId'], where, _count: { _all: true } }),
      this.prisma.productVariant.aggregate({
        where: { deletedAt: null, status: 'ACTIVE', product: where },
        _min: { price: true },
        _max: { price: true },
      }),
      this.prisma.product.findMany({ where, select: { specsSummary: true } }),
    ]);
    const categoryIds = categoryCounts.map((c) => c.categoryId);
    const brandIds = brandCounts.map((b) => b.brandId).filter((id): id is number => id !== null);
    const [categories, brands] = await Promise.all([
      categoryIds.length
        ? this.prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, title: true, slug: true } })
        : [],
      brandIds.length
        ? this.prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, title: true, slug: true } })
        : [],
    ]);
    const categoryById = new Map(categories.map((c) => [c.id, c]));
    const brandById = new Map(brands.map((b) => [b.id, b]));

    const specificationCounts = new Map<string, Map<string, number>>();
    for (const row of specRows) {
      if (!row.specsSummary || typeof row.specsSummary !== 'object' || Array.isArray(row.specsSummary)) continue;
      for (const [key, value] of Object.entries(row.specsSummary)) {
        if (typeof value !== 'string' || !value.trim()) continue;
        const values = specificationCounts.get(key) ?? new Map<string, number>();
        values.set(value, (values.get(value) ?? 0) + 1);
        specificationCounts.set(key, values);
      }
    }
    return {
      specifications: [...specificationCounts].map(([title, values]) => ({ title, values: [...values].map(([value, count]) => ({ value, count })) })),
      categories: categoryCounts
        .map((c) => ({ ...categoryById.get(c.categoryId), count: c._count._all }))
        .filter((c): c is { id: number; title: string; slug: string; count: number } => c.id !== undefined),
      brands: brandCounts
        .filter((b) => b.brandId !== null)
        .map((b) => ({ ...brandById.get(b.brandId!), count: b._count._all }))
        .filter((b): b is { id: number; title: string; slug: string; count: number } => b.id !== undefined),
      priceMin: priceRange._min.price !== null ? Number(priceRange._min.price) : null,
      priceMax: priceRange._max.price !== null ? Number(priceRange._max.price) : null,
    };
  }

  private static readonly emptyFacets = { specifications: [], categories: [], brands: [], priceMin: null, priceMax: null };

  async list(query: ListStorefrontProductsQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const sort = query.sort ?? 'newest';

    if (query.ids?.length) {
      const items = await this.attachMedia(await this.fetchProductsByIds(query.ids));
      return { items, meta: { ...buildPaginationMeta(1, items.length || 1, items.length), facets: StorefrontProductsService.emptyFacets } };
    }

    let where = await this.buildWhere(query);
    let priceOrderedIds: number[] | null = null;
    if (query.priceMin !== undefined || query.priceMax !== undefined || query.onSale || sort === 'price_asc' || sort === 'price_desc' || sort === 'discount_desc') {
      // Use the same primary-variant fallback as card pricing. Fetch full
      // product records only for the requested page, not for this projection.
      const candidates = await this.prisma.product.findMany({ where, select: { id: true, variants: listInclude.variants } });
      const price = (row: (typeof candidates)[number]) => Number(row.variants[0]?.salePrice ?? row.variants[0]?.price ?? 0);
      const discount = (row: (typeof candidates)[number]) => {
        const full = Number(row.variants[0]?.price ?? 0);
        const sale = row.variants[0]?.salePrice !== null && row.variants[0]?.salePrice !== undefined ? Number(row.variants[0].salePrice) : null;
        return sale !== null && full > 0 ? (full - sale) / full : 0;
      };
      const matching = candidates.filter((row) => row.variants.length > 0
        && (!query.onSale || row.variants[0].salePrice !== null)
        && (sort !== 'discount_desc' || row.variants[0].salePrice !== null)
        && (query.priceMin === undefined || price(row) >= query.priceMin)
        && (query.priceMax === undefined || price(row) <= query.priceMax));
      if (sort === 'price_asc' || sort === 'price_desc') {
        matching.sort((a, b) => (sort === 'price_asc' ? price(a) - price(b) : price(b) - price(a)) || a.id - b.id);
        priceOrderedIds = matching.map((p) => p.id);
      } else if (sort === 'discount_desc') {
        matching.sort((a, b) => discount(b) - discount(a) || a.id - b.id);
        priceOrderedIds = matching.map((p) => p.id);
      }
      where = { AND: [where, { id: { in: matching.map((p) => p.id) } }] };
    }
    const facets = await this.facets(where);
    if (priceOrderedIds) {
      const ids = priceOrderedIds.slice((page - 1) * perPage, page * perPage);
      return { items: await this.attachMedia(await this.fetchProductsByIds(ids)), meta: { ...buildPaginationMeta(page, perPage, priceOrderedIds.length), facets } };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      sort === 'name_asc' ? { title: 'asc' } : sort === 'name_desc' ? { title: 'desc' } : { createdAt: 'desc' };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({ where, orderBy, ...paginationSkipTake(page, perPage), include: listInclude }),
      this.prisma.product.count({ where }),
    ]);
    return { items: await this.attachMedia(products), meta: { ...buildPaginationMeta(page, perPage, total), facets } };
  }

  // Used by the merchandising module to resolve featured-section products.
  async byIds(ids: number[]) {
    return this.attachMedia(await this.fetchProductsByIds(ids));
  }

  // "Goes well with" / "complete the build": products whose structured
  // ProductCompatibility facts (socket, memory type, PSU wattage) actually
  // match this one. The caller decides which category to search in (the
  // frontend keeps its own editorial category-pairing map for that); this
  // only answers "would these two actually work together".
  async compatibleProducts(slug: string, query: CompatibleProductsQueryDto) {
    const source = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      select: { id: true, compatibility: true },
    });
    if (!source) throw new NotFoundException('Product not found');
    if (!source.compatibility) return [];

    const candidates = await this.prisma.product.findMany({
      where: {
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: source.id },
        compatibility: { isNot: null },
        ...(query.category ? { category: { slug: query.category } } : {}),
      },
      select: { id: true, compatibility: true },
      take: 300,
    });

    const limit = query.limit ?? 4;
    const matchingIds = candidates
      .filter((c) => isCompatible(source.compatibility!, c.compatibility!))
      .slice(0, limit)
      .map((c) => c.id);

    return this.byIds(matchingIds);
  }

  // "Customers who bought this also bought" - real order co-occurrence, not
  // a fake ML score, same honesty bar as bestSellers()/recommended above.
  async frequentlyBoughtTogether(slug: string, limit: number) {
    const product = await this.prisma.product.findFirst({ where: { slug, status: 'ACTIVE', deletedAt: null }, select: { id: true } });
    if (!product) throw new NotFoundException('Product not found');
    const orders = await this.prisma.orderItem.findMany({ where: { productId: product.id }, select: { orderId: true }, distinct: ['orderId'] });
    const orderIds = orders.map((o) => o.orderId);
    if (!orderIds.length) return [];
    const co = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      where: { orderId: { in: orderIds }, productId: { not: product.id } },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: limit,
    });
    return this.byIds(co.map((row) => row.productId));
  }

  // Side-by-side comparison: shared spec keys (from specsSummary) across the
  // given products, plus price/stock for each - no separate "compare list"
  // is persisted, the frontend just re-sends the id set each time.
  async compare(ids: number[]) {
    if (ids.length < 2) throw new BadRequestException('Provide at least 2 product ids to compare');
    if (ids.length > 6) throw new BadRequestException('Compare up to 6 products at a time');
    const products = await this.prisma.product.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', deletedAt: null },
      include: {
        category: { select: { title: true, slug: true, parent: { select: { title: true, slug: true } } } },
        brand: { select: { title: true } },
        taxRate: { select: { ratePercent: true } },
        variants: {
          where: { deletedAt: null, status: 'ACTIVE' },
          select: { id: true, price: true, salePrice: true, stockQty: true, isDefault: true },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (products.length !== ids.length) throw new NotFoundException('One or more products were not found');
    const byId = new Map(products.map((p) => [p.id, p]));
    const ordered = ids.map((id) => byId.get(id)!);

    const media = ids.length
      ? await this.prisma.media.findMany({ where: { ownerType: 'PRODUCT', ownerId: { in: ids } }, orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
      : [];
    const imageByProduct = new Map<number, string>();
    for (const item of media) if (!imageByProduct.has(item.ownerId)) imageByProduct.set(item.ownerId, item.url);

    const reviews = ids.length ? await this.prisma.review.groupBy({
      by: ['productId'], where: { productId: { in: ids }, status: 'APPROVED' },
      _avg: { rating: true }, _count: { rating: true },
    }) : [];
    const reviewsByProduct = new Map(reviews.map((r) => [r.productId, r]));

    const specKeys = new Set<string>();
    for (const p of ordered) {
      const specs = p.specsSummary;
      if (specs && typeof specs === 'object' && !Array.isArray(specs)) Object.keys(specs).forEach((k) => specKeys.add(k));
    }

    return {
      products: ordered.map((p) => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        image: imageByProduct.get(p.id) ?? null,
        category: { title: p.category.title, slug: p.category.slug, parent: p.category.parent ? { title: p.category.parent.title, slug: p.category.parent.slug } : null },
        brand: p.brand?.title ?? null,
        vatRatePercent: p.taxRate?.ratePercent ?? null,
        reviewSummary: { average: reviewsByProduct.get(p.id)?._avg.rating ?? 0, count: reviewsByProduct.get(p.id)?._count.rating ?? 0 },
        ...pricingOf(p.variants),
      })),
      specifications: [...specKeys].sort().map((key) => ({
        key,
        values: ordered.map((p) => {
          const specs = p.specsSummary as Record<string, unknown> | null;
          return specs && typeof specs === 'object' ? specs[key] ?? null : null;
        }),
      })),
    };
  }

  async newest(limit: number) {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: listInclude,
    });
    return this.attachMedia(products);
  }

  async featured(limit: number) {
    const products = await this.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null, isFeatured: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: listInclude,
    });
    return this.attachMedia(products);
  }

  async bestSellers(limit: number) {
    const sold = await this.prisma.orderItem.groupBy({
      by: ['productId'],
      _sum: { quantity: true },
      orderBy: { _sum: { quantity: 'desc' } },
      take: limit,
    });
    return this.byIds(sold.map((row) => row.productId));
  }

  async topRated(limit: number) {
    const rated = await this.prisma.review.groupBy({
      by: ['productId'],
      where: { status: 'APPROVED' },
      _avg: { rating: true },
      orderBy: { _avg: { rating: 'desc' } },
      take: limit,
    });
    return this.byIds(rated.map((row) => row.productId));
  }

  async bySlug(slug: string) {
    const product = await this.prisma.product.findFirst({
      where: { slug, status: 'ACTIVE', deletedAt: null },
      include: {
        category: { select: { id: true, title: true, slug: true, parent: { select: { id: true, title: true, slug: true } } } },
        brand: { select: { id: true, title: true, slug: true } },
        taxRate: { select: { ratePercent: true } },
        compatibility: true,
        faqs: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], select: { id: true, question: true, answer: true } },
        variants: {
          where: { deletedAt: null, status: 'ACTIVE' },
          include: {
            attributes: { include: { attribute: true, attributeValue: true } },
            priceTiers: { orderBy: { minQty: 'asc' } },
          },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
        },
      },
    });
    if (!product) throw new NotFoundException('Product not found');

    const variantIds = product.variants.map((v) => v.id);
    const [productMedia, variantMedia, reviewAgg, ratingCounts] = await Promise.all([
      this.prisma.media.findMany({
        where: { ownerType: 'PRODUCT', ownerId: product.id },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
      variantIds.length
        ? this.prisma.media.findMany({
            where: { ownerType: 'PRODUCT_VARIANT', ownerId: { in: variantIds } },
            orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
          })
        : Promise.resolve([]),
      this.prisma.review.aggregate({
        where: { productId: product.id, status: 'APPROVED' },
        _avg: { rating: true },
        _count: { rating: true },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { productId: product.id, status: 'APPROVED' },
        _count: { rating: true },
      }),
    ]);

    const documents = productMedia.filter((m) => /\.(pdf|docx?|csv)(?:[?#]|$)/i.test(m.url));
    const videos = productMedia.filter((m) => /\.(mp4|webm)(?:[?#]|$)/i.test(m.url));
    const variantMediaByVariant = new Map<number, typeof variantMedia>();
    for (const item of variantMedia) {
      const list = variantMediaByVariant.get(item.ownerId) ?? [];
      list.push(item);
      variantMediaByVariant.set(item.ownerId, list);
    }

    return {
      ...product,
      documents: documents.map((m) => ({ id: m.id, url: m.url, title: m.altText || (m.metadata as { originalName?: string } | null)?.originalName || "Product document" })),
      videos: videos.map((m) => ({ url: m.url, altText: m.altText })),
      images: productMedia.filter((m) => !documents.includes(m) && !videos.includes(m)).map((m) => ({ url: m.url, altText: m.altText })),
      variants: product.variants.map((variant) => ({
        ...variant,
        images: (variantMediaByVariant.get(variant.id) ?? []).map((m) => ({ url: m.url, altText: m.altText })),
      })),
      ...pricingOf(product.variants),
      reviewSummary: {
        average: reviewAgg._avg.rating ?? 0,
        count: reviewAgg._count.rating,
        distribution: Object.fromEntries(ratingCounts.map((row) => [row.rating, row._count.rating])),
      },
    };
  }
}

import { Prisma, PrismaClient } from '@prisma/client';
import { constants, copyFileSync, existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';

import { buildCatalog, Catalog, slugify } from './seed-catalog-data';

export const catalog = buildCatalog();

export function validateProductBlueprints(data: Catalog = catalog) {
  const unique = (values: string[], label: string) => {
    if (values.some((value) => !value) || new Set(values).size !== values.length) throw new Error(`Duplicate or empty ${label}.`);
  };
  unique(data.categories.map((c) => c.slug), 'category slugs');
  unique(data.brands.map((b) => b.slug), 'brand slugs');
  unique(data.products.map((p) => p.slug), 'product slugs');
  unique(data.products.map((p) => p.sku), 'product SKUs');
  const categories = new Set<string>();
  const brands = new Set(data.brands.map((b) => b.slug));
  for (const category of data.categories) {
    if (category.parentSlug && !categories.has(category.parentSlug)) throw new Error(`Missing or unordered parent for ${category.slug}.`);
    categories.add(category.slug);
  }
  const attributes = new Map<string, string>();
  for (const product of data.products) {
    if (!categories.has(product.categorySlug) || !brands.has(product.brandSlug)) throw new Error(`Invalid catalog reference for ${product.slug}.`);
    if (!product.variants.length) throw new Error(`Missing variants for ${product.slug}.`);
    unique(product.variants.map((v) => v.slug), `${product.slug} variant slugs`);
    unique(product.specs.map((s) => slugify(s.label)), `${product.slug} specification keys`);
    if (product.variants.length > 1) {
      const label = product.variantAttribute ?? 'Kit contents';
      attributes.set(slugify(label), label);
    }
    for (const spec of product.specs) {
      const key = slugify(spec.label);
      if (!spec.value || (attributes.has(key) && attributes.get(key) !== spec.label)) throw new Error(`Conflicting attribute ${key}.`);
      attributes.set(key, spec.label);
    }
    for (const image of product.images) {
      if (!/^[\w.-]+\.jpg$/.test(image) || !existsSync(join(__dirname, 'fixtures/images', image))) throw new Error(`Missing local image: ${image}`);
    }
    for (const variant of product.variants) {
      if (!Number.isFinite(variant.price) || variant.price <= 0 || !Number.isInteger(variant.stockQty) || variant.stockQty < 0) throw new Error(`Invalid price or stock: ${product.slug}/${variant.slug}`);
      if (variant.salePrice !== undefined && (!Number.isFinite(variant.salePrice) || variant.salePrice <= 0 || variant.salePrice >= variant.price)) throw new Error(`Invalid sale price: ${product.slug}`);
      let previousQty = 1;
      let previousPrice = variant.salePrice ?? variant.price;
      for (const tier of variant.priceTiers ?? []) {
        if (!Number.isInteger(tier.minQty) || tier.minQty <= previousQty || !Number.isFinite(tier.unitPrice) || tier.unitPrice <= 0 || tier.unitPrice > previousPrice) throw new Error(`Invalid price tier: ${product.slug}`);
        previousQty = tier.minQty;
        previousPrice = tier.unitPrice;
      }
    }
  }
  return {
    categories: categories.size, brands: brands.size, attributes: attributes.size,
    products: data.products.length, variants: data.products.reduce((sum, p) => sum + p.variants.length, 0),
    standardProducts: data.products.filter((p) => p.variants.length === 1).length,
    variableProducts: data.products.filter((p) => p.variants.length > 1).length,
  };
}

export async function seedProducts(prisma: PrismaClient) {
  const counts = validateProductBlueprints();
  // A computer-drive category must never silently become tool storage.
  const storage = await prisma.category.findFirst({ where: { slug: 'storage', deletedAt: null } });
  if (storage?.parentId) throw new Error('Legacy computer Storage category detected. Migrate/archive the old catalog before seeding Buildivo; no catalog data was changed.');

  const uploadDirectory = resolve(process.env.MEDIA_UPLOAD_DIR ?? resolve(process.cwd(), 'uploads'));
  mkdirSync(uploadDirectory, { recursive: true });
  for (const filename of new Set(catalog.products.flatMap((p) => p.images))) {
    try {
      copyFileSync(join(__dirname, 'fixtures/images', filename), join(uploadDirectory, `buildivo-seed-${filename}`), constants.COPYFILE_EXCL);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
  }

  return prisma.$transaction(async (tx) => {
    const condition = await tx.productCondition.upsert({ where: { slug: 'new' }, update: {}, create: { title: 'New', slug: 'new' } });
    const tax = await tx.taxRate.upsert({ where: { title: 'Standard' }, update: {}, create: { title: 'Standard', ratePercent: 20, isDefault: true } });
    if (Number(tax.ratePercent) !== 20) throw new Error('Buildivo demo prices assume 20% standard VAT. Existing tax rate was preserved.');
    const categoryIds = new Map<string, number>();
    for (const [sortOrder, category] of catalog.categories.entries()) {
      const parentId = category.parentSlug ? categoryIds.get(category.parentSlug)! : null;
      const existing = await tx.category.findFirst({ where: { slug: category.slug, deletedAt: null } });
      if (existing && existing.parentId !== parentId) throw new Error(`Category hierarchy collision: ${category.slug}`);
      const row = existing ?? await tx.category.create({ data: {
        title: category.title, slug: category.slug, parentId, sortOrder,
        description: `${category.title} for workshop, trade and DIY projects.`,
        metaTitle: `${category.title} | Buildivo`, status: 'ACTIVE',
      } });
      categoryIds.set(category.slug, row.id);
    }
    const brandIds = new Map<string, number>();
    for (const brand of catalog.brands) {
      const row = await tx.brand.upsert({ where: { slug: brand.slug }, update: {}, create: { ...brand, status: 'ACTIVE' } });
      brandIds.set(brand.slug, row.id);
    }
    const attributeIds = new Map<string, number>();
    const attributes = new Map<string, { title: string; values: Set<string> }>();
    for (const product of catalog.products) {
      const specs = [...product.specs, ...(product.variants.length > 1 ? product.variants.map((v) => ({ label: product.variantAttribute ?? 'Kit contents', value: v.title })) : [])];
      for (const spec of specs) {
        const slug = slugify(spec.label);
        if (!attributes.has(slug)) attributes.set(slug, { title: spec.label, values: new Set() });
        attributes.get(slug)!.values.add(spec.value);
      }
    }
    const valueIds = new Map<string, number>();
    for (const [slug, attribute] of attributes) {
      const row = await tx.productAttribute.findFirst({ where: { slug, deletedAt: null } }) ?? await tx.productAttribute.create({ data: { title: attribute.title, slug, inputType: 'SELECT', isFilterable: true } });
      attributeIds.set(slug, row.id);
      for (const [sortOrder, value] of [...attribute.values].entries()) {
        const item = await tx.productAttributeValue.upsert({ where: { attributeId_value: { attributeId: row.id, value } }, update: {}, create: { attributeId: row.id, value, sortOrder } });
        valueIds.set(`${slug}:${value}`, item.id);
      }
    }
    const shippingMethods = await tx.shippingMethod.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
    const productIds = new Map<string, number>();
    const createdIds = new Set<number>();
    let created = 0;
    for (const item of catalog.products) {
      const existing = await tx.product.findFirst({ where: { slug: item.slug } });
      // Preserve staff edits, stock movements and deliberately archived products.
      if (existing) {
        if (!existing.deletedAt) productIds.set(item.slug, existing.id);
        continue;
      }
      const variable = item.variants.length > 1;
      const product = await tx.product.create({ data: {
        title: item.title, slug: item.slug, sku: item.sku,
        categoryId: categoryIds.get(item.categorySlug)!, brandId: brandIds.get(item.brandSlug)!,
        productConditionId: condition.id, taxRateId: tax.id, productType: variable ? 'VARIABLE' : 'STANDARD',
        description: item.description, shortDescription: item.description,
        specsSummary: Object.fromEntries(item.specs.map((s) => [s.label, s.value])) as Prisma.InputJsonValue,
        status: 'ACTIVE', isIndexable: false,
        metaTitle: `${item.title} | Buildivo`.slice(0, 70), metaDescription: item.description.slice(0, 160),
        seoTags: [item.categorySlug, item.brandSlug], outOfStockBehavior: 'DENY',
        inStockLabel: 'In stock', outOfStockLabel: 'Out of stock',
      } });
      productIds.set(item.slug, product.id);
      createdIds.add(product.id);
      created += 1;
      for (const [index, option] of item.variants.entries()) {
        const specs = index === 0 || item.variantAttribute ? [...item.specs] : [];
        if (variable) specs.push({ label: item.variantAttribute ?? 'Kit contents', value: option.title });
        const variant = await tx.productVariant.create({ data: {
          productId: product.id, slug: `${item.slug}-${option.slug}`, title: option.title,
          price: option.price, salePrice: option.salePrice, stockQty: option.stockQty,
          isDefault: index === 0, status: 'ACTIVE',
          attributes: { create: specs.map((spec) => ({ attributeId: attributeIds.get(slugify(spec.label))!, attributeValueId: valueIds.get(`${slugify(spec.label)}:${spec.value}`)! })) },
        } });
        if (option.priceTiers?.length) await tx.productPriceTier.createMany({ data: option.priceTiers.map((tier) => ({ ...tier, productVariantId: variant.id })) });
      }
      for (const [sortOrder, image] of item.images.entries()) {
        await tx.media.create({ data: { ownerType: 'PRODUCT', ownerId: product.id, collection: 'products', url: `/uploads/buildivo-seed-${image}`, altText: item.title, sortOrder, metadata: { source: 'Buildivo storefront demo', mimeType: 'image/jpeg' } } });
      }
      if (item.whatsInTheBox.length) await tx.productFaq.create({ data: { productId: product.id, question: variable ? 'What is included in the default kit?' : 'What is included?', answer: item.whatsInTheBox.join('\n'), sortOrder: 0 } });
      if (shippingMethods.length) await tx.productShippingMethod.createMany({ data: shippingMethods.map((s) => ({ productId: product.id, shippingMethodId: s.id })) });
    }
    // Same-category alternatives, without asserting unverified accessory compatibility.
    for (const item of catalog.products) {
      const id = productIds.get(item.slug);
      if (!id || !createdIds.has(id)) continue;
      const related = catalog.products.filter((p) => p.slug !== item.slug && p.categorySlug === item.categorySlug && productIds.has(p.slug)).slice(0, 4);
      if (related.length) await tx.productRelated.createMany({ data: related.map((p) => ({ productId: id, relatedProductId: productIds.get(p.slug)! })) });
    }
    return { ...counts, created, skipped: counts.products - created };
  }, { timeout: 180000 });
}

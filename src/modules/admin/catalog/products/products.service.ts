import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../prisma/prisma.service';
import { buildPaginationMeta, paginationSkipTake } from '../../../../common/pagination';
import { LowStockAlertService } from '../../../email/low-stock-alert.service';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductFaqDto } from './dto/create-product-faq.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { UpsertPriceTierDto } from './dto/upsert-price-tier.dto';

const productDetailInclude = {
  category: true,
  brand: true,
  productCondition: true,
  taxRate: true,
  compatibility: true,
  secondaryCategories: { include: { category: true } },
  relatedProducts: { include: { relatedProduct: true } },
  shippingMethods: { include: { shippingMethod: true } },
  faqs: { orderBy: { sortOrder: 'asc' as const } },
  variants: {
    where: { deletedAt: null },
    include: {
      attributes: { include: { attribute: true, attributeValue: true } },
    },
    orderBy: [{ isDefault: 'desc' as const }, { id: 'asc' as const }],
  },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly lowStockAlert: LowStockAlertService,
  ) {}

  async list(query: ListProductsQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where: Prisma.ProductWhereInput = {
      ...(query.includeDeleted ? {} : { deletedAt: null }),
      ...(query.idMin !== undefined || query.idMax !== undefined ? { id: { ...(query.idMin !== undefined ? { gte: query.idMin } : {}), ...(query.idMax !== undefined ? { lte: query.idMax } : {}) } } : {}),
      ...(query.categoryId
        ? {
            OR: [
              { categoryId: query.categoryId },
              { secondaryCategories: { some: { categoryId: query.categoryId } } },
            ],
          }
        : {}),
      ...(query.brandId ? { brandId: query.brandId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            AND: [
              {
                OR: [
                  { title: { contains: query.q, mode: 'insensitive' } },
                  { slug: { contains: query.q, mode: 'insensitive' } },
                  { sku: { contains: query.q, mode: 'insensitive' } },
                  { mpn: { contains: query.q, mode: 'insensitive' } },
                ],
              },
            ],
          }
        : {}),
      ...(query.priceMin !== undefined || query.priceMax !== undefined || query.stockMin !== undefined || query.stockMax !== undefined ? { variants: { some: { deletedAt: null, ...(query.priceMin !== undefined || query.priceMax !== undefined ? { price: { ...(query.priceMin !== undefined ? { gte: query.priceMin } : {}), ...(query.priceMax !== undefined ? { lte: query.priceMax } : {}) } } : {}), ...(query.stockMin !== undefined || query.stockMax !== undefined ? { stockQty: { ...(query.stockMin !== undefined ? { gte: query.stockMin } : {}), ...(query.stockMax !== undefined ? { lte: query.stockMax } : {}) } } : {}) } } } : {}),
    };
    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        ...paginationSkipTake(page, perPage),
        include: {
          category: true,
          brand: true,
          taxRate: true,
          variants: {
            where: { deletedAt: null },
            select: {
              id: true,
              price: true,
              salePrice: true,
              stockQty: true,
              lowStockThreshold: true,
              isDefault: true,
              status: true,
            },
            orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
          },
          _count: { select: { variants: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    const productIds = products.map((product) => product.id);
    const media = productIds.length
      ? await this.prisma.media.findMany({
          where: {
            ownerType: 'PRODUCT',
            ownerId: { in: productIds },
            metadata: { path: ['mimeType'], string_starts_with: 'image/' },
          },
          orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
        })
      : [];
    const firstMediaByProduct = new Map<number, (typeof media)[number]>();
    for (const item of media) {
      if (!firstMediaByProduct.has(item.ownerId)) firstMediaByProduct.set(item.ownerId, item);
    }
    const items = products.map((product) => ({
      ...product,
      featuredMedia: firstMediaByProduct.get(product.id) ?? null,
      inventory: {
        stockQty: product.variants.reduce((sum, variant) => sum + variant.stockQty, 0),
        lowStock: product.variants.some((variant) => variant.stockQty <= variant.lowStockThreshold),
        outOfStock: product.variants.length > 0 && product.variants.every((variant) => variant.stockQty === 0),
      },
    }));
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }

  async detail(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: productDetailInclude,
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  private async assertSlugAvailable(slug: string, excludeId?: number) {
    const existing = await this.prisma.product.findFirst({
      where: { slug, deletedAt: null, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (existing) throw new ConflictException(`Product slug "${slug}" is already in use`);
  }

  private productData(dto: CreateProductDto | UpdateProductDto) {
    const { secondaryCategoryIds: _secondaryCategoryIds, relatedProductIds: _relatedProductIds, shippingMethodIds: _shippingMethodIds, initialVariant: _initialVariant, compatibility: _compatibility, specsSummary, ...fields } = dto;
    return {
      ...fields,
      ...(specsSummary !== undefined
        ? { specsSummary: specsSummary as Prisma.InputJsonValue }
        : {}),
    };
  }

  async create(dto: CreateProductDto) {
    await this.assertSlugAvailable(dto.slug);
    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: this.productData(dto) as Prisma.ProductUncheckedCreateInput,
      });
      if (dto.initialVariant) {
        await tx.productVariant.create({
          data: {
            productId: product.id,
            title: 'Default',
            slug: 'default',
            price: dto.initialVariant.price,
            salePrice: dto.initialVariant.salePrice,
            stockQty: dto.initialVariant.stockQty,
            lowStockThreshold: dto.initialVariant.lowStockThreshold ?? 5,
            weightKg: dto.initialVariant.weightKg,
            widthCm: dto.initialVariant.widthCm,
            heightCm: dto.initialVariant.heightCm,
            lengthCm: dto.initialVariant.lengthCm,
            isDefault: true,
          },
        });
      }
      if (dto.secondaryCategoryIds?.length) {
        await tx.categoryProduct.createMany({
          data: dto.secondaryCategoryIds.map((categoryId) => ({ productId: product.id, categoryId })),
        });
      }
      if (dto.relatedProductIds?.length) {
        await tx.productRelated.createMany({
          data: dto.relatedProductIds.map((relatedProductId) => ({ productId: product.id, relatedProductId })),
        });
      }
      if (dto.shippingMethodIds?.length) {
        await tx.productShippingMethod.createMany({ data: dto.shippingMethodIds.map((shippingMethodId) => ({ productId: product.id, shippingMethodId })) });
      }
      if (dto.compatibility) {
        await tx.productCompatibility.create({ data: { productId: product.id, ...dto.compatibility } });
      }
      return tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productDetailInclude });
    }).catch((error: unknown) => this.mapRelationError(error));
  }

  async update(id: number, dto: UpdateProductDto) {
    await this.detail(id);
    if (dto.slug) await this.assertSlugAvailable(dto.slug, id);
    return this.prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: this.productData(dto) as Prisma.ProductUncheckedUpdateInput,
      });
      if (dto.initialVariant !== undefined) {
        const variant = await tx.productVariant.findFirst({
          where: { productId: id, deletedAt: null },
          orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
          select: { id: true },
        });
        const variantData = {
          price: dto.initialVariant.price,
          salePrice: dto.initialVariant.salePrice ?? null,
          stockQty: dto.initialVariant.stockQty,
          lowStockThreshold: dto.initialVariant.lowStockThreshold ?? 5,
          weightKg: dto.initialVariant.weightKg,
          widthCm: dto.initialVariant.widthCm,
          heightCm: dto.initialVariant.heightCm,
          lengthCm: dto.initialVariant.lengthCm,
        };
        if (variant) {
          await tx.productVariant.update({ where: { id: variant.id }, data: variantData });
        } else {
          await tx.productVariant.create({
            data: { productId: id, title: 'Default', slug: 'default', isDefault: true, ...variantData },
          });
        }
      }
      if (dto.compatibility !== undefined) {
        await tx.productCompatibility.upsert({
          where: { productId: id },
          create: { productId: id, ...dto.compatibility },
          update: dto.compatibility,
        });
      }
      if (dto.secondaryCategoryIds !== undefined) {
        await tx.categoryProduct.deleteMany({ where: { productId: id } });
        if (dto.secondaryCategoryIds.length) {
          await tx.categoryProduct.createMany({
            data: dto.secondaryCategoryIds.map((categoryId) => ({ productId: id, categoryId })),
          });
        }
      }
      if (dto.relatedProductIds !== undefined) {
        if (dto.relatedProductIds.includes(id)) {
          throw new BadRequestException('A product cannot be related to itself');
        }
        await tx.productRelated.deleteMany({ where: { productId: id } });
        if (dto.relatedProductIds.length) {
          await tx.productRelated.createMany({
            data: dto.relatedProductIds.map((relatedProductId) => ({ productId: id, relatedProductId })),
          });
        }
      }
      if (dto.shippingMethodIds !== undefined) {
        await tx.productShippingMethod.deleteMany({ where: { productId: id } });
        if (dto.shippingMethodIds.length) {
          await tx.productShippingMethod.createMany({ data: dto.shippingMethodIds.map((shippingMethodId) => ({ productId: id, shippingMethodId })) });
        }
      }
      return tx.product.findUniqueOrThrow({ where: { id }, include: productDetailInclude });
    }).catch((error: unknown) => this.mapRelationError(error));
  }

  async duplicate(id: number) {
    const source = await this.detail(id);
    const baseSlug = `${source.slug}-copy`;
    let slug = baseSlug;
    let suffix = 2;
    while (await this.prisma.product.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    })) {
      slug = `${baseSlug}-${suffix}`;
      suffix += 1;
    }

    return this.prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          categoryId: source.categoryId,
          brandId: source.brandId,
          supplierId: source.supplierId,
          productConditionId: source.productConditionId,
          taxRateId: source.taxRateId,
          title: `${source.title} (copy)`,
          slug,
          sku: null,
          mpn: null,
          gtin: null,
          upc: null,
          shortDescription: source.shortDescription,
          description: source.description,
          ...(source.specsSummary !== null
            ? { specsSummary: source.specsSummary as Prisma.InputJsonValue }
            : {}),
          warrantyMonths: source.warrantyMonths,
          allowCustomization: source.allowCustomization,
          customizationInstructions: source.customizationInstructions,
          costPrice: source.costPrice,
          minimumOrderQuantity: source.minimumOrderQuantity,
          stockLocation: source.stockLocation,
          receiveLowStockAlert: source.receiveLowStockAlert,
          outOfStockBehavior: source.outOfStockBehavior,
          inStockLabel: source.inStockLabel,
          outOfStockLabel: source.outOfStockLabel,
          availabilityDate: source.availabilityDate,
          deliveryTimeMode: source.deliveryTimeMode,
          inStockDeliveryTime: source.inStockDeliveryTime,
          outOfStockDeliveryTime: source.outOfStockDeliveryTime,
          additionalShippingCost: source.additionalShippingCost,
          isReturnable: source.isReturnable,
          returnableDays: source.returnableDays,
          status: 'DRAFT',
          isFeatured: false,
          isTopProduct: false,
          isIndexable: source.isIndexable,
          metaTitle: source.metaTitle,
          metaDescription: source.metaDescription,
          seoTags: source.seoTags,
          offlineRedirectBehavior: source.offlineRedirectBehavior,
          redirectTargetCategoryId: source.redirectTargetCategoryId,
        },
      });

      if (source.secondaryCategories.length) {
        await tx.categoryProduct.createMany({
          data: source.secondaryCategories.map(({ categoryId }) => ({
            productId: product.id,
            categoryId,
          })),
        });
      }

      if (source.faqs.length) {
        await tx.productFaq.createMany({
          data: source.faqs.map(({ question, answer, sortOrder }) => ({
            productId: product.id,
            question,
            answer,
            sortOrder,
          })),
        });
      }

      if (source.shippingMethods.length) {
        await tx.productShippingMethod.createMany({
          data: source.shippingMethods.map(({ shippingMethodId }) => ({ productId: product.id, shippingMethodId })),
        });
      }

      for (const variant of source.variants) {
        await tx.productVariant.create({
          data: {
            productId: product.id,
            title: variant.title,
            slug: variant.slug,
            barcode: null,
            price: variant.price,
            salePrice: variant.salePrice,
            stockQty: variant.stockQty,
            lowStockThreshold: variant.lowStockThreshold,
            weightKg: variant.weightKg,
            lengthCm: variant.lengthCm,
            widthCm: variant.widthCm,
            heightCm: variant.heightCm,
            isDefault: variant.isDefault,
            status: variant.status,
            attributes: {
              create: variant.attributes.map(({ attributeId, attributeValueId }) => ({
                attributeId,
                attributeValueId,
              })),
            },
          },
        });
      }

      return tx.product.findUniqueOrThrow({
        where: { id: product.id },
        include: productDetailInclude,
      });
    }).catch((error: unknown) => this.mapRelationError(error));
  }

  async remove(id: number) {
    await this.detail(id);
    await this.prisma.$transaction([
      this.prisma.product.update({ where: { id }, data: { deletedAt: new Date() } }),
      this.prisma.productVariant.updateMany({
        where: { productId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      }),
    ]);
  }

  async addFaq(productId: number, dto: CreateProductFaqDto) {
    await this.detail(productId);
    return this.prisma.productFaq.create({ data: { ...dto, productId } });
  }

  async removeFaq(productId: number, faqId: number) {
    await this.detail(productId);
    const result = await this.prisma.productFaq.deleteMany({ where: { id: faqId, productId } });
    if (!result.count) throw new NotFoundException('Product FAQ not found');
  }

  async listVariants(productId: number) {
    await this.detail(productId);
    return this.prisma.productVariant.findMany({
      where: { productId, deletedAt: null },
      include: { attributes: { include: { attribute: true, attributeValue: true } } },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
  }

  private async variantAttributeRows(
    tx: Prisma.TransactionClient,
    attributeValueIds: number[],
  ) {
    const values = await tx.productAttributeValue.findMany({
      where: { id: { in: attributeValueIds }, attribute: { deletedAt: null } },
      select: { id: true, attributeId: true },
    });
    if (values.length !== attributeValueIds.length) {
      throw new BadRequestException('One or more attribute values are invalid');
    }
    if (new Set(values.map((value) => value.attributeId)).size !== values.length) {
      throw new BadRequestException('A variant cannot contain multiple values for one attribute');
    }
    return values.map((value) => ({
      attributeId: value.attributeId,
      attributeValueId: value.id,
    }));
  }

  async createVariant(productId: number, dto: CreateProductVariantDto) {
    await this.detail(productId);
    const { attributeValueIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      const duplicate = await tx.productVariant.findFirst({
        where: { productId, slug: dto.slug, deletedAt: null },
      });
      if (duplicate) throw new ConflictException(`Variant slug "${dto.slug}" is already in use`);
      const attributes = await this.variantAttributeRows(tx, attributeValueIds);
      if (dto.isDefault) {
        await tx.productVariant.updateMany({ where: { productId }, data: { isDefault: false } });
      }
      return tx.productVariant.create({
        data: {
          ...data,
          productId,
          attributes: { create: attributes },
        },
        include: { attributes: { include: { attribute: true, attributeValue: true } } },
      });
    });
  }

  private async variant(productId: number, variantId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId, deletedAt: null, product: { deletedAt: null } },
    });
    if (!variant) throw new NotFoundException('Product variant not found');
    return variant;
  }

  async updateVariant(productId: number, variantId: number, dto: UpdateProductVariantDto) {
    await this.variant(productId, variantId);
    const { attributeValueIds, ...data } = dto;
    return this.prisma.$transaction(async (tx) => {
      if (dto.slug) {
        const duplicate = await tx.productVariant.findFirst({
          where: { productId, slug: dto.slug, deletedAt: null, id: { not: variantId } },
        });
        if (duplicate) throw new ConflictException(`Variant slug "${dto.slug}" is already in use`);
      }
      const attributes = attributeValueIds
        ? await this.variantAttributeRows(tx, attributeValueIds)
        : undefined;
      if (dto.isDefault) {
        await tx.productVariant.updateMany({
          where: { productId, id: { not: variantId } },
          data: { isDefault: false },
        });
      }
      return tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...data,
          ...(attributes
            ? { attributes: { deleteMany: {}, create: attributes } }
            : {}),
        },
        include: { attributes: { include: { attribute: true, attributeValue: true } } },
      });
    });
  }

  async removeVariant(productId: number, variantId: number) {
    await this.variant(productId, variantId);
    await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { deletedAt: new Date(), isDefault: false },
    });
  }

  async stockList(query: ListStockQueryDto) {
    const page = query.page!;
    const perPage = query.perPage!;
    const where: Prisma.ProductVariantWhereInput = {
      deletedAt: null,
      product: { deletedAt: null },
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { barcode: { contains: query.q, mode: 'insensitive' } },
              { product: { is: { title: { contains: query.q, mode: 'insensitive' } } } },
              { product: { is: { sku: { contains: query.q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };
    const variants = await this.prisma.productVariant.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { product: { select: { id: true, title: true, sku: true, supplier: { select: { title: true } } } } },
    });
    let rows = variants.map((variant) => ({
      variantId: variant.id,
      productId: variant.productId,
      productTitle: variant.product.title,
      variantTitle: variant.title,
      sku: variant.product.sku,
      barcode: variant.barcode,
      supplier: variant.product.supplier?.title ?? null,
      stockQty: variant.stockQty,
      lowStockThreshold: variant.lowStockThreshold,
      isLowStock: variant.stockQty <= variant.lowStockThreshold,
    }));
    if (query.lowStockOnly) rows = rows.filter((row) => row.isLowStock);
    const total = rows.length;
    const start = (page - 1) * perPage;
    return { items: rows.slice(start, start + perPage), meta: buildPaginationMeta(page, perPage, total) };
  }

  async updateStock(productId: number, variantId: number, dto: UpdateStockDto) {
    const variant = await this.variant(productId, variantId);
    if ((dto.stockQty === undefined) === (dto.delta === undefined)) {
      throw new BadRequestException('Provide exactly one of stockQty or delta');
    }
    const stockQty = dto.stockQty ?? variant.stockQty + dto.delta!;
    if (stockQty < 0) throw new BadRequestException('Stock quantity cannot be negative');
    const updated = await this.prisma.productVariant.update({ where: { id: variantId }, data: { stockQty } });
    void this.lowStockAlert.checkAndNotify(variantId);
    return updated;
  }

  async listPriceTiers(productId: number, variantId: number) {
    await this.variant(productId, variantId);
    return this.prisma.productPriceTier.findMany({ where: { productVariantId: variantId }, orderBy: { minQty: 'asc' } });
  }

  async upsertPriceTier(productId: number, variantId: number, dto: UpsertPriceTierDto) {
    await this.variant(productId, variantId);
    return this.prisma.productPriceTier.upsert({
      where: { productVariantId_minQty: { productVariantId: variantId, minQty: dto.minQty } },
      create: { productVariantId: variantId, minQty: dto.minQty, unitPrice: dto.unitPrice },
      update: { unitPrice: dto.unitPrice },
    });
  }

  async removePriceTier(productId: number, variantId: number, tierId: number) {
    await this.variant(productId, variantId);
    const tier = await this.prisma.productPriceTier.findFirst({ where: { id: tierId, productVariantId: variantId } });
    if (!tier) throw new NotFoundException('Price tier not found');
    await this.prisma.productPriceTier.delete({ where: { id: tierId } });
  }

  private mapRelationError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new BadRequestException('One or more related catalog records are invalid');
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException('A related category was supplied more than once');
    }
    throw error;
  }
}

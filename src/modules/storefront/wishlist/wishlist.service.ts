import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';

const DEFAULT_SLUG = 'default';

const itemInclude = {
  items: {
    include: {
      productVariant: {
        include: { product: { select: { id: true, title: true, slug: true } } },
      },
    },
    orderBy: { createdAt: 'desc' as const },
  },
};

@Injectable()
export class WishlistService {
  constructor(private readonly prisma: PrismaService) {}

  private async getOrCreate(userId: number) {
    const existing = await this.prisma.wishlist.findUnique({
      where: { userId_slug: { userId, slug: DEFAULT_SLUG } },
      include: itemInclude,
    });
    if (existing) return existing;
    return this.prisma.wishlist.create({
      data: { userId, slug: DEFAULT_SLUG },
      include: itemInclude,
    });
  }

  async get(userId: number) {
    return this.getOrCreate(userId);
  }

  async addItem(userId: number, productVariantId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: productVariantId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.upsert({
      where: { wishlistId_productVariantId: { wishlistId: wishlist.id, productVariantId } },
      create: { wishlistId: wishlist.id, productVariantId },
      update: {},
    });
    return this.getOrCreate(userId);
  }

  // The storefront saves whole products, not variants: use the product's default (or first active) variant.
  async addProduct(userId: number, productId: number) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { productId, deletedAt: null, status: 'ACTIVE', product: { status: 'ACTIVE', deletedAt: null } },
      orderBy: [{ isDefault: 'desc' }, { id: 'asc' }],
    });
    if (!variant) throw new NotFoundException('Product not found');
    return this.addItem(userId, variant.id);
  }

  // Idempotent: removing a product that is not saved is fine.
  async removeProduct(userId: number, productId: number) {
    const wishlist = await this.getOrCreate(userId);
    await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productVariant: { productId } } });
    return this.getOrCreate(userId);
  }

  async removeItem(userId: number, productVariantId: number) {
    const wishlist = await this.getOrCreate(userId);
    const result = await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productVariantId } });
    if (!result.count) throw new NotFoundException('Item is not in the wishlist');
    return this.getOrCreate(userId);
  }
}

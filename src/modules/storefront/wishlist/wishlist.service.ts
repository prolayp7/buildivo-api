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

  async removeItem(userId: number, productVariantId: number) {
    const wishlist = await this.getOrCreate(userId);
    const result = await this.prisma.wishlistItem.deleteMany({ where: { wishlistId: wishlist.id, productVariantId } });
    if (!result.count) throw new NotFoundException('Item is not in the wishlist');
    return this.getOrCreate(userId);
  }
}

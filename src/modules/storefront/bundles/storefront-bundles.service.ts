import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { CartService } from '../cart/cart.service';

const bundleInclude = {
  items: {
    include: {
      productVariant: {
        include: { product: { select: { id: true, title: true, slug: true } } },
      },
    },
  },
};

function inWindow(now: Date, startsAt: Date | null, endsAt: Date | null): boolean {
  return (!startsAt || startsAt <= now) && (!endsAt || endsAt >= now);
}

@Injectable()
export class StorefrontBundlesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cartService: CartService,
  ) {}

  private present(bundle: Prisma.ProductBundleGetPayload<{ include: typeof bundleInclude }>) {
    const regularTotal = bundle.items.reduce(
      (sum, i) => sum + Number(i.productVariant.salePrice ?? i.productVariant.price) * i.quantity,
      0,
    );
    return {
      id: bundle.id,
      uuid: bundle.uuid,
      title: bundle.title,
      slug: bundle.slug,
      description: bundle.description,
      bundlePrice: bundle.bundlePrice,
      regularTotal: Math.round(regularTotal * 100) / 100,
      savings: Math.round((regularTotal - Number(bundle.bundlePrice)) * 100) / 100,
      items: bundle.items.map((i) => ({
        productVariantId: i.productVariantId,
        quantity: i.quantity,
        title: i.productVariant.title,
        price: i.productVariant.price,
        salePrice: i.productVariant.salePrice,
        stockQty: i.productVariant.stockQty,
        product: i.productVariant.product,
      })),
    };
  }

  async list() {
    const now = new Date();
    const bundles = await this.prisma.productBundle.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: bundleInclude,
    });
    return bundles.filter((b) => inWindow(now, b.startsAt, b.endsAt)).map((b) => this.present(b));
  }

  private async findActive(slug: string) {
    const now = new Date();
    const bundle = await this.prisma.productBundle.findFirst({ where: { slug, deletedAt: null, status: 'ACTIVE' }, include: bundleInclude });
    if (!bundle || !inWindow(now, bundle.startsAt, bundle.endsAt)) throw new NotFoundException('Bundle not found');
    return bundle;
  }

  async detail(slug: string) {
    return this.present(await this.findActive(slug));
  }

  async addToCart(slug: string, customerId: number | undefined, guestToken: string | undefined) {
    const bundle = await this.findActive(slug);
    return this.cartService.addBundleItems(customerId, guestToken, bundle);
  }
}

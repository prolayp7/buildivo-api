import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';

const cartInclude = {
  items: {
    include: {
      productVariant: {
        include: {
          product: {
            select: { id: true, title: true, slug: true, taxRateId: true, taxRate: { select: { ratePercent: true } } },
          },
          priceTiers: { orderBy: { minQty: 'asc' as const } },
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
};

export type CartWithItems = Prisma.CartGetPayload<{ include: typeof cartInclude }>;

export interface CartLine {
  productVariantId: number;
  productId: number;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  weightKg: number;
  onSale: boolean;
  taxRateId: number | null;
}

@Injectable()
export class CartService {
  constructor(private readonly prisma: PrismaService) {}

  private async findCart(customerId?: number, guestToken?: string): Promise<CartWithItems | null> {
    if (customerId) {
      return this.prisma.cart.findFirst({ where: { userId: customerId }, include: cartInclude });
    }
    if (guestToken) {
      return this.prisma.cart.findFirst({ where: { guestToken }, include: cartInclude });
    }
    return null;
  }

  private async getOrCreateCart(
    customerId?: number,
    guestToken?: string,
  ): Promise<{ cart: CartWithItems; mintedGuestToken?: string }> {
    const existing = await this.findCart(customerId, guestToken);
    if (existing) return { cart: existing };

    if (customerId) {
      const cart = await this.prisma.cart.create({ data: { userId: customerId }, include: cartInclude });
      return { cart };
    }

    const mintedGuestToken = guestToken ?? randomBytes(24).toString('hex');
    const cart = await this.prisma.cart.create({ data: { guestToken: mintedGuestToken }, include: cartInclude });
    return { cart, mintedGuestToken };
  }

  // Best applicable bulk/wholesale price for this quantity, or null if no
  // tier applies (or none would beat the regular/sale price anyway).
  private tierUnitPrice(variant: CartWithItems['items'][number]['productVariant'], quantity: number): number | null {
    const applicable = variant.priceTiers.filter((t) => quantity >= t.minQty).sort((a, b) => b.minQty - a.minQty)[0];
    return applicable ? Number(applicable.unitPrice) : null;
  }

  private lineOf(item: CartWithItems['items'][number]): CartLine {
    const variant = item.productVariant;
    const regularPrice = Number(variant.salePrice ?? variant.price);
    const tierPrice = this.tierUnitPrice(variant, item.quantity);
    // Bundle allocation (snapshotted at add-to-cart time) wins outright;
    // otherwise take whichever is cheaper for the customer, regular or tier.
    const unitPrice = item.unitPriceOverride !== null
      ? Number(item.unitPriceOverride)
      : tierPrice !== null && tierPrice < regularPrice ? tierPrice : regularPrice;
    return {
      productVariantId: variant.id,
      productId: variant.product.id,
      quantity: item.quantity,
      unitPrice,
      lineSubtotal: Math.round(unitPrice * item.quantity * 100) / 100,
      weightKg: Number(variant.weightKg ?? 0) * item.quantity,
      onSale: variant.salePrice !== null,
      taxRateId: variant.product.taxRateId,
    };
  }

  private present(cart: CartWithItems | null, mintedGuestToken?: string, fallbackGuestToken?: string) {
    if (!cart) {
      return { guestToken: mintedGuestToken ?? fallbackGuestToken ?? null, items: [], savedForLater: [], subtotal: 0, totalWeightKg: 0 };
    }
    const active = cart.items.filter((i) => !i.savedForLater);
    const saved = cart.items.filter((i) => i.savedForLater);
    const lines = active.map((item) => ({ ...this.lineOf(item), savedForLater: false, variant: this.variantSummary(item) }));
    const savedLines = saved.map((item) => ({ ...this.lineOf(item), savedForLater: true, variant: this.variantSummary(item) }));
    return {
      guestToken: mintedGuestToken ?? cart.guestToken,
      items: lines,
      savedForLater: savedLines,
      subtotal: Math.round(lines.reduce((sum, l) => sum + l.lineSubtotal, 0) * 100) / 100,
      totalWeightKg: Math.round(lines.reduce((sum, l) => sum + l.weightKg, 0) * 1000) / 1000,
    };
  }

  private variantSummary(item: CartWithItems['items'][number]) {
    const variant = item.productVariant;
    return {
      id: variant.id,
      title: variant.title,
      price: variant.price,
      salePrice: variant.salePrice,
      stockQty: variant.stockQty,
      product: variant.product,
    };
  }

  async getCart(customerId?: number, guestToken?: string) {
    const cart = await this.findCart(customerId, guestToken);
    return this.present(cart, undefined, guestToken);
  }

  // Exposed for the coupon-validate and shipping-quote endpoints, and checkout,
  // so they price against the same live cart data without duplicating the query.
  async linesFor(customerId?: number, guestToken?: string): Promise<{ cartId: number | null; lines: CartLine[] }> {
    const cart = await this.findCart(customerId, guestToken);
    if (!cart || !cart.items.length) return { cartId: cart?.id ?? null, lines: [] };
    return { cartId: cart.id, lines: cart.items.filter((i) => !i.savedForLater).map((i) => this.lineOf(i)) };
  }

  async addItem(customerId: number | undefined, guestToken: string | undefined, dto: AddCartItemDto) {
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: dto.productVariantId, deletedAt: null, status: 'ACTIVE' },
    });
    if (!variant) throw new NotFoundException('Product variant not found');

    const { cart, mintedGuestToken } = await this.getOrCreateCart(customerId, guestToken);
    const existing = cart.items.find((i) => i.productVariantId === dto.productVariantId);
    const newQuantity = (existing?.quantity ?? 0) + dto.quantity;
    if (newQuantity > variant.stockQty) {
      throw new BadRequestException(`Only ${variant.stockQty} in stock`);
    }

    await this.prisma.cartItem.upsert({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId: dto.productVariantId } },
      create: { cartId: cart.id, productVariantId: dto.productVariantId, quantity: dto.quantity },
      update: { quantity: newQuantity },
    });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

    const refreshed = await this.findCart(customerId, mintedGuestToken ?? guestToken);
    return this.present(refreshed, mintedGuestToken);
  }

  // Adds every item of a bundle to the cart in one go, each snapshotted with
  // its bundle-allocated unit price (the bundle's total price split
  // proportionally by each item's regular-price share). If a variant is
  // already in the cart, its line is folded into the bundle at the new
  // allocated price - mixing bundle-priced and regular-priced units of the
  // same SKU on one line isn't modelled; add if that split becomes a real need.
  async addBundleItems(
    customerId: number | undefined,
    guestToken: string | undefined,
    bundle: {
      id: number;
      bundlePrice: Prisma.Decimal;
      items: { productVariantId: number; quantity: number; productVariant: { price: Prisma.Decimal; salePrice: Prisma.Decimal | null; stockQty: number } }[];
    },
  ) {
    for (const item of bundle.items) {
      if (item.quantity > item.productVariant.stockQty) {
        throw new BadRequestException(`Only ${item.productVariant.stockQty} in stock for one of this bundle's items`);
      }
    }
    const totalRegular = bundle.items.reduce((sum, i) => sum + Number(i.productVariant.salePrice ?? i.productVariant.price) * i.quantity, 0);
    const { cart, mintedGuestToken } = await this.getOrCreateCart(customerId, guestToken);
    await this.prisma.$transaction(async (tx) => {
      for (const item of bundle.items) {
        const itemRegularTotal = Number(item.productVariant.salePrice ?? item.productVariant.price) * item.quantity;
        const allocatedTotal = totalRegular > 0 ? (itemRegularTotal / totalRegular) * Number(bundle.bundlePrice) : 0;
        const unitPriceOverride = Math.round((allocatedTotal / item.quantity) * 100) / 100;
        await tx.cartItem.upsert({
          where: { cartId_productVariantId: { cartId: cart.id, productVariantId: item.productVariantId } },
          create: { cartId: cart.id, productVariantId: item.productVariantId, quantity: item.quantity, bundleId: bundle.id, unitPriceOverride },
          update: { quantity: { increment: item.quantity }, bundleId: bundle.id, unitPriceOverride },
        });
      }
      await tx.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    });
    const refreshed = await this.findCart(customerId, mintedGuestToken ?? guestToken);
    return this.present(refreshed, mintedGuestToken);
  }

  async updateItem(customerId: number | undefined, guestToken: string | undefined, productVariantId: number, dto: UpdateCartItemDto) {
    const cart = await this.findCart(customerId, guestToken);
    const item = cart?.items.find((i) => i.productVariantId === productVariantId);
    if (!cart || !item) throw new NotFoundException('Cart item not found');

    if (dto.quantity !== undefined && dto.quantity > item.productVariant.stockQty) {
      throw new BadRequestException(`Only ${item.productVariant.stockQty} in stock`);
    }

    await this.prisma.cartItem.update({
      where: { cartId_productVariantId: { cartId: cart.id, productVariantId } },
      data: {
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.savedForLater !== undefined ? { savedForLater: dto.savedForLater } : {}),
      },
    });
    await this.prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });

    return this.getCart(customerId, guestToken);
  }

  async removeItem(customerId: number | undefined, guestToken: string | undefined, productVariantId: number) {
    const cart = await this.findCart(customerId, guestToken);
    if (!cart) throw new NotFoundException('Cart not found');
    const result = await this.prisma.cartItem.deleteMany({ where: { cartId: cart.id, productVariantId } });
    if (!result.count) throw new NotFoundException('Cart item not found');
    await this.prisma.cart.update({ where: { id: cart.id }, data: { updatedAt: new Date() } });
    return this.getCart(customerId, guestToken);
  }

  async mergeGuestCart(customerId: number, guestToken: string) {
    const guestCart = await this.findCart(undefined, guestToken);
    if (!guestCart || !guestCart.items.length) return this.getCart(customerId);

    const { cart: customerCart } = await this.getOrCreateCart(customerId);
    await this.prisma.$transaction(async (tx) => {
      for (const item of guestCart.items) {
        await tx.cartItem.upsert({
          where: { cartId_productVariantId: { cartId: customerCart.id, productVariantId: item.productVariantId } },
          create: {
            cartId: customerCart.id,
            productVariantId: item.productVariantId,
            quantity: item.quantity,
            savedForLater: item.savedForLater,
          },
          update: { quantity: { increment: item.quantity } },
        });
      }
      await tx.cart.update({ where: { id: customerCart.id }, data: { updatedAt: new Date() } });
      await tx.cart.delete({ where: { id: guestCart.id } });
    });

    return this.getCart(customerId);
  }

  // Full cart with variant/product detail, for order-line creation at checkout.
  async cartForCheckout(customerId?: number, guestToken?: string): Promise<CartWithItems | null> {
    return this.findCart(customerId, guestToken);
  }

  async clear(cartId: number): Promise<void> {
    await this.prisma.cartItem.deleteMany({ where: { cartId } });
  }
}

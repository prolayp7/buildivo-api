import { BadRequestException, Injectable } from '@nestjs/common';
import { Coupon } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';

export interface CouponLine {
  lineSubtotal: number;
  onSale: boolean;
}

export interface CouponValidationResult {
  coupon: Coupon;
  discountAmount: number;
  freeShipping: boolean;
}

@Injectable()
export class StorefrontCouponsService {
  constructor(private readonly prisma: PrismaService) {}

  // ponytail: targetType/targetIds (per-product/category coupon scoping) and
  // AutomaticDiscount aren't handled — only ALL-cart, code-based coupons.
  // Extend here if per-target discounting is needed later.
  async validate(code: string, lines: CouponLine[], userId?: number): Promise<CouponValidationResult> {
    const coupon = await this.prisma.coupon.findFirst({
      where: { code: { equals: code.trim(), mode: 'insensitive' }, status: 'ACTIVE', deletedAt: null },
    });
    if (!coupon) throw new BadRequestException('Coupon code is not valid');

    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw new BadRequestException('Coupon is not active yet');
    if (coupon.endsAt && coupon.endsAt < now) throw new BadRequestException('Coupon has expired');
    if (coupon.targetType !== 'ALL') {
      throw new BadRequestException('This coupon cannot be applied automatically at checkout yet');
    }
    if (coupon.maxTotalUsage !== null && coupon.usageCount >= coupon.maxTotalUsage) {
      throw new BadRequestException('Coupon has reached its usage limit');
    }

    const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
    if (coupon.minOrderTotal && subtotal < Number(coupon.minOrderTotal)) {
      throw new BadRequestException(`Coupon requires a minimum order total of £${coupon.minOrderTotal}`);
    }

    if (userId && coupon.maxUsagePerUser !== null) {
      const usedByCustomer = await this.prisma.order.count({
        where: { userId, couponLine: { couponId: coupon.id } },
      });
      if (usedByCustomer >= coupon.maxUsagePerUser) {
        throw new BadRequestException('You have already used this coupon the maximum number of times');
      }
    }

    if (coupon.discountType === 'FREE_SHIPPING') {
      return { coupon, discountAmount: 0, freeShipping: true };
    }

    const discountableBase = lines
      .filter((l) => !(coupon.excludeSaleItems && l.onSale))
      .reduce((sum, l) => sum + l.lineSubtotal, 0);

    let discountAmount =
      coupon.discountType === 'PERCENT'
        ? discountableBase * (Number(coupon.discountAmount) / 100)
        : Math.min(Number(coupon.discountAmount), discountableBase);

    if (coupon.maxDiscountValue !== null) {
      discountAmount = Math.min(discountAmount, Number(coupon.maxDiscountValue));
    }

    return { coupon, discountAmount: Math.round(discountAmount * 100) / 100, freeShipping: false };
  }

  async recordUsage(couponId: number): Promise<void> {
    await this.prisma.coupon.update({ where: { id: couponId }, data: { usageCount: { increment: 1 } } });
  }
}

import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CartService } from './cart.service';
import { AddCartItemDto } from './dto/add-cart-item.dto';
import { UpdateCartItemDto } from './dto/update-cart-item.dto';
import { MergeCartDto } from './dto/merge-cart.dto';
import { ValidateCouponDto } from './dto/validate-coupon.dto';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { GuestToken } from '../../../common/customer/guest-token.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { StorefrontCouponsService } from '../coupons/coupons.service';

@Controller('cart')
@UseGuards(OptionalCustomerAuthGuard)
export class CartController {
  constructor(
    private readonly cartService: CartService,
    private readonly couponsService: StorefrontCouponsService,
  ) {}

  @Get()
  getCart(@CurrentCustomer() customer: AuthenticatedCustomer | undefined, @GuestToken() guestToken?: string) {
    return this.cartService.getCart(customer?.id, guestToken);
  }

  @Post('items')
  @HttpCode(201)
  addItem(
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
    @Body() dto: AddCartItemDto,
  ) {
    return this.cartService.addItem(customer?.id, guestToken, dto);
  }

  @Patch('items/:variantId')
  updateItem(
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.cartService.updateItem(customer?.id, guestToken, variantId, dto);
  }

  @Delete('items/:variantId')
  removeItem(
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
    @Param('variantId', ParseIntPipe) variantId: number,
  ) {
    return this.cartService.removeItem(customer?.id, guestToken, variantId);
  }

  @Post('merge')
  @UseGuards(CustomerAuthGuard)
  merge(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: MergeCartDto) {
    return this.cartService.mergeGuestCart(customer.id, dto.guestToken);
  }

  @Post('coupon/validate')
  @HttpCode(200)
  async validateCoupon(
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
    @Body() dto: ValidateCouponDto,
  ) {
    const { lines } = await this.cartService.linesFor(customer?.id, guestToken);
    const result = await this.couponsService.validate(
      dto.code,
      lines.map((l) => ({ lineSubtotal: l.lineSubtotal, onSale: l.onSale })),
      customer?.id,
    );
    return {
      code: result.coupon.code,
      discountType: result.coupon.discountType,
      discountAmount: result.discountAmount,
      freeShipping: result.freeShipping,
    };
  }
}

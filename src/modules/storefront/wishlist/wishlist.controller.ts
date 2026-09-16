import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { WishlistService } from './wishlist.service';
import { AddWishlistItemDto } from './dto/add-wishlist-item.dto';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';

@Controller('wishlist')
@UseGuards(CustomerAuthGuard)
export class WishlistController {
  constructor(private readonly wishlistService: WishlistService) {}

  @Get()
  get(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.wishlistService.get(customer.id);
  }

  @Post('items')
  @HttpCode(201)
  addItem(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: AddWishlistItemDto) {
    return this.wishlistService.addItem(customer.id, dto.productVariantId);
  }

  @Delete('items/:variantId')
  removeItem(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('variantId', ParseIntPipe) variantId: number) {
    return this.wishlistService.removeItem(customer.id, variantId);
  }
}

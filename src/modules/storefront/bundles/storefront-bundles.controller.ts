import { Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { GuestToken } from '../../../common/customer/guest-token.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { StorefrontBundlesService } from './storefront-bundles.service';

@Controller('bundles') @UseGuards(OptionalCustomerAuthGuard)
export class StorefrontBundlesController {
  constructor(private readonly service: StorefrontBundlesService) {}

  @Get() list() { return this.service.list(); }
  @Get(':slug') detail(@Param('slug') slug: string) { return this.service.detail(slug); }

  @Post(':slug/add-to-cart') @HttpCode(201)
  addToCart(
    @Param('slug') slug: string,
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
  ) {
    return this.service.addToCart(slug, customer?.id, guestToken);
  }
}

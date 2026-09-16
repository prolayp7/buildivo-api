import { Controller, Get, UseGuards } from '@nestjs/common';
import { StorefrontShippingService } from './storefront-shipping.service';
import { CartService } from '../cart/cart.service';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { GuestToken } from '../../../common/customer/guest-token.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';

@Controller('shipping-methods')
@UseGuards(OptionalCustomerAuthGuard)
export class StorefrontShippingController {
  constructor(
    private readonly shippingService: StorefrontShippingService,
    private readonly cartService: CartService,
  ) {}

  @Get()
  async quotes(@CurrentCustomer() customer: AuthenticatedCustomer | undefined, @GuestToken() guestToken?: string) {
    const { lines } = await this.cartService.linesFor(customer?.id, guestToken);
    const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
    const totalWeightKg = lines.reduce((sum, l) => sum + l.weightKg, 0);
    return this.shippingService.quotes(totalWeightKg, subtotal);
  }
}

import { Module } from '@nestjs/common';
import { StorefrontShippingController } from './storefront-shipping.controller';
import { StorefrontShippingService } from './storefront-shipping.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [CustomerCoreModule, CartModule],
  controllers: [StorefrontShippingController],
  providers: [StorefrontShippingService],
  exports: [StorefrontShippingService],
})
export class StorefrontShippingModule {}

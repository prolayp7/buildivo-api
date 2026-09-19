import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { OrderExpiryService } from './order-expiry.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { CartModule } from '../cart/cart.module';
import { StorefrontShippingModule } from '../shipping/storefront-shipping.module';
import { StorefrontCouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [CustomerCoreModule, CartModule, StorefrontShippingModule, StorefrontCouponsModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrderExpiryService],
})
export class OrdersModule {}

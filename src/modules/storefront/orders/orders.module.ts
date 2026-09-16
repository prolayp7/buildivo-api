import { Module } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { CartModule } from '../cart/cart.module';
import { StorefrontShippingModule } from '../shipping/storefront-shipping.module';
import { StorefrontCouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [CustomerCoreModule, CartModule, StorefrontShippingModule, StorefrontCouponsModule],
  controllers: [OrdersController],
  providers: [OrdersService],
})
export class OrdersModule {}

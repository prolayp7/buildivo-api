import { Module } from '@nestjs/common';
import { CartController } from './cart.controller';
import { CartService } from './cart.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { StorefrontCouponsModule } from '../coupons/coupons.module';

@Module({
  imports: [CustomerCoreModule, StorefrontCouponsModule],
  controllers: [CartController],
  providers: [CartService],
  exports: [CartService],
})
export class CartModule {}

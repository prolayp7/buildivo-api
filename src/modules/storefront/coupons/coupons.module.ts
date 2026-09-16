import { Module } from '@nestjs/common';
import { StorefrontCouponsService } from './coupons.service';

@Module({
  providers: [StorefrontCouponsService],
  exports: [StorefrontCouponsService],
})
export class StorefrontCouponsModule {}

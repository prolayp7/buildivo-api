import { Module } from '@nestjs/common';
import { StorefrontProductsController } from './storefront-products.controller';
import { StorefrontProductsService } from './storefront-products.service';

@Module({
  controllers: [StorefrontProductsController],
  providers: [StorefrontProductsService],
  exports: [StorefrontProductsService],
})
export class StorefrontProductsModule {}

import { Module } from '@nestjs/common';
import { StorefrontMerchandisingController } from './storefront-merchandising.controller';
import { StorefrontMerchandisingService } from './storefront-merchandising.service';
import { StorefrontProductsModule } from '../catalog/products/storefront-products.module';

@Module({
  imports: [StorefrontProductsModule],
  controllers: [StorefrontMerchandisingController],
  providers: [StorefrontMerchandisingService],
})
export class StorefrontMerchandisingModule {}

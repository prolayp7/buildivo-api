import { Module } from '@nestjs/common';
import { StorefrontBrandsController } from './storefront-brands.controller';
import { StorefrontBrandsService } from './storefront-brands.service';

@Module({
  controllers: [StorefrontBrandsController],
  providers: [StorefrontBrandsService],
})
export class StorefrontBrandsModule {}

import { Module } from '@nestjs/common';
import { StorefrontCategoriesController } from './storefront-categories.controller';
import { StorefrontCategoriesService } from './storefront-categories.service';

@Module({
  controllers: [StorefrontCategoriesController],
  providers: [StorefrontCategoriesService],
})
export class StorefrontCategoriesModule {}

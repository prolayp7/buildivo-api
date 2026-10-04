import { Module } from '@nestjs/common';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { StorefrontCatalogCacheInvalidationInterceptor } from '../../../../common/interceptors/storefront-catalog-cache-invalidation.interceptor';

@Module({
  controllers: [CategoriesController],
  providers: [CategoriesService, StorefrontCatalogCacheInvalidationInterceptor],
})
export class CategoriesModule {}

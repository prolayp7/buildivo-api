import { Module } from '@nestjs/common';
import { BrandsController } from './brands.controller';
import { BrandsService } from './brands.service';
import { StorefrontCatalogCacheInvalidationInterceptor } from '../../../../common/interceptors/storefront-catalog-cache-invalidation.interceptor';

@Module({
  controllers: [BrandsController],
  providers: [BrandsService, StorefrontCatalogCacheInvalidationInterceptor],
})
export class BrandsModule {}

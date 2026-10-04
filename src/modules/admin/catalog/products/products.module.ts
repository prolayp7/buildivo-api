import { Module } from '@nestjs/common';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductsImportService } from './products-import.service';
import { StorefrontCatalogCacheInvalidationInterceptor } from '../../../../common/interceptors/storefront-catalog-cache-invalidation.interceptor';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, ProductsImportService, StorefrontCatalogCacheInvalidationInterceptor],
})
export class ProductsModule {}

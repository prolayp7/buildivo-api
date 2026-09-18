import { Module } from '@nestjs/common';
import { StorefrontAuthController, StorefrontMeController } from './storefront-auth.controller';
import { StorefrontAuthService } from './storefront-auth.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { StorefrontProductsModule } from '../catalog/products/storefront-products.module';

@Module({
  imports: [CustomerCoreModule, StorefrontProductsModule],
  controllers: [StorefrontAuthController, StorefrontMeController],
  providers: [StorefrontAuthService],
})
export class StorefrontAuthModule {}

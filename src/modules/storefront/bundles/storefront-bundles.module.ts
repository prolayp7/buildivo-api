import { Module } from '@nestjs/common';
import { StorefrontBundlesController } from './storefront-bundles.controller';
import { StorefrontBundlesService } from './storefront-bundles.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { CartModule } from '../cart/cart.module';

@Module({
  imports: [CustomerCoreModule, CartModule],
  controllers: [StorefrontBundlesController],
  providers: [StorefrontBundlesService],
})
export class StorefrontBundlesModule {}

import { Module } from '@nestjs/common';
import { StorefrontAddressesController } from './storefront-addresses.controller';
import { StorefrontAddressesService } from './storefront-addresses.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';

@Module({
  imports: [CustomerCoreModule],
  controllers: [StorefrontAddressesController],
  providers: [StorefrontAddressesService],
})
export class StorefrontAddressesModule {}

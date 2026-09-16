import { Module } from '@nestjs/common';
import { StorefrontReturnsController } from './returns.controller';
import { StorefrontReturnsService } from './returns.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';

@Module({
  imports: [CustomerCoreModule],
  controllers: [StorefrontReturnsController],
  providers: [StorefrontReturnsService],
})
export class StorefrontReturnsModule {}

import { Module } from '@nestjs/common';
import { StorefrontReturnsController } from './returns.controller';
import { StorefrontReturnsService } from './returns.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';
import { ReturnsCoreModule } from '../../returns/returns-core.module';

@Module({
  imports: [CustomerCoreModule, ReturnsCoreModule],
  controllers: [StorefrontReturnsController],
  providers: [StorefrontReturnsService],
})
export class StorefrontReturnsModule {}

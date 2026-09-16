import { Module } from '@nestjs/common';
import { StorefrontQuotesController } from './quotes.controller';
import { StorefrontQuotesService } from './quotes.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';

@Module({
  imports: [CustomerCoreModule],
  controllers: [StorefrontQuotesController],
  providers: [StorefrontQuotesService],
})
export class StorefrontQuotesModule {}

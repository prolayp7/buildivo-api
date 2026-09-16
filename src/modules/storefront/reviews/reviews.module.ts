import { Module } from '@nestjs/common';
import { StorefrontReviewsController } from './reviews.controller';
import { StorefrontReviewsService } from './reviews.service';
import { CustomerCoreModule } from '../../../common/customer/customer-core.module';

@Module({
  imports: [CustomerCoreModule],
  controllers: [StorefrontReviewsController],
  providers: [StorefrontReviewsService],
})
export class StorefrontReviewsModule {}

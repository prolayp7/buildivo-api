import { Module } from '@nestjs/common';
import { StorefrontProductsController } from './storefront-products.controller';
import { AdminAiModule } from '../../../admin/ai/ai.module';
import { StorefrontAssistantService } from './storefront-assistant.service';
import { StorefrontRecommendationsService } from './storefront-recommendations.service';
import { StorefrontProductsService } from './storefront-products.service';

@Module({
  imports: [AdminAiModule],
  controllers: [StorefrontProductsController],
  providers: [StorefrontProductsService, StorefrontRecommendationsService, StorefrontAssistantService],
  exports: [StorefrontProductsService],
})
export class StorefrontProductsModule {}

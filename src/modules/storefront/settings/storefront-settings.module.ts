import { Module } from '@nestjs/common';
import { StorefrontSettingsController } from './storefront-settings.controller';
import { StorefrontSettingsService } from './storefront-settings.service';

@Module({
  controllers: [StorefrontSettingsController],
  providers: [StorefrontSettingsService],
})
export class StorefrontSettingsModule {}

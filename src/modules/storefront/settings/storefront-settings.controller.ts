import { Controller, Get } from '@nestjs/common';
import { StorefrontSettingsService } from './storefront-settings.service';

@Controller('settings')
export class StorefrontSettingsController {
  constructor(private readonly service: StorefrontSettingsService) {}

  @Get('general')
  general() {
    return this.service.general();
  }
}

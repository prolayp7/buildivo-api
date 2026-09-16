import { Controller, Get } from '@nestjs/common';
import { StorefrontMerchandisingService } from './storefront-merchandising.service';

@Controller('home')
export class StorefrontMerchandisingController {
  constructor(private readonly merchandisingService: StorefrontMerchandisingService) {}

  @Get()
  home() {
    return this.merchandisingService.home();
  }
}

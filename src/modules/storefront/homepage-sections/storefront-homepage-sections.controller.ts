import { Controller, Get } from '@nestjs/common';
import { StorefrontHomepageSectionsService } from './storefront-homepage-sections.service';

@Controller('homepage-sections')
export class StorefrontHomepageSectionsController {
  constructor(private readonly service: StorefrontHomepageSectionsService) {}

  @Get()
  list() {
    return this.service.list();
  }
}

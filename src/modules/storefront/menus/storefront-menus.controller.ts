import { Controller, Get, Param } from '@nestjs/common';
import { StorefrontMenusService } from './storefront-menus.service';

@Controller('menus')
export class StorefrontMenusController {
  constructor(private readonly service: StorefrontMenusService) {}

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.service.bySlug(slug);
  }
}

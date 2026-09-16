import { Controller, Get, Param } from '@nestjs/common';
import { StorefrontBrandsService } from './storefront-brands.service';

@Controller('brands')
export class StorefrontBrandsController {
  constructor(private readonly brandsService: StorefrontBrandsService) {}

  @Get()
  list() {
    return this.brandsService.list();
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.brandsService.bySlug(slug);
  }
}

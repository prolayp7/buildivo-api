import { Controller, Get, Param } from '@nestjs/common';
import { StorefrontCategoriesService } from './storefront-categories.service';

@Controller('categories')
export class StorefrontCategoriesController {
  constructor(private readonly categoriesService: StorefrontCategoriesService) {}

  @Get()
  tree() {
    return this.categoriesService.tree();
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.categoriesService.bySlug(slug);
  }
}

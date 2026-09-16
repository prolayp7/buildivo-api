import { Module } from '@nestjs/common';
import {
  StorefrontBlogCategoriesController,
  StorefrontBlogController,
  StorefrontFaqsController,
  StorefrontPagesController,
  StorefrontTestimonialsController,
} from './storefront-cms.controller';
import { StorefrontCmsService } from './storefront-cms.service';

@Module({
  controllers: [
    StorefrontPagesController,
    StorefrontBlogCategoriesController,
    StorefrontBlogController,
    StorefrontFaqsController,
    StorefrontTestimonialsController,
  ],
  providers: [StorefrontCmsService],
})
export class StorefrontCmsModule {}

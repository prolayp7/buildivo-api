import { Controller, Get, Param, Query } from '@nestjs/common';
import { StorefrontCmsService } from './storefront-cms.service';
import { ListBlogPostsQueryDto } from './dto/list-blog-posts-query.dto';

@Controller('pages')
export class StorefrontPagesController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get(':slug')
  page(@Param('slug') slug: string) {
    return this.cmsService.page(slug);
  }
}

@Controller('blog-categories')
export class StorefrontBlogCategoriesController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get()
  list() {
    return this.cmsService.blogCategories();
  }
}

@Controller('blog')
export class StorefrontBlogController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get()
  list(@Query() query: ListBlogPostsQueryDto) {
    return this.cmsService.blogPosts(query);
  }

  @Get(':slug')
  detail(@Param('slug') slug: string) {
    return this.cmsService.blogPost(slug);
  }
}

@Controller('faqs')
export class StorefrontFaqsController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get()
  list() {
    return this.cmsService.faqs();
  }
}

@Controller('testimonials')
export class StorefrontTestimonialsController {
  constructor(private readonly cmsService: StorefrontCmsService) {}

  @Get()
  list() {
    return this.cmsService.testimonials();
  }
}

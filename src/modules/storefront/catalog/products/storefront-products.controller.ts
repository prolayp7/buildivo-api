import { Controller, Get, Param, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { StorefrontAssistantService } from './storefront-assistant.service';
import { StorefrontRecommendationsService } from './storefront-recommendations.service';
import { StorefrontProductsService } from './storefront-products.service';
import { ListStorefrontProductsQueryDto } from './dto/list-storefront-products-query.dto';
import { CompatibleProductsQueryDto } from './dto/compatible-products-query.dto';

@Controller('products')
export class StorefrontProductsController {
  constructor(private readonly productsService: StorefrontProductsService, private readonly recommendations: StorefrontRecommendationsService, private readonly assistant: StorefrontAssistantService) {}

  @Get()
  list(@Query() query: ListStorefrontProductsQueryDto) {
    return this.productsService.list(query);
  }

  // Simple, honest "recommended for you": real best-sellers, not a fake
  // personalisation score. Used by rails with no stronger signal to go on
  // (empty basket, account overview, the sign-in page).
  @Get('recommended')
  recommended(@Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number) {
    return this.productsService.bestSellers(Math.min(limit, 12));
  }

  // Free-text product advisor. Always 200: mode 'none' means "nothing to add, show normal results"
  // (short query, no OpenAI key, daily limit reached, or the model could not help).
  @Get('assistant')
  advise(@Query('q') q?: string) {
    return this.assistant.advise(typeof q === 'string' ? q : '');
  }

  @Get('compare')
  compare(@Query('ids') ids: string) {
    const parsed = (ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    return this.productsService.compare(parsed);
  }

  @Get('tool-platforms')
  toolPlatforms(@Query('category') category?: string) {
    return this.productsService.toolPlatforms(category);
  }

  @Get(':slug/compatible')
  compatible(@Param('slug') slug: string, @Query() query: CompatibleProductsQueryDto) {
    return this.productsService.compatibleProducts(slug, query);
  }

  @Get(':slug/platform-matches')
  platformMatches(@Param('slug') slug: string, @Query() query: CompatibleProductsQueryDto) {
    return this.productsService.platformMatches(slug, query);
  }

  @Get(':slug/frequently-bought-together')
  frequentlyBoughtTogether(@Param('slug') slug: string, @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number) {
    return this.productsService.frequentlyBoughtTogether(slug, Math.min(limit, 12));
  }

  // Rule-based recommendations for a product page (curated, bought together, same platform, category, best sellers).
  @Get(':slug/recommendations')
  recommendationsFor(@Param('slug') slug: string, @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number) {
    return this.recommendations.forProduct(slug, Math.min(Math.max(limit, 1), 12));
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.productsService.bySlug(slug);
  }
}

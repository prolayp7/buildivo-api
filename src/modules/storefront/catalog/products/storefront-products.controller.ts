import { Controller, Get, Param, ParseIntPipe, Query, DefaultValuePipe } from '@nestjs/common';
import { StorefrontProductsService } from './storefront-products.service';
import { ListStorefrontProductsQueryDto } from './dto/list-storefront-products-query.dto';
import { CompatibleProductsQueryDto } from './dto/compatible-products-query.dto';

@Controller('products')
export class StorefrontProductsController {
  constructor(private readonly productsService: StorefrontProductsService) {}

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

  @Get('compare')
  compare(@Query('ids') ids: string) {
    const parsed = (ids ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isInteger(n) && n > 0);
    return this.productsService.compare(parsed);
  }

  @Get(':slug/compatible')
  compatible(@Param('slug') slug: string, @Query() query: CompatibleProductsQueryDto) {
    return this.productsService.compatibleProducts(slug, query);
  }

  @Get(':slug/frequently-bought-together')
  frequentlyBoughtTogether(@Param('slug') slug: string, @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number) {
    return this.productsService.frequentlyBoughtTogether(slug, Math.min(limit, 12));
  }

  @Get(':slug')
  bySlug(@Param('slug') slug: string) {
    return this.productsService.bySlug(slug);
  }
}

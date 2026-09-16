import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CreateProductDto } from './dto/create-product.dto';
import { CreateProductFaqDto } from './dto/create-product-faq.dto';
import { CreateProductVariantDto } from './dto/create-product-variant.dto';
import { ListProductsQueryDto } from './dto/list-products-query.dto';
import { ListStockQueryDto } from './dto/list-stock-query.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { UpdateProductVariantDto } from './dto/update-product-variant.dto';
import { UpdateStockDto } from './dto/update-stock.dto';
import { UpsertPriceTierDto } from './dto/upsert-price-tier.dto';
import { ProductsService } from './products.service';
import { ProductsImportService, UploadedImportFile } from './products-import.service';

@Controller('admin/products')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('products.manage')
export class ProductsController {
  constructor(
    private readonly service: ProductsService,
    private readonly importService: ProductsImportService,
  ) {}

  @Get()
  list(@Query() query: ListProductsQueryDto) {
    return this.service.list(query);
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateProductDto) {
    return this.service.create(dto);
  }

  @Post('import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024, files: 1 } }))
  import(@UploadedFile() file?: UploadedImportFile) {
    return this.importService.import(file);
  }

  @Get('stock')
  stockList(@Query() query: ListStockQueryDto) {
    return this.service.stockList(query);
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.service.detail(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateProductDto) {
    return this.service.update(id, dto);
  }

  @Post(':id/duplicate')
  @HttpCode(201)
  duplicate(@Param('id', ParseIntPipe) id: number) {
    return this.service.duplicate(id);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.service.remove(id);
  }

  @Post(':id/faqs')
  @HttpCode(201)
  addFaq(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductFaqDto,
  ) {
    return this.service.addFaq(id, dto);
  }

  @Delete(':id/faqs/:faqId')
  @HttpCode(204)
  async removeFaq(
    @Param('id', ParseIntPipe) id: number,
    @Param('faqId', ParseIntPipe) faqId: number,
  ): Promise<void> {
    await this.service.removeFaq(id, faqId);
  }

  @Get(':id/variants')
  listVariants(@Param('id', ParseIntPipe) id: number) {
    return this.service.listVariants(id);
  }

  @Post(':id/variants')
  @HttpCode(201)
  createVariant(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateProductVariantDto,
  ) {
    return this.service.createVariant(id, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateProductVariantDto,
  ) {
    return this.service.updateVariant(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(204)
  async removeVariant(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
  ): Promise<void> {
    await this.service.removeVariant(id, variantId);
  }

  @Patch(':id/variants/:variantId/stock')
  updateStock(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpdateStockDto,
  ) {
    return this.service.updateStock(id, variantId, dto);
  }

  @Get(':id/variants/:variantId/price-tiers')
  listPriceTiers(@Param('id', ParseIntPipe) id: number, @Param('variantId', ParseIntPipe) variantId: number) {
    return this.service.listPriceTiers(id, variantId);
  }

  @Post(':id/variants/:variantId/price-tiers')
  @HttpCode(201)
  upsertPriceTier(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Body() dto: UpsertPriceTierDto,
  ) {
    return this.service.upsertPriceTier(id, variantId, dto);
  }

  @Delete(':id/variants/:variantId/price-tiers/:tierId')
  @HttpCode(204)
  async removePriceTier(
    @Param('id', ParseIntPipe) id: number,
    @Param('variantId', ParseIntPipe) variantId: number,
    @Param('tierId', ParseIntPipe) tierId: number,
  ): Promise<void> {
    await this.service.removePriceTier(id, variantId, tierId);
  }
}

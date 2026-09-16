import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CreateProductConditionDto } from './dto/create-product-condition.dto';
import { ProductConditionsService } from './product-conditions.service';

@Controller('admin/product-conditions')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('products.manage')
export class ProductConditionsController {
  constructor(private readonly service: ProductConditionsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateProductConditionDto) {
    return this.service.create(dto);
  }
}

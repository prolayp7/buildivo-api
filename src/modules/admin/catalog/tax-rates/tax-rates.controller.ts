import { Body, Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CreateTaxRateDto } from './dto/create-tax-rate.dto';
import { TaxRatesService } from './tax-rates.service';

@Controller('admin/tax-rates')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('products.manage')
export class TaxRatesController {
  constructor(private readonly service: TaxRatesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateTaxRateDto) {
    return this.service.create(dto);
  }
}

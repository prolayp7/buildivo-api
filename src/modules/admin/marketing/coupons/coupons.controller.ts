import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { CouponsService } from './coupons.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { ListCouponsQueryDto } from './dto/list-coupons-query.dto';
import { UpdateCouponDto } from './dto/update-coupon.dto';
import { CreateAutomaticDiscountDto } from './dto/create-automatic-discount.dto';
import { UpdateAutomaticDiscountDto } from './dto/update-automatic-discount.dto';

@Controller('admin/coupons') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('marketing.manage')
export class CouponsController {
  constructor(private readonly service: CouponsService) {}
  @Get('automatic') automaticList() { return this.service.listAutomatic(); }
  @Get('automatic/:id') automaticDetail(@Param('id', ParseIntPipe) id: number) { return this.service.automaticDetail(id); }
  @Post('automatic') @HttpCode(201) automaticCreate(@Body() dto: CreateAutomaticDiscountDto) { return this.service.createAutomatic(dto); }
  @Patch('automatic/:id') automaticUpdate(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAutomaticDiscountDto) { return this.service.updateAutomatic(id, dto); }
  @Delete('automatic/:id') @HttpCode(204) async automaticRemove(@Param('id', ParseIntPipe) id: number) { await this.service.removeAutomatic(id); }
  @Get() list(@Query() query: ListCouponsQueryDto) { return this.service.list(query); }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) { return this.service.find(id); }
  @Post() @HttpCode(201) create(@Body() dto: CreateCouponDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCouponDto) { return this.service.update(id, dto); }
  @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}

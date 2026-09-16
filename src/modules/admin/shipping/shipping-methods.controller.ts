import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CreateRateBandDto } from './dto/create-rate-band.dto';
import { CreateShippingMethodDto } from './dto/create-shipping-method.dto';
import { UpdateShippingMethodDto } from './dto/update-shipping-method.dto';
import { ShippingMethodsService } from './shipping-methods.service';

@Controller('admin/shipping-methods')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('shipping.manage')
export class ShippingMethodsController {
  constructor(private readonly service: ShippingMethodsService) {}

  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(201) create(@Body() dto: CreateShippingMethodDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateShippingMethodDto) { return this.service.update(id, dto); }

  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }

  @Post(':id/rate-bands') @HttpCode(201)
  addRateBand(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateRateBandDto) { return this.service.addRateBand(id, dto); }

  @Delete(':id/rate-bands/:bandId') @HttpCode(204)
  async removeRateBand(@Param('id', ParseIntPipe) id: number, @Param('bandId', ParseIntPipe) bandId: number): Promise<void> {
    await this.service.removeRateBand(id, bandId);
  }
}

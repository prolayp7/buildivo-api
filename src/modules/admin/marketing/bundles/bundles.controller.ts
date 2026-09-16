import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../../common/admin/permissions.decorator';
import { BundlesService } from './bundles.service';
import { CreateBundleDto } from './dto/create-bundle.dto';
import { ListBundlesQueryDto } from './dto/list-bundles-query.dto';
import { UpdateBundleDto } from './dto/update-bundle.dto';

@Controller('admin/bundles') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('marketing.manage')
export class BundlesController {
  constructor(private readonly service: BundlesService) {}
  @Get() list(@Query() query: ListBundlesQueryDto) { return this.service.list(query); }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) { return this.service.find(id); }
  @Post() @HttpCode(201) create(@Body() dto: CreateBundleDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateBundleDto) { return this.service.update(id, dto); }
  @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}

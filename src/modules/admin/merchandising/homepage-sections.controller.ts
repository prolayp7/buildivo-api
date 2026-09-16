import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { ReorderHomepageSectionsDto } from './dto/reorder-homepage-sections.dto';
import { UpdateHomepageSectionDto } from './dto/update-homepage-section.dto';
import { HomepageSectionsService } from './homepage-sections.service';

@Controller('admin/homepage-sections')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('marketing.manage')
export class HomepageSectionsController {
  constructor(private readonly service: HomepageSectionsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateHomepageSectionDto) {
    return this.service.update(id, dto);
  }

  @Post('reorder')
  reorder(@Body() dto: ReorderHomepageSectionsDto) {
    return this.service.reorder(dto);
  }
}

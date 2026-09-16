import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common'; import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard'; import { PermissionsGuard } from '../../../common/admin/permissions.guard'; import { RequirePermissions } from '../../../common/admin/permissions.decorator'; import { CreateMenuDto } from './dto/create-menu.dto'; import { CreateMenuItemDto } from './dto/create-menu-item.dto'; import { UpdateMenuItemDto } from './dto/update-menu-item.dto'; import { UpsertMegaMenuPanelDto } from './dto/upsert-mega-menu-panel.dto'; import { MenusService } from './menus.service';
@Controller('admin/menus') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('marketing.manage')
export class MenusController {
  constructor(private readonly service: MenusService) {}
  @Get() list() { return this.service.list(); }
  @Post() @HttpCode(201) create(@Body() dto: CreateMenuDto) { return this.service.create(dto); }
  @Post(':id/items') @HttpCode(201) addItem(@Param('id', ParseIntPipe) id: number, @Body() dto: CreateMenuItemDto) { return this.service.addItem(id, dto); }
  @Patch(':id/items/:itemId') updateItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpdateMenuItemDto) { return this.service.updateItem(id, itemId, dto); }
  @Delete(':id/items/:itemId') @HttpCode(204) async removeItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number): Promise<void> { await this.service.removeItem(id, itemId); }
  @Post('items/:itemId/mega-menu-panel') upsertPanel(@Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpsertMegaMenuPanelDto) { return this.service.upsertPanel(itemId, dto); }
}

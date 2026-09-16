import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { RolesService } from './roles.service';

@Controller('admin')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('admins.manage')
export class RolesController {
  constructor(private readonly service: RolesService) {}
  @Get('roles') list() { return this.service.list(); }
  @Post('roles') @HttpCode(201) create(@Body() dto: CreateRoleDto) { return this.service.create(dto); }
  @Patch('roles/:id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateRoleDto) { return this.service.update(id, dto); }
  @Delete('roles/:id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
  @Get('permissions') permissions() { return this.service.permissions(); }
}

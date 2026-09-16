import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto } from './dto/create-admin-user.dto';
import { ListAdminUsersQueryDto } from './dto/list-admin-users-query.dto';
import { UpdateAdminUserDto } from './dto/update-admin-user.dto';

@Controller('admin/admin-users')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('admins.manage')
export class AdminUsersController {
  constructor(private readonly service: AdminUsersService) {}
  @Get() list(@Query() query: ListAdminUsersQueryDto) { return this.service.list(query); }
  @Post() @HttpCode(201) create(@Body() dto: CreateAdminUserDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateAdminUserDto) { return this.service.update(id, dto); }
  @Delete(':id') @HttpCode(204)
  async remove(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin): Promise<void> { await this.service.remove(id, admin.id); }
}

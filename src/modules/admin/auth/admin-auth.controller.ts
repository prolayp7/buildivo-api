import { Body, Controller, Get, HttpCode, Patch, Post, UseGuards } from '@nestjs/common';
import { AdminAuthService } from './admin-auth.service';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { ChangePasswordDto, UpdateAccountDto } from './dto/update-account.dto';

@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.adminAuthService.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(200)
  refresh(@Body() dto: RefreshDto) {
    return this.adminAuthService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Body() dto: RefreshDto): Promise<void> {
    await this.adminAuthService.logout(dto.refreshToken);
  }
}

@Controller('admin/me')
@UseGuards(AdminAuthGuard)
export class AdminMeController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Get()
  me(@CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.adminAuthService.me(admin.id);
  }

  @Patch()
  update(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: UpdateAccountDto) {
    return this.adminAuthService.updateAccount(admin.id, dto);
  }

  @Post('password')
  @HttpCode(200)
  changePassword(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: ChangePasswordDto) {
    return this.adminAuthService.changePassword(admin.id, dto.currentPassword, dto.newPassword);
  }
}

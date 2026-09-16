import { Body, Controller, Get, Headers, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { UpsertSettingDto } from './dto/upsert-setting.dto';
import { SettingsService } from './settings.service';
import { SaveIntegrationDto, UnlockIntegrationDto } from './dto/integration-settings.dto';

@Controller('admin/settings')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
export class SettingsController {
  constructor(private readonly service: SettingsService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Get('integrations')
  integrations() { return this.service.integrationSummaries(); }

  @Post('integrations/unlock')
  unlock(@CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: UnlockIntegrationDto) {
    return this.service.unlock(admin.id, dto.scope, dto.password);
  }

  @Get('integrations/:scope')
  integration(@CurrentAdmin() admin: AuthenticatedAdmin, @Param('scope') scope: string, @Headers('x-settings-unlock') token?: string) {
    return this.service.integration(admin.id, scope, token);
  }

  @Put('integrations/:scope')
  saveIntegration(@CurrentAdmin() admin: AuthenticatedAdmin, @Param('scope') scope: string, @Headers('x-settings-unlock') token: string | undefined, @Body() dto: SaveIntegrationDto) {
    return this.service.saveIntegration(admin.id, scope, token, dto);
  }

  @Put(':key')
  upsert(@Param('key') key: string, @Body() dto: UpsertSettingDto) {
    return this.service.upsert(key, dto);
  }
}

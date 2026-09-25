import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { AiService } from './ai.service';

@Controller('admin/ai')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
export class AiController {
  constructor(private readonly service: AiService) {}

  @Get('status') status() { return this.service.status(); }

  // Starts an indexing pass now instead of waiting for the 10-minute schedule.
  @Post('reindex') @HttpCode(200) reindex() { return this.service.reindex(); }

  @Post('test') @HttpCode(200) test() { return this.service.testConnection(); }
}

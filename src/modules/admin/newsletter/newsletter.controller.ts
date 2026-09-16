import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { AdminNewsletterService } from './newsletter.service';
import { ListSubscribersQueryDto } from './dto/list-subscribers-query.dto';

@Controller('admin/newsletter-subscribers')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('marketing.manage')
export class AdminNewsletterController {
  constructor(private readonly service: AdminNewsletterService) {}

  @Get()
  list(@Query() query: ListSubscribersQueryDto) {
    return this.service.list(query);
  }
}

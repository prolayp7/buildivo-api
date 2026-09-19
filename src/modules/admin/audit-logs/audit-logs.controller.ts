import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { buildPaginationMeta, paginationSkipTake } from '../../../common/pagination';
import { PrismaService } from '../../../prisma/prisma.service';

class ListAuditLogsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() @MaxLength(80) action?: string;
  @IsOptional() @IsString() @MaxLength(80) entity?: string;
  @IsOptional() @IsString() @MaxLength(80) entityId?: string;
  @IsOptional() @IsString() @MaxLength(64) correlationId?: string;
}

@Controller('admin/audit-logs')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('reports.view')
export class AuditLogsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async list(@Query() query: ListAuditLogsQueryDto) {
    const page = query.page!, perPage = query.perPage!;
    const where = {
      ...(query.action ? { action: { contains: query.action, mode: 'insensitive' as const } } : {}),
      ...(query.entity ? { entity: query.entity } : {}),
      ...(query.entityId ? { entityId: query.entityId } : {}),
      ...(query.correlationId ? { correlationId: query.correlationId } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, ...paginationSkipTake(page, perPage), orderBy: { id: 'desc' } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, meta: buildPaginationMeta(page, perPage, total) };
  }
}

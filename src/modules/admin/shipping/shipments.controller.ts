import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CreateShipmentDto } from './dto/create-shipment.dto';
import { ListShipmentsQueryDto } from './dto/list-shipments-query.dto';
import { ShipmentsService } from './shipments.service';

@Controller('admin/shipments')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('shipping.manage')
export class ShipmentsController {
  constructor(private readonly shipments: ShipmentsService) {}

  @Get()
  list(@Query() query: ListShipmentsQueryDto) { return this.shipments.list(query.orderId); }

  @Get(':uuid')
  detail(@Param('uuid') uuid: string) { return this.shipments.detail(uuid); }

  @Post()
  create(@Body() dto: CreateShipmentDto, @Headers('idempotency-key') idempotencyKey?: string) {
    if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key must contain 16 to 128 safe characters');
    }
    return this.shipments.create(dto, idempotencyKey);
  }
}

import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { ListAbandonedCartsQueryDto } from './dto/list-abandoned-carts-query.dto';
import { UpdateOrderItemStatusDto } from './dto/update-order-item-status.dto';
import { UpdateOrderNoteDto } from './dto/update-order-note.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { UpdateTrackingDto } from './dto/update-tracking.dto';
import { OrdersService } from './orders.service';

@Controller('admin/orders')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('orders.manage')
export class OrdersController {
  constructor(private readonly service: OrdersService) {}

  @Get() list(@Query() query: ListOrdersQueryDto) { return this.service.list(query); }
  @Get('summary') summary() { return this.service.summary(); }
  @Get('abandoned-carts') abandonedCarts(@Query() query: ListAbandonedCartsQueryDto) { return this.service.abandonedCarts(query); }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) { return this.service.detail(id); }

  @Patch(':id/status')
  updateStatus(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: UpdateOrderStatusDto) {
    return this.service.updateStatus(id, admin.id, dto);
  }

  @Patch(':id/tracking')
  updateTracking(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateTrackingDto) {
    return this.service.updateTracking(id, dto);
  }

  @Patch(':id/items/:itemId/status')
  updateItemStatus(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: UpdateOrderItemStatusDto) {
    return this.service.updateItemStatus(id, itemId, dto);
  }

  @Patch(':id/note')
  updateNote(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrderNoteDto) {
    return this.service.updateNote(id, dto.adminNote);
  }
}

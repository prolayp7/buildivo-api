import { Body, Controller, Param, ParseIntPipe, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { RefundOrderDto } from './dto/refund-order.dto';
import { PaymentOperationsService } from './payment-operations.service';

@Controller('admin/orders')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class OrderRefundsController {
  constructor(private readonly service: PaymentOperationsService) {}

  @Post(':id/refund')
  @RequirePermissions('orders.refund')
  refund(@Param('id', ParseIntPipe) id: number, @Body() dto: RefundOrderDto, @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.service.refundOrder(id, dto, admin.id);
  }
}

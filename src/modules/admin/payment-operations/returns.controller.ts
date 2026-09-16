import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { ApproveReturnDto } from './dto/approve-return.dto';
import { ListReturnsQueryDto } from './dto/list-returns-query.dto';
import { RefundReturnDto } from './dto/refund-return.dto';
import { RejectReturnDto } from './dto/reject-return.dto';
import { PaymentOperationsService } from './payment-operations.service';

@Controller('admin/returns') @UseGuards(AdminAuthGuard, PermissionsGuard)
export class ReturnsController {
  constructor(private readonly service: PaymentOperationsService) {}
  @Get() @RequirePermissions('orders.manage') list(@Query() query: ListReturnsQueryDto) { return this.service.listReturns(query); }
  @Patch(':id/approve') @RequirePermissions('orders.refund') approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveReturnDto) { return this.service.approve(id, dto); }
  @Patch(':id/reject') @RequirePermissions('orders.refund') reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectReturnDto) { return this.service.reject(id, dto); }
  @Patch(':id/receive') @RequirePermissions('orders.refund') receive(@Param('id', ParseIntPipe) id: number) { return this.service.receive(id); }
  @Post(':id/refund') @RequirePermissions('orders.refund') refund(@Param('id', ParseIntPipe) id: number, @Body() dto: RefundReturnDto) { return this.service.refund(id, dto); }
}

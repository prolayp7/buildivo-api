import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { ListDisputesQueryDto } from './dto/list-disputes-query.dto';
import { ListTransactionsQueryDto } from './dto/list-transactions-query.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { PaymentOperationsService } from './payment-operations.service';

@Controller('admin/payments') @UseGuards(AdminAuthGuard, PermissionsGuard)
export class PaymentsController {
  constructor(private readonly service: PaymentOperationsService) {}
  @Get('transactions') @RequirePermissions('orders.manage') transactions(@Query() query: ListTransactionsQueryDto) { return this.service.listTransactions(query); }
  @Get('disputes') @RequirePermissions('orders.refund') disputes(@Query() query: ListDisputesQueryDto) { return this.service.listDisputes(query); }
  @Patch('disputes/:id') @RequirePermissions('orders.refund') updateDispute(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDisputeDto) { return this.service.updateDispute(id, dto); }
}

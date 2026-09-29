import { Body, Controller, Get, Header, Param, ParseIntPipe, Post, Query, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { MAX_EVIDENCE_IMAGE_BYTES } from '../../returns/return-rules';
import { AdminReturnsService } from './admin-returns.service';
import { PaymentOperationsService } from './payment-operations.service';
import { ListRefundsQueryDto, ListReturnsQueryDto } from './dto/list-returns-query.dto';
import { ApproveReturnDto, InspectItemDto, ReceiveReturnDto, RejectReturnDto, SchedulePickupDto } from './dto/return-workflow.dto';

@Controller('admin/returns')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class ReturnsController {
  constructor(private readonly returns: AdminReturnsService) {}

  @Get() @RequirePermissions('orders.manage')
  list(@Query() query: ListReturnsQueryDto) { return this.returns.list(query); }

  @Get(':id') @RequirePermissions('orders.manage')
  detail(@Param('id', ParseIntPipe) id: number) { return this.returns.detail(id); }

  @Get(':id/images/:imageId') @RequirePermissions('orders.manage') @Header('Cache-Control', 'private, no-store')
  async image(@Param('id', ParseIntPipe) id: number, @Param('imageId', ParseIntPipe) imageId: number) {
    const image = await this.returns.image(id, imageId);
    return new StreamableFile(image.buffer, { type: image.mimeType });
  }

  @Post(':id/approve') @RequirePermissions('orders.refund')
  approve(@Param('id', ParseIntPipe) id: number, @Body() dto: ApproveReturnDto, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.approve(id, dto, admin.id); }

  @Post(':id/reject') @RequirePermissions('orders.refund')
  reject(@Param('id', ParseIntPipe) id: number, @Body() dto: RejectReturnDto, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.reject(id, dto, admin.id); }

  @Post(':id/pickup') @RequirePermissions('orders.refund')
  schedulePickup(@Param('id', ParseIntPipe) id: number, @Body() dto: SchedulePickupDto, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.schedulePickup(id, dto, admin.id); }

  @Post(':id/picked-up') @RequirePermissions('orders.refund')
  pickedUp(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.markPickedUp(id, admin.id); }

  @Post(':id/receive') @RequirePermissions('orders.refund')
  receive(@Param('id', ParseIntPipe) id: number, @Body() dto: ReceiveReturnDto, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.receive(id, dto, admin.id); }

  @Post(':id/inspection') @RequirePermissions('orders.refund')
  startInspection(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.startInspection(id, admin.id); }

  @Post(':id/items/:itemId/inspection') @RequirePermissions('orders.refund')
  inspectItem(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @Body() dto: InspectItemDto, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.inspectItem(id, itemId, dto, admin.id); }

  @Post(':id/items/:itemId/images') @RequirePermissions('orders.refund')
  @UseInterceptors(FilesInterceptor('images', 10, { limits: { fileSize: MAX_EVIDENCE_IMAGE_BYTES } }))
  addImages(@Param('id', ParseIntPipe) id: number, @Param('itemId', ParseIntPipe) itemId: number, @UploadedFiles() files: { buffer: Buffer; size: number }[] = [], @CurrentAdmin() admin: AuthenticatedAdmin) {
    return this.returns.addInspectionImages(id, itemId, files, admin.id);
  }

  @Post(':id/refund') @RequirePermissions('orders.refund')
  approveRefund(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.approveRefund(id, admin.id); }

  @Post(':id/refund/retry') @RequirePermissions('orders.refund')
  retryRefund(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin) { return this.returns.retryRefund(id, admin.id); }
}

@Controller('admin/refunds')
@UseGuards(AdminAuthGuard, PermissionsGuard)
export class RefundsController {
  constructor(private readonly payments: PaymentOperationsService) {}

  @Get() @RequirePermissions('orders.manage')
  list(@Query() query: ListRefundsQueryDto) { return this.payments.listRefunds({ status: query.status, q: query.q, page: query.page!, perPage: query.perPage! }); }
}

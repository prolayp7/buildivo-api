import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { ListReviewsQueryDto } from './dto/list-reviews-query.dto';
import { RejectReviewDto } from './dto/reject-review.dto';
import { ReviewsService } from './reviews.service';
@Controller('admin/reviews') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('reviews.moderate')
export class ReviewsController {
  constructor(private readonly service: ReviewsService) {}
  @Get() list(@Query() query: ListReviewsQueryDto) { return this.service.list(query); }
  @Patch(':id/approve') approve(@Param('id', ParseIntPipe) id: number) { return this.service.approve(id); }
  @Patch(':id/reject') reject(@Param('id', ParseIntPipe) id: number, @Body() _dto: RejectReviewDto) { return this.service.reject(id); }
  @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}

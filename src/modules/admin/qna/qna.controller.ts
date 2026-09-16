import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CurrentAdmin } from '../../../common/admin/current-admin.decorator';
import { AuthenticatedAdmin } from '../../../common/admin/admin-request';
import { AdminQnaService } from './qna.service';
import { ListProductQuestionsQueryDto } from './dto/list-product-questions-query.dto';
import { AnswerProductQuestionDto } from './dto/answer-product-question.dto';

@Controller('admin/product-questions') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('reviews.moderate')
export class AdminQnaController {
  constructor(private readonly service: AdminQnaService) {}
  @Get() list(@Query() query: ListProductQuestionsQueryDto) { return this.service.list(query); }
  @Patch(':id/answer') answer(@Param('id', ParseIntPipe) id: number, @CurrentAdmin() admin: AuthenticatedAdmin, @Body() dto: AnswerProductQuestionDto) {
    return this.service.answer(id, admin.id, dto);
  }
  @Patch(':id/reject') reject(@Param('id', ParseIntPipe) id: number) { return this.service.reject(id); }
  @Delete(':id') @HttpCode(204) async remove(@Param('id', ParseIntPipe) id: number): Promise<void> { await this.service.remove(id); }
}

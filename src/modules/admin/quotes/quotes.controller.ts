import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { AdminQuotesService } from './quotes.service';
import { ListQuoteRequestsQueryDto } from './dto/list-quote-requests-query.dto';
import { RespondQuoteRequestDto } from './dto/respond-quote-request.dto';

@Controller('admin/quotes') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('quotes.manage')
export class AdminQuotesController {
  constructor(private readonly service: AdminQuotesService) {}
  @Get() list(@Query() query: ListQuoteRequestsQueryDto) { return this.service.list(query); }
  @Get(':id') detail(@Param('id', ParseIntPipe) id: number) { return this.service.find(id); }
  @Patch(':id') respond(@Param('id', ParseIntPipe) id: number, @Body() dto: RespondQuoteRequestDto) { return this.service.respond(id, dto); }
}

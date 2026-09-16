import { Body, Controller, Get, Param, ParseIntPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CreateGiftCardDto } from './dto/create-gift-card.dto';
import { ListGiftCardsQueryDto } from './dto/list-gift-cards-query.dto';
import { UpdateGiftCardDto } from './dto/update-gift-card.dto';
import { GiftCardsService } from './gift-cards.service';
@Controller('admin/gift-cards') @UseGuards(AdminAuthGuard, PermissionsGuard) @RequirePermissions('gift_cards.manage')
export class GiftCardsController {
  constructor(private readonly service: GiftCardsService) {}
  @Get() list(@Query() query: ListGiftCardsQueryDto) { return this.service.list(query); }
  @Post() create(@Body() dto: CreateGiftCardDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateGiftCardDto) { return this.service.update(id, dto); }
}

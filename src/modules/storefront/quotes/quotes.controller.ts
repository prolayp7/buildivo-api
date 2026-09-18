import { Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { StorefrontQuotesService } from './quotes.service';
import { CreateQuoteRequestDto } from './dto/create-quote-request.dto';

@Controller('quotes')
export class StorefrontQuotesController {
  constructor(private readonly service: StorefrontQuotesService) {}

  @Post() @HttpCode(201) @UseGuards(OptionalCustomerAuthGuard)
  create(@CurrentCustomer() customer: AuthenticatedCustomer | undefined, @Body() dto: CreateQuoteRequestDto) {
    return this.service.create(customer?.id, dto);
  }

  @Get() @UseGuards(CustomerAuthGuard)
  listMine(@CurrentCustomer() customer: AuthenticatedCustomer, @Query() query: PaginationQueryDto) {
    return this.service.listMine(customer.id, query);
  }

  @Get(':uuid') @UseGuards(CustomerAuthGuard)
  detail(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string) {
    return this.service.detail(customer.id, uuid);
  }

  @Patch(':uuid/accept') @UseGuards(CustomerAuthGuard)
  accept(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string) {
    return this.service.accept(customer.id, uuid);
  }

  @Patch(':uuid/decline') @UseGuards(CustomerAuthGuard)
  decline(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string) {
    return this.service.decline(customer.id, uuid);
  }
}

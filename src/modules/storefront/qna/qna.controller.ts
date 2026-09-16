import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { StorefrontQnaService } from './qna.service';
import { CreateProductQuestionDto } from './dto/create-product-question.dto';

@Controller('products') @UseGuards(OptionalCustomerAuthGuard)
export class StorefrontQnaController {
  constructor(private readonly service: StorefrontQnaService) {}

  @Get(':slug/questions')
  list(@Param('slug') slug: string) { return this.service.listForProduct(slug); }

  @Post(':slug/questions') @HttpCode(201)
  ask(
    @Param('slug') slug: string,
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @Body() dto: CreateProductQuestionDto,
  ) {
    return this.service.ask(slug, customer?.id, dto);
  }
}

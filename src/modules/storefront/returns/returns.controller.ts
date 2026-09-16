import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { StorefrontReturnsService } from './returns.service';
import { CreateReturnRequestDto } from './dto/create-return-request.dto';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';

@Controller('returns')
@UseGuards(CustomerAuthGuard)
export class StorefrontReturnsController {
  constructor(private readonly returnsService: StorefrontReturnsService) {}

  @Post()
  @HttpCode(201)
  create(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateReturnRequestDto) {
    return this.returnsService.create(customer.id, dto);
  }
}

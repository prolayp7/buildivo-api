import { Body, Controller, Delete, Get, HttpCode, Param, ParseIntPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { StorefrontAddressesService } from './storefront-addresses.service';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Controller('addresses')
@UseGuards(CustomerAuthGuard)
export class StorefrontAddressesController {
  constructor(private readonly addressesService: StorefrontAddressesService) {}

  @Get()
  list(@CurrentCustomer() customer: AuthenticatedCustomer) {
    return this.addressesService.list(customer.id);
  }

  @Get(':id')
  detail(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', ParseIntPipe) id: number) {
    return this.addressesService.detail(customer.id, id);
  }

  @Post()
  @HttpCode(201)
  create(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() dto: CreateAddressDto) {
    return this.addressesService.create(customer.id, dto);
  }

  @Patch(':id')
  update(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.addressesService.update(customer.id, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.addressesService.remove(customer.id, id);
  }
}

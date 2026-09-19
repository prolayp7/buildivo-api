import { Body, Controller, Get, Headers, HttpCode, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { OrdersService } from './orders.service';
import { CheckoutDto } from './dto/checkout.dto';
import { CancelOrderDto } from './dto/cancel-order.dto';
import { OptionalCustomerAuthGuard } from '../../../common/customer/optional-customer-auth.guard';
import { CustomerAuthGuard } from '../../../common/customer/customer-auth.guard';
import { CurrentCustomer } from '../../../common/customer/current-customer.decorator';
import { GuestToken } from '../../../common/customer/guest-token.decorator';
import { AuthenticatedCustomer } from '../../../common/customer/customer-request';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';

@Controller('orders')
@UseGuards(OptionalCustomerAuthGuard)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  @HttpCode(201)
  checkout(
    @CurrentCustomer() customer: AuthenticatedCustomer | undefined,
    @GuestToken() guestToken: string | undefined,
    @Body() dto: CheckoutDto,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    return this.ordersService.checkout(customer?.id, guestToken, dto, idempotencyKey);
  }

  @Get()
  @UseGuards(CustomerAuthGuard)
  list(@CurrentCustomer() customer: AuthenticatedCustomer, @Query() query: PaginationQueryDto) {
    return this.ordersService.list(customer.id, query);
  }

  @Get(':uuid')
  @UseGuards(CustomerAuthGuard)
  detail(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string) {
    return this.ordersService.detail(customer.id, uuid);
  }

  // Sent straight on the express response (not returned) so the JSON envelope
  // interceptor doesn't wrap the PDF bytes.
  @Get(':uuid/invoice')
  @UseGuards(CustomerAuthGuard)
  async invoice(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string, @Res() res: Response): Promise<void> {
    const { buffer, filename } = await this.ordersService.invoicePdf(customer.id, uuid);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${filename}"`, 'Content-Length': String(buffer.length) });
    res.end(buffer);
  }

  @Patch(':uuid/cancel')
  @UseGuards(CustomerAuthGuard)
  cancel(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('uuid') uuid: string, @Body() dto: CancelOrderDto) {
    return this.ordersService.cancel(customer.id, uuid, dto.reason);
  }
}

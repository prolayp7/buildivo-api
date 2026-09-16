import { Body, Controller, Get, Param, ParseIntPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { PaginationQueryDto } from '../../../common/dto/pagination-query.dto';
import { CustomersService } from './customers.service';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { ListCustomersQueryDto } from './dto/list-customers-query.dto';

@Controller('admin/customers')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('customers.manage')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get()
  list(@Query() query: ListCustomersQueryDto) {
    return this.customersService.list(query);
  }

  @Get('summary')
  summary() {
    return this.customersService.summary();
  }

  @Get(':id')
  detail(@Param('id', ParseIntPipe) id: number) {
    return this.customersService.detail(id);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.customersService.update(id, dto);
  }

  @Get(':id/orders')
  orders(@Param('id', ParseIntPipe) id: number, @Query() query: PaginationQueryDto) {
    return this.customersService.orders(id, query.page!, query.perPage!);
  }
}

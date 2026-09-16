import { Controller, Param, Post, UseGuards } from '@nestjs/common';
import { AdminAuthGuard } from '../../../common/admin/admin-auth.guard';
import { PermissionsGuard } from '../../../common/admin/permissions.guard';
import { RequirePermissions } from '../../../common/admin/permissions.decorator';
import { CarrierGatewaysService, DeliveryCarrier, deliveryCarriers } from './carrier-gateways.service';
import { BadRequestException } from '@nestjs/common';

@Controller('admin/shipping-gateways')
@UseGuards(AdminAuthGuard, PermissionsGuard)
@RequirePermissions('shipping.manage')
export class CarrierGatewaysController {
  constructor(private readonly gateways: CarrierGatewaysService) {}

  @Post(':carrier/test')
  test(@Param('carrier') value: string) {
    const carrier = value.toUpperCase() as DeliveryCarrier;
    if (!deliveryCarriers.includes(carrier)) throw new BadRequestException('Carrier must be FEDEX or EVRI');
    return this.gateways.test(carrier);
  }
}

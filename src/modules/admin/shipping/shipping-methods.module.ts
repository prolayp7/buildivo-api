import { Module } from '@nestjs/common';
import { ShippingMethodsController } from './shipping-methods.controller';
import { ShippingMethodsService } from './shipping-methods.service';
import { SettingsModule } from '../settings/settings.module';
import { CarrierGatewaysController } from './carrier-gateways.controller';
import { CarrierGatewaysService } from './carrier-gateways.service';
import { ShipmentsController } from './shipments.controller';
import { ShipmentsService } from './shipments.service';

@Module({
  imports: [SettingsModule],
  controllers: [ShippingMethodsController, CarrierGatewaysController, ShipmentsController],
  providers: [ShippingMethodsService, CarrierGatewaysService, ShipmentsService],
  exports: [CarrierGatewaysService],
})
export class ShippingMethodsModule {}

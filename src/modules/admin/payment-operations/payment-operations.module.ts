import { Module } from '@nestjs/common';
import { PaymentOperationsService } from './payment-operations.service';
import { PaymentsController } from './payments.controller';
import { ReturnsController } from './returns.controller';
@Module({ controllers: [ReturnsController, PaymentsController], providers: [PaymentOperationsService] })
export class PaymentOperationsModule {}

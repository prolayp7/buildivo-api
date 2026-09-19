import { Module } from '@nestjs/common';
import { PaymentsModule } from '../../payments/payments.module';
import { PaymentOperationsService } from './payment-operations.service';
import { PaymentsController } from './payments.controller';
import { ReturnsController } from './returns.controller';
import { OrderRefundsController } from './order-refunds.controller';
@Module({ imports: [PaymentsModule], controllers: [ReturnsController, PaymentsController, OrderRefundsController], providers: [PaymentOperationsService] })
export class PaymentOperationsModule {}

import { Module } from '@nestjs/common';
import { PaymentsModule } from '../../payments/payments.module';
import { ReturnsCoreModule } from '../../returns/returns-core.module';
import { PaymentOperationsService } from './payment-operations.service';
import { AdminReturnsService } from './admin-returns.service';
import { PaymentsController } from './payments.controller';
import { RefundsController, ReturnsController } from './returns.controller';
import { OrderRefundsController } from './order-refunds.controller';
@Module({ imports: [PaymentsModule, ReturnsCoreModule], controllers: [ReturnsController, RefundsController, PaymentsController, OrderRefundsController], providers: [PaymentOperationsService, AdminReturnsService] })
export class PaymentOperationsModule {}

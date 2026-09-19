import { Module } from '@nestjs/common';
import { PaymentAttemptsService } from './payment-attempts.service';
import { PaymentStateService } from './payment-state.service';
import { PaymentsController } from './payments.controller';
import { PaymentWebhooksController } from './payment-webhooks.controller';
import { PaymentWebhooksService } from './payment-webhooks.service';
import { PaymentReconciliationService } from './payment-reconciliation.service';
import { PaypalGatewayService } from './paypal-gateway.service';
import { StripeGatewayService } from './stripe-gateway.service';
import { SettingsModule } from '../admin/settings/settings.module';

@Module({
  imports: [SettingsModule],
  controllers: [PaymentsController, PaymentWebhooksController],
  providers: [PaymentAttemptsService, PaymentStateService, PaypalGatewayService, StripeGatewayService, PaymentWebhooksService, PaymentReconciliationService],
  exports: [PaymentAttemptsService, PaymentStateService, StripeGatewayService, PaypalGatewayService],
})
export class PaymentsModule {}

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { withLease } from '../../common/lease';
import { PrismaService } from '../../prisma/prisma.service';
import { PaymentAttemptsService } from './payment-attempts.service';
import { PaypalGatewayService } from './paypal-gateway.service';
import { StripeGatewayService } from './stripe-gateway.service';

const SWEEP_MS = 5 * 60 * 1000;
const SETTLE_GRACE_MS = 10 * 60 * 1000; // give the normal return/webhook path time to finish first
const GIVE_UP_MS = 24 * 60 * 60 * 1000;

/** Safety net for missed webhooks: asks the provider about attempts still unsettled
 * after the grace period and applies the outcome through the normal capture path. */
@Injectable()
export class PaymentReconciliationService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PaymentReconciliationService.name);
  private timer?: NodeJS.Timeout;

  constructor(
    private readonly prisma: PrismaService,
    private readonly attempts: PaymentAttemptsService,
    private readonly stripeGateway: StripeGatewayService,
    private readonly paypalGateway: PaypalGatewayService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setInterval(() => void this.sweep().catch((e) => this.logger.error(e)), SWEEP_MS);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Returns how many attempts were found paid at the provider and settled. */
  async sweep(): Promise<number> {
    return (await withLease(this.prisma, 727302, () => this.settlePending())) ?? 0;
  }

  private async settlePending(): Promise<number> {
    const now = Date.now();
    const pending = await this.prisma.paymentAttempt.findMany({
      where: {
        provider: { in: ['STRIPE', 'PAYPAL'] },
        status: { in: ['CREATED', 'REQUIRES_CUSTOMER_ACTION', 'PROCESSING'] },
        providerObjectId: { not: null },
        createdAt: { lt: new Date(now - SETTLE_GRACE_MS), gt: new Date(now - GIVE_UP_MS) },
      },
      select: { id: true, provider: true, providerObjectId: true },
    });
    let settled = 0;
    for (const attempt of pending) {
      try {
        if (await this.reconcile(attempt.id, attempt.provider, attempt.providerObjectId!)) settled += 1;
      } catch (error) {
        this.logger.warn(`Reconciling attempt ${attempt.id} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
    if (settled) this.logger.log(`Reconciled ${settled} payment(s) whose webhook never arrived`);
    return settled;
  }

  private async reconcile(attemptId: number, provider: string, providerObjectId: string): Promise<boolean> {
    if (provider === 'STRIPE') {
      const session = await this.stripeGateway.retrieveSession(await this.stripeGateway.secretKey(), providerObjectId);
      if (!session.paid) return false;
      await this.attempts.finalizeCapture(attemptId, { captured: true, providerTransactionId: session.paymentIntent ?? providerObjectId, paidAmount: session.paid_amount, paidCurrency: session.paid_currency });
    } else {
      const creds = await this.paypalGateway.credentials();
      const accessToken = await this.paypalGateway.accessToken(creds);
      let order = await this.paypalGateway.getOrder(creds, accessToken, providerObjectId);
      if (order.status === 'APPROVED') order = await this.paypalGateway.captureOrder(creds, accessToken, providerObjectId); // customer approved but never came back
      if (order.status !== 'COMPLETED') return false;
      await this.attempts.finalizeCapture(attemptId, { captured: true, providerTransactionId: order.captureId ?? providerObjectId, paidAmount: order.paid_amount, paidCurrency: order.paid_currency });
    }
    await this.audit.log({ action: 'payment.reconciled', entity: 'PaymentAttempt', entityId: attemptId, meta: { provider } });
    return true;
  }
}
